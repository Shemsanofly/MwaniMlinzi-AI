#!/usr/bin/env node
/**
 * Trains one logistic-regression model per risk type.
 *
 *   node ai/scripts/trainModel.js [--dataset path.json] [--include-field] [--activate] [--no-db]
 *   (or from backend/: npm run ai:train -- --activate)
 *
 * Pipeline: 1 load → 2 validate → 3 preprocess → 4 train → 5 evaluate (held-out 20%)
 *           → 6 save model JSON → 7 save metrics → 8 register model version in PostgreSQL.
 *
 * Metrics are computed on the held-out split only. When the dataset is synthetic the model
 * and its metrics are labelled `syntheticData: true`; they say nothing about real-world accuracy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ML_FEATURES, toVector } from '../../backend/src/ai/ml/featureVector.js';
import { train, predictProba } from '../../backend/src/ai/ml/logisticRegression.js';
import { evaluate } from '../../backend/src/ai/ml/metrics.js';
import { mulberry32 } from '../../backend/src/providers/demoRandom.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');
const MODELS_DIR = path.join(REPO, 'ai', 'models');
const RISK_TYPES = ['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW'];
const flag = (n) => process.argv.includes(`--${n}`);
const arg = (n, def) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : def; };

async function loadDb() {
  if (flag('no-db')) return null;
  try {
    process.chdir(path.join(REPO, 'backend')); // so backend/.env is found
    const { prisma } = await import('../../backend/src/config/prisma.js');
    await prisma.$queryRaw`SELECT 1`;
    return prisma;
  } catch (err) {
    console.warn(`[train] database unavailable (${err.message.split('\n')[0]}) — models will be saved to disk but not registered.`);
    return null;
  }
}

/** Field data: stored prediction features labelled by recorded outcomes (the feedback loop). */
async function loadFieldRecords(prisma) {
  const rows = await prisma.actionOutcome.findMany({
    where: { riskMaterialized: { not: null }, prediction: { isSimulation: false } },
    include: { prediction: { select: { riskType: true, features: true, isDemo: true } } },
  });
  return rows.filter((r) => r.prediction).map((r) => ({
    id: `FIELD-${r.id}`,
    synthetic_demo_data: false,
    demo: r.prediction.isDemo,
    features: r.prediction.features,
    labels: { [r.prediction.riskType]: r.riskMaterialized ? 1 : 0 },
  }));
}

function validateRecords(records, riskType) {
  const valid = [];
  let dropped = 0;
  for (const r of records) {
    const label = r.labels?.[riskType];
    const featuresOk = r.features && ML_FEATURES.every((f) => r.features[f] === null || r.features[f] === undefined || Number.isFinite(Number(r.features[f])));
    if ((label === 0 || label === 1) && featuresOk) valid.push(r); else dropped += 1;
  }
  return { valid, dropped };
}

function stratifiedSplit(records, riskType, testShare, seed) {
  const rand = mulberry32(seed);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pos = shuffle(records.filter((r) => r.labels[riskType] === 1));
  const neg = shuffle(records.filter((r) => r.labels[riskType] === 0));
  const cut = (a) => Math.round(a.length * testShare);
  return { test: [...pos.slice(0, cut(pos)), ...neg.slice(0, cut(neg))], train: [...pos.slice(cut(pos)), ...neg.slice(cut(neg))] };
}

