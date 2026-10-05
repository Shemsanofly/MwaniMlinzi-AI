#!/usr/bin/env node
import { events } from '../../src/server/db/records.js';
import { loadFieldRecords } from '../../src/server/ai/fieldTrainingData.js';
/**
 * Trains one logistic-regression model per risk type from REAL field outcomes only.
 *
 *   node ai/scripts/trainModel.js [--activate]
 *   (or from backend/: npm run ai:train -- --activate)
 *
 * Training data = stored risk predictions (their input features) labelled by what farmers later
 * reported (action outcomes: did the risk materialise?). Nothing is generated or invented.
 *
 * Pipeline: 1 load field outcomes → 2 validate → 3 preprocess → 4 train → 5 evaluate (held-out 20%)
 *           → 6 save model JSON → 7 save metrics → 8 register model version in PostgreSQL.
 *
 * A risk type is only trained when it has at least `ai.minTrainingRecords` outcomes (Admin → Settings)
 * and ≥20 of each class; otherwise the rule-based engine stays in use for it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ML_FEATURES, toVector } from '../../src/server/ai/ml/featureVector.js';
import { train, predictProba } from '../../src/server/ai/ml/logisticRegression.js';
import { evaluate } from '../../src/server/ai/ml/metrics.js';
import { mulberry32 } from '../../src/server/utils/random.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..');
const MODELS_DIR = path.join(REPO, 'ai', 'models');
const RISK_TYPES = ['HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW'];
const flag = (n) => process.argv.includes(`--${n}`);

async function loadDb() {
  process.chdir(path.join(REPO, 'backend')); // so backend/.env is found
  const { prisma } = await import('../../src/server/config/prisma.js');
  await prisma.$queryRaw`SELECT 1`;
  return prisma;
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
  // 1. Load recorded field outcomes
  const prisma = await loadDb();
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'ai.minTrainingRecords' } });
  const minRecords = Number(setting?.value) || 300;
  const records = await loadFieldRecords(prisma);
  console.log(`[train] loaded ${records.length} field outcome records from PostgreSQL`);

  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const summary = [];
  for (const riskType of RISK_TYPES) {
    // 2. Validate
    const { valid } = validateRecords(records, riskType);
    const positives = valid.filter((r) => r.labels[riskType] === 1).length;
    if (valid.length < minRecords || positives < 20 || valid.length - positives < 20) {
      console.warn(`[train] ${riskType}: not enough field outcomes yet (${valid.length} valid, ${positives} positive; need ≥${minRecords} and ≥20 per class). Rule engine remains in use.`);
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
    const version = `v${(await prisma.mlModel.count({ where: { riskType } })) + 1}`;
    const fileName = `${riskType}_${version}.json`;
    const trainedAt = new Date().toISOString();
    const artifact = {
      name: `mwanimlinzi-${riskType.toLowerCase()}`, riskType, version, algorithm: 'logistic_regression_gd_l2_balanced',
      featureNames: ML_FEATURES, weights: model.weights, bias: model.bias, means: model.means, stds: model.stds,
      trainedAt, trainingRecords: tr.length, testRecords: te.length, syntheticData: false, dataset: 'field-outcomes',
      metrics, note: `Trained on ${tr.length} recorded field outcomes; evaluated on ${te.length} held-out outcomes.`,
    };
    fs.writeFileSync(path.join(MODELS_DIR, fileName), JSON.stringify(artifact, null, 2));
    // 7. Save metrics
    fs.writeFileSync(path.join(MODELS_DIR, `${riskType}_${version}.metrics.json`), JSON.stringify({ riskType, version, trainedAt, trainingRecords: tr.length, testRecords: te.length, metrics }, null, 2));

    // 8. Register model version
    const activate = flag('activate');
    if (activate) await prisma.mlModel.updateMany({ where: { riskType, status: 'ACTIVE' }, data: { status: 'TRAINED' } });
    const status = activate ? 'ACTIVE' : 'TRAINED';
    const row = await prisma.mlModel.create({
      data: {
        name: artifact.name, version, riskType, algorithm: artifact.algorithm, status, trainedAt: new Date(trainedAt),
        trainingRecords: tr.length, testRecords: te.length, syntheticData: false, featureNames: ML_FEATURES,
        filePath: path.posix.join('ai', 'models', fileName), notes: artifact.note,
      },
    });
    const details = { confusionMatrix: metrics.confusionMatrix, support: metrics.support, threshold: metrics.threshold, positiveRate: metrics.positiveRate };
    await events(prisma, 'METRIC').createMany({ data: ['precision', 'recall', 'f1', 'accuracy', 'rocAuc'].map((metric) => ({ modelId: row.id, dataset: 'TEST', metric, value: metrics[metric], details })) });
    console.log(`[train] ${riskType} ${version} (${status}) — test n=${te.length}: precision=${metrics.precision} recall=${metrics.recall} F1=${metrics.f1} accuracy=${metrics.accuracy} AUC=${metrics.rocAuc} CM=${JSON.stringify(metrics.confusionMatrix)}`);
    summary.push({ riskType, version, status, ...metrics });
  }
  fs.writeFileSync(path.join(MODELS_DIR, 'last_training_summary.json'), JSON.stringify({ trainedAt: new Date().toISOString(), source: 'field-outcomes', summary }, null, 2));
  if (!flag('activate') && summary.some((m) => m.status === 'TRAINED')) console.log('[train] Models registered as TRAINED. Activate in Admin → Models, or re-run with --activate.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[train] failed:', err);
  process.exit(1);
});