async function main() {
  const datasetPath = path.resolve(arg('dataset', path.join(REPO, 'ai', 'datasets', 'synthetic_seaweed_dataset.json')));
  // 1. Load
  if (!fs.existsSync(datasetPath)) {
    console.error(`[train] dataset not found: ${datasetPath}\n        Run: npm run ai:dataset`);
    process.exit(1);
  }
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  let records = dataset.records || [];
  const synthetic = records.some((r) => r.synthetic_demo_data !== false);
  const prisma = await loadDb();
  let minRecords = 300;
  if (prisma) {
    const s = await prisma.systemSetting.findUnique({ where: { key: 'ai.minTrainingRecords' } });
    if (s) minRecords = Number(s.value) || minRecords;
    if (flag('include-field')) {
      const field = await loadFieldRecords(prisma);
      console.log(`[train] + ${field.length} field outcome records from PostgreSQL (${field.filter((f) => f.demo).length} are demo-seeded)`);
      records = records.concat(field);
    }
  }
  console.log(`[train] loaded ${records.length} records from ${path.relative(REPO, datasetPath)}${synthetic ? ' (SYNTHETIC DEMO DATA)' : ''}`);

  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const summary = [];
  for (const riskType of RISK_TYPES) {
    // 2. Validate
    const { valid, dropped } = validateRecords(records, riskType);
    const positives = valid.filter((r) => r.labels[riskType] === 1).length;
    if (valid.length < minRecords || positives < 20 || valid.length - positives < 20) {
      console.warn(`[train] ${riskType}: insufficient data (${valid.length} valid, ${positives} positive; need ≥${minRecords} and ≥20 per class). Rule engine remains in use.`);
      summary.push({ riskType, status: 'SKIPPED_INSUFFICIENT_DATA', records: valid.length, positives });
      continue;
    }
    // 3. Preprocess (imputation + standardisation happen inside toVector/train)
    const { train: tr, test: te } = stratifiedSplit(valid, riskType, 0.2, 1234);
    const Xtr = tr.map((r) => toVector(r.features));
    const ytr = tr.map((r) => r.labels[riskType]);
    // 4. Train
    const model = train(Xtr, ytr, { epochs: 1500, learningRate: 0.2, l2: 0.001 });
    // 5. Evaluate on held-out data
    const probs = te.map((r) => predictProba(model, toVector(r.features)));
    const metrics = evaluate(te.map((r) => r.labels[riskType]), probs, 0.5);

    // 6. Save model
    let version = 'v1';
    if (prisma) {
      const n = await prisma.mlModel.count({ where: { riskType } });
      version = `v${n + 1}`;
    } else {
      const existing = fs.readdirSync(MODELS_DIR).filter((f) => f.startsWith(`${riskType}_`) && f.endsWith('.json'));
      version = `v${existing.length + 1}`;
    }
    const fileName = `${riskType}_${version}.json`;
    const trainedAt = new Date().toISOString();
    const artifact = {
      name: `mwanimlinzi-${riskType.toLowerCase()}`, riskType, version, algorithm: 'logistic_regression_gd_l2_balanced',
      featureNames: ML_FEATURES, weights: model.weights, bias: model.bias, means: model.means, stds: model.stds,
      trainedAt, trainingRecords: tr.length, testRecords: te.length, syntheticData: synthetic, dataset: path.basename(datasetPath),
      metrics, note: synthetic ? 'Trained on SYNTHETIC demo data. Metrics describe fit to the synthetic process only, not real-world accuracy.' : 'Trained on field data.',
    };
    fs.writeFileSync(path.join(MODELS_DIR, fileName), JSON.stringify(artifact, null, 2));
    // 7. Save metrics
    fs.writeFileSync(path.join(MODELS_DIR, `${riskType}_${version}.metrics.json`), JSON.stringify({ riskType, version, trainedAt, syntheticData: synthetic, trainingRecords: tr.length, testRecords: te.length, metrics }, null, 2));

    // 8. Register model version
    let status = 'TRAINED';
    if (prisma) {
      const activate = flag('activate');
      if (activate) await prisma.mlModel.updateMany({ where: { riskType, status: 'ACTIVE' }, data: { status: 'TRAINED' } });
      status = activate ? 'ACTIVE' : 'TRAINED';
      const row = await prisma.mlModel.create({
        data: {
          name: artifact.name, version, riskType, algorithm: artifact.algorithm, status, trainedAt: new Date(trainedAt),
          trainingRecords: tr.length, testRecords: te.length, syntheticData: synthetic, featureNames: ML_FEATURES,
          filePath: path.posix.join('ai', 'models', fileName), notes: artifact.note,
        },
      });
      const details = { confusionMatrix: metrics.confusionMatrix, support: metrics.support, threshold: metrics.threshold, positiveRate: metrics.positiveRate };
      await prisma.modelMetric.createMany({ data: ['precision', 'recall', 'f1', 'accuracy', 'rocAuc'].map((metric) => ({ modelId: row.id, dataset: 'TEST', metric, value: metrics[metric], details })) });
    }
    console.log(`[train] ${riskType} ${version} (${status}) — test n=${te.length}: precision=${metrics.precision} recall=${metrics.recall} F1=${metrics.f1} accuracy=${metrics.accuracy} AUC=${metrics.rocAuc} CM=${JSON.stringify(metrics.confusionMatrix)}`);
    summary.push({ riskType, version, status, ...metrics });
  }
  fs.writeFileSync(path.join(MODELS_DIR, 'last_training_summary.json'), JSON.stringify({ trainedAt: new Date().toISOString(), synthetic, summary }, null, 2));
  if (synthetic) console.log('[train] NOTE: trained on SYNTHETIC data — use for demonstrating the ML pipeline only.');
  if (prisma && !flag('activate')) console.log('[train] Models registered as TRAINED. Activate in Admin → Models, or re-run with --activate.');
  if (prisma) await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[train] failed:', err);
  process.exit(1);
});
