/**
 * MwaniMlinzi AI — demo seed.
 *
 *   npm run seed            (wipes ALL data in the configured database, then loads demo data)
 *
 * Everything created here is DEMO data (is_demo = true): cooperatives, farmers, farms and coordinates
 * are illustrative only and do not represent real farms. Environmental history comes from the DEMO
 * provider. Risk predictions, recommendations, alerts and forecasts are produced by the REAL engines.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import { ensureDefaultSettings, clearSettingsCache } from '../src/services/settingsService.js';
import { demoOcean, demoWeather } from '../src/providers/demoProfiles.js';
import { RiskService } from '../src/services/riskService.js';
import { RiskEngine } from '../src/ai/riskEngine.js';
import { ActionEngine } from '../src/ai/actionEngine.js';
import { HarvestForecastService } from '../src/services/harvestForecastService.js';
import { AlertService } from '../src/services/alertService.js';
import { harvestMetrics, feedbackTypeFor } from '../src/services/recordService.js';
import { addDays, startOfDay } from '../src/utils/dates.js';
import { seededRng, between } from '../src/providers/demoRandom.js';
import { ACTION_LIBRARY } from './data/actionLibrary.js';
import { COOPERATIVES, FARMER_NAMES, PERMISSIONS, ROLES, SPECIES } from './data/reference.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rng = seededRng('mwanimlinzi-seed-v1');
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const int = (lo, hi) => Math.floor(between(rng, lo, hi + 1));
const round = (v, dp = 1) => Math.round(v * 10 ** dp) / 10 ** dp;
const DEMO_DOMAIN = 'demo.mwanimlinzi.local';

async function wipe() {
  const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

function demoPassword() {
  if (process.env.DEMO_PASSWORD) return { password: process.env.DEMO_PASSWORD, generated: false };
  return { password: `Mwani-${crypto.randomBytes(6).toString('base64url')}9`, generated: true };
}

async function main() {
  if (env.isProduction && !process.argv.includes('--force')) {
    throw new Error('Refusing to wipe and seed a production database. Re-run with --force if you really mean it.');
  }
  const t0 = Date.now();
  console.log('[seed] wiping existing data…');
  await wipe();
  clearSettingsCache();
  await ensureDefaultSettings();

  // ── Roles & permissions ──
  const roleRows = {};
  for (const r of ROLES) roleRows[r.name] = await prisma.role.create({ data: r });
  for (const [key, roles] of Object.entries(PERMISSIONS)) {
    const perm = await prisma.permission.create({ data: { key } });
    await prisma.rolePermission.createMany({ data: roles.map((r) => ({ roleId: roleRows[r].id, permissionId: perm.id })) });
  }

  // ── Species, action library ──
  const species = {};
  for (const s of SPECIES) species[s.code] = await prisma.seaweedSpecies.create({ data: s });
  for (const a of ACTION_LIBRARY) await prisma.actionLibrary.create({ data: a });

  // ── Cooperatives ──
  const coops = [];
  for (const { center, village, ...c } of COOPERATIVES) coops.push({ ...(await prisma.cooperative.create({ data: { ...c, isDemo: true } })), center, village });

  // ── Users ──
  const { password, generated } = demoPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const mkUser = (email, fullName, roles, extra = {}) => prisma.user.create({
    data: {
      email, fullName, passwordHash, isDemo: true, consentGiven: true, consentAt: new Date(), ...extra,
      roles: { create: roles.map((r) => ({ roleId: roleRows[r].id })) },
    },
  });
  const admin = await mkUser(`admin@${DEMO_DOMAIN}`, 'Demo System Admin', ['ADMIN'], { preferredLanguage: 'en' });
  await mkUser(`cooperative@${DEMO_DOMAIN}`, 'Bi. Zawadi Mohamed (Demo Coop Manager)', ['COOPERATIVE_ADMIN'], { preferredLanguage: 'en', cooperativeId: coops[0].id, phone: '+255777100001' });
  await mkUser(`cooperative.jambiani@${DEMO_DOMAIN}`, 'Demo Jambiani Manager', ['COOPERATIVE_ADMIN'], { preferredLanguage: 'sw', cooperativeId: coops[1].id });
  await mkUser(`cooperative.kiwani@${DEMO_DOMAIN}`, 'Demo Kiwani Manager', ['COOPERATIVE_ADMIN'], { preferredLanguage: 'sw', cooperativeId: coops[2].id });
  const extension = await mkUser(`extension@${DEMO_DOMAIN}`, 'Demo Extension Officer (Mr. Hassan Ali)', ['EXTENSION_OFFICER'], { preferredLanguage: 'en', phone: '+255777200001' });
  const buyerUser = await mkUser(`buyer@${DEMO_DOMAIN}`, 'Demo Buyer (Zanzibar Seaweed Processors)', ['BUYER'], { preferredLanguage: 'en' });

  // ── Buyers & demand ──
  const buyers = [
    await prisma.buyer.create({ data: { userId: buyerUser.id, companyName: 'Demo Zanzibar Seaweed Processors Ltd', contactName: 'Demo Buyer', phone: '+255777300001', district: 'Mjini', isDemo: true } }),
    await prisma.buyer.create({ data: { companyName: 'Demo Pemba Carrageenan Traders', contactName: 'Demo Trader', district: 'Chake Chake', isDemo: true } }),
    await prisma.buyer.create({ data: { companyName: 'Demo Coastal Export Co.', contactName: 'Demo Exporter', district: 'Mjini', isDemo: true } }),
  ];
  await prisma.buyerDemand.createMany({
    data: [
      { buyerId: buyers[0].id, speciesId: species.KAPPA.id, quantityKg: 3000, pricePerKg: 1200, neededBy: addDays(new Date(), 21), minimumGrade: 'A', notes: 'Demo demand' },
      { buyerId: buyers[0].id, speciesId: species.EUCH.id, quantityKg: 5000, pricePerKg: 800, neededBy: addDays(new Date(), 35), minimumGrade: 'B', notes: 'Demo demand' },
    ],
  });

  // ── Farmers & farms ──
  // Scenario farms first so the demo farmer owns the interesting ones.
  const scenarioPlan = [
    { scenario: 'HEAT', age: 39, exposure: 'MODERATE', anchoring: 'WOODEN_STAKES', speciesCode: 'KAPPA', lines: 150, name: 'Shamba la Mwani Paje Kusini' },
    { scenario: 'NEAR_HARVEST', age: 44, exposure: 'SHELTERED', anchoring: 'WOODEN_STAKES', speciesCode: 'KAPPA', lines: 120, name: 'Shamba la Rasi Paje' },
    { scenario: 'STORM', age: 25, exposure: 'EXPOSED', anchoring: 'SAND_BAGS', speciesCode: 'EUCH', lines: 200, name: 'Shamba la Mawimbi Jambiani' },
    { scenario: 'POOR_GROWTH', age: 30, exposure: 'SHELTERED', anchoring: 'WOODEN_STAKES', speciesCode: 'KAPPA', lines: 90, name: 'Shamba la Kiwani Ghuba' },
    { scenario: 'NORMAL', age: 20, exposure: 'MODERATE', anchoring: 'CONCRETE_BLOCKS', speciesCode: 'EUCH', lines: 160, name: 'Shamba la Bwejuu' },
  ];
  const farmerRows = [];
  for (let i = 0; i < 30; i += 1) {
    const coop = i === 0 ? coops[0] : coops[i % 3];
    const isMain = i === 0;
    const user = await mkUser(isMain ? `farmer@${DEMO_DOMAIN}` : `farmer${String(i + 1).padStart(2, '0')}@${DEMO_DOMAIN}`, FARMER_NAMES[i], ['FARMER'], {
      phone: `+255777000${String(i + 1).padStart(3, '0')}`, preferredLanguage: i % 4 === 3 ? 'en' : 'sw',
    });
    const farmer = await prisma.farmer.create({ data: { userId: user.id, farmerCode: `FMR-${String(i + 1).padStart(4, '0')}`, village: coop.village, district: coop.district, region: coop.region, yearsExperience: int(1, 20), isDemo: true } });
    await prisma.cooperativeMember.create({ data: { cooperativeId: coop.id, farmerId: farmer.id, joinedAt: addDays(new Date(), -int(200, 1500)) } });
    farmerRows.push({ user, farmer, coop });
  }

  const scenarioCycle = ['NORMAL', 'NORMAL', 'HEAT', 'NORMAL', 'STORM', 'NORMAL', 'NEAR_HARVEST', 'NORMAL', 'NORMAL', 'POOR_GROWTH', 'NORMAL', 'HEAT'];
  const farms = [];
  for (let n = 1; n <= 50; n += 1) {
    const plan = scenarioPlan[n - 1];
    // Demo farmer owns FARM001 + FARM002; the rest are spread over the 30 farmers.
    const owner = n <= 2 ? farmerRows[0] : n <= 5 ? farmerRows[n - 2] : farmerRows[1 + ((n - 6) % 29)];
    const coop = n === 3 ? coops[1] : n === 4 ? coops[2] : owner.coop;
    if (n === 3 || n === 4) {
      await prisma.cooperativeMember.upsert({ where: { cooperativeId_farmerId: { cooperativeId: coop.id, farmerId: owner.farmer.id } }, update: {}, create: { cooperativeId: coop.id, farmerId: owner.farmer.id } });
    }
    const scenario = plan?.scenario || scenarioCycle[n % scenarioCycle.length];
    const sp = species[plan?.speciesCode || (rng() < 0.6 ? 'KAPPA' : 'EUCH')];
    const cycleDays = sp.typicalCycleDays;
    const age = plan?.age ?? (scenario === 'NEAR_HARVEST' ? cycleDays - int(0, 2) : scenario === 'HEAT' ? int(28, 40) : int(4, 38));
    const lines = plan?.lines ?? int(60, 220);
    // Farms sit offshore in the lagoon east of each village (Pemba: west).
    const [clat, clon] = coop.center;
    const lat = round(clat + between(rng, -0.025, 0.025), 5);
    const lon = round(clon + (coop.code === 'KIWANI' ? -1 : 1) * between(rng, 0.004, 0.018), 5);
    const farm = await prisma.farm.create({
      data: {
        farmCode: `FARM${String(n).padStart(3, '0')}`,
        name: plan?.name || `Demo Farm ${String(n).padStart(3, '0')} ${coop.village}`,
        farmerId: owner.farmer.id,
        cooperativeId: coop.id,
        speciesId: sp.id,
        farmingMethod: rng() < 0.8 ? 'OFF_BOTTOM' : 'LONG_LINE',
        exposure: plan?.exposure || (scenario === 'STORM' ? 'EXPOSED' : pick(['SHELTERED', 'MODERATE', 'MODERATE', 'EXPOSED'])),
        anchoringMethod: plan?.anchoring || pick(['WOODEN_STAKES', 'WOODEN_STAKES', 'SAND_BAGS', 'CONCRETE_BLOCKS', 'ROCKS']),
        areaHectares: round(lines * 0.0012, 3),
        lineCount: lines,
        status: 'ACTIVE',
        demoScenario: scenario,
        isDemo: true,
        notes: 'DEMO farm — location and data are illustrative, not a real farm.',
        location: { create: { latitude: lat, longitude: lon, locationName: `${coop.village} lagoon (demo)`, district: coop.district, region: coop.region, waterDepthM: round(between(rng, 0.5, 2.5), 1) } },
      },
      include: { location: true, species: true, farmer: { include: { user: true } } },
    });
    farms.push({ ...farm, scenario, age, lines, coop, owner });
  }

  // ── Past cycles: harvests, losses, quality, drying (history for learning + forecasts) ──
  let pastPredictions = 0;
  const library = await prisma.actionLibrary.findMany();
  for (const farm of farms) {
    const pastCount = farm.farmCode === 'FARM001' ? 3 : int(1, 3);
    for (let k = pastCount; k >= 1; k -= 1) {
      const planted = addDays(startOfDay(), -farm.age - k * (farm.species.typicalCycleDays + 10));
      const expected = addDays(planted, farm.species.typicalCycleDays);
      // FARM001's history is kept clean so the demo shows risk driven by current conditions.
      const lossCause = farm.farmCode !== 'FARM001' && rng() < 0.3 ? pick(['ICE_ICE', 'ICE_ICE', 'STORM', 'EPIPHYTES']) : null;
      const lossPct = lossCause ? round(between(rng, 10, 45), 0) : 0;
      const failed = lossPct > 40 && rng() < 0.3;
      const cycle = await prisma.plantingCycle.create({ data: { farmId: farm.id, plantingDate: planted, expectedHarvestDate: expected, linesPlanted: farm.lines, status: failed ? 'FAILED' : 'HARVESTED', isDemo: true } });
      const estimate = farm.lines * farm.species.yieldKgDryPerLine * (farm.scenario === 'POOR_GROWTH' ? 0.95 : 1);
      if (lossCause) {
        await prisma.lossRecord.create({ data: { farmId: farm.id, plantingCycleId: cycle.id, lossDate: addDays(expected, -int(3, 12)), cause: lossCause, percentLost: lossPct, quantityKg: round(estimate * lossPct / 100, 0), notes: 'Demo loss record', isDemo: true } });
      }
      if (!failed) {
        const growthFactor = farm.scenario === 'POOR_GROWTH' ? between(rng, 0.78, 0.86) : between(rng, 0.85, 1.08);
        const actual = round(estimate * growthFactor * (1 - lossPct / 100), 0);
        const grade = lossPct > 25 ? 'C' : rng() < 0.7 ? 'A' : 'B';
        const dryingMethod = pick(['RACK', 'RACK', 'TARPAULIN', 'ROPE_HANGING']);
        const price = pick([800, 900, 1000, 1100, 1200]);
        const h = await prisma.harvestRecord.create({
          data: {
            farmId: farm.id, plantingCycleId: cycle.id, buyerId: pick(buyers).id, harvestDate: addDays(expected, int(0, 3)), estimatedQuantity: round(estimate, 0),
            actualQuantity: actual, unit: 'KG_DRY', qualityGrade: grade, dryingMethod, dryingDurationDays: int(2, 5), pricePerKg: price, notes: 'Demo harvest record', channel: 'SEED', isDemo: true,
            ...harvestMetrics({ estimatedQuantity: round(estimate, 0), actualQuantity: actual, pricePerKg: price }),
          },
        });
        await prisma.qualityRecord.create({ data: { farmId: farm.id, harvestRecordId: h.id, grade, moisturePercent: round(between(rng, 30, 38), 1), impurityPercent: round(between(rng, 1, 5), 1) } });
        await prisma.dryingRecord.create({ data: { farmId: farm.id, harvestRecordId: h.id, method: dryingMethod, startDate: h.harvestDate, durationDays: h.dryingDurationDays, groundContact: false, rainDuringDrying: rng() < 0.2 } });
      }

      // Historical prediction → recommendation → action → outcome, labelled with what really happened
      // in this demo history. This is the feedback-loop data used for field evaluation.
      if (k === 1 && rng() < 0.6) {
        const at = addDays(expected, -int(8, 15));
        const env0 = { ...demoOcean({ latitude: farm.location.latitude, longitude: farm.location.longitude, profile: lossCause === 'ICE_ICE' ? 'HEAT' : lossCause === 'STORM' ? 'STORM' : 'NORMAL', at: new Date() }), ...demoWeather({ latitude: farm.location.latitude, longitude: farm.location.longitude, profile: lossCause === 'STORM' ? 'STORM' : 'NORMAL', at: new Date() }) };
        const ctx = {
          farm: { ...farm, species: farm.species }, cycle, cropAgeDays: Math.round((at - planted) / 86400000), expectedCycleDays: farm.species.typicalCycleDays,
          environment: { ...env0, sstAnomalyDays: lossCause === 'ICE_ICE' ? int(3, 8) : 0, sstTrend7d: 0, source: 'DEMO' },
          recentObservation: lossCause === 'ICE_ICE' && rng() < 0.6 ? { whitening: true, cropCondition: 'FAIR', percentAffected: 10, ageDays: 1 } : { cropCondition: 'GOOD', ageDays: 2 },
          history: { pastCycles: pastCount - k, iceIceLossRate: 0, stormLossRate: 0 },
        };
        const r = await RiskEngine.calculateFarmRisk(ctx, {});
        const rt = lossCause === 'STORM' ? 'STORM_LINE_DAMAGE' : 'HEAT_ICE_ICE';
        const risk = r.risks[rt];
        const action = ActionEngine.select(risk, r.features, library);
        const pred = await prisma.riskPrediction.create({
          data: {
            farmId: farm.id, plantingCycleId: cycle.id, riskType: rt, probability: risk.probability, riskLevel: risk.level, confidence: risk.confidence,
            forecastHorizonHours: risk.horizonHours, modelType: 'RULE', modelVersion: risk.modelVersion, ruleProbability: risk.ruleProbability,
            features: { ...r.features, __insufficientData: false }, explanation: risk.explanation, explanationSw: risk.explanationSw, dataSource: 'DEMO', trigger: 'SEED', isDemo: true, createdAt: at,
            factors: { create: risk.factors.map(({ code, label, labelSw, value, contribution, direction }) => ({ code, label, labelSw, value, contribution, direction })) },
          },
        });
        pastPredictions += 1;
        if (action) {
          const rec = await prisma.actionRecommendation.create({ data: { farmId: farm.id, predictionId: pred.id, actionLibraryId: action.id, status: 'COMPLETED', dueBy: addDays(at, 1), isDemo: true, createdAt: at } });
          const taken = rng() < 0.8;
          const fa = await prisma.farmerAction.create({ data: { farmId: farm.id, recommendationId: rec.id, userId: farm.owner.user.id, actionTaken: taken, description: action.action, performedAt: addDays(at, 1), channel: 'SEED', isDemo: true } });
          const materialized = (rt === 'HEAT_ICE_ICE' && lossCause === 'ICE_ICE') || (rt === 'STORM_LINE_DAMAGE' && lossCause === 'STORM');
          const outcome = await prisma.actionOutcome.create({
            data: {
              farmId: farm.id, farmerActionId: fa.id, recommendationId: rec.id, predictionId: pred.id,
              outcomeType: !materialized ? 'NO_LOSS' : lossPct >= 30 ? 'MAJOR_LOSS' : 'MINOR_LOSS', lossPercent: materialized ? lossPct : 0,
              riskMaterialized: materialized, outcomeDate: addDays(at, 10), notes: 'Demo outcome', isDemo: true,
            },
          });
          await prisma.modelFeedback.create({ data: { riskPredictionId: pred.id, userId: farm.owner.user.id, feedbackType: feedbackTypeFor(risk.level, materialized), notes: `Demo outcome ${outcome.id}` } });
        }
      }
    }

    // ── Active cycle ──
    const plantingDate = addDays(startOfDay(), -farm.age);
    await prisma.plantingCycle.create({ data: { farmId: farm.id, plantingDate, expectedHarvestDate: addDays(plantingDate, farm.species.typicalCycleDays), linesPlanted: farm.lines, seedQuantityKg: round(farm.lines * 1.5, 0), isDemo: true } });
  }

  // ── 14 days of demo environmental history per farm (DEMO provider, clearly labelled) ──
  for (const farm of farms) {
    for (let d = 14; d >= 1; d -= 1) {
      const at = addDays(new Date(), -d);
      const loc = { latitude: farm.location.latitude, longitude: farm.location.longitude, profile: farm.scenario, at };
      const o = demoOcean(loc);
      const w = demoWeather(loc);
      const wRow = await prisma.weatherObservation.create({ data: { latitude: loc.latitude, longitude: loc.longitude, observedAt: at, source: 'DEMO', provider: 'demo-weather', ...pickW(w), isDemo: true, createdAt: at } });
      const oRow = await prisma.oceanObservation.create({ data: { latitude: loc.latitude, longitude: loc.longitude, observedAt: at, source: 'DEMO', provider: 'demo-ocean', ...pickO(o), isDemo: true, createdAt: at } });
      await prisma.environmentalObservation.create({
        data: {
          farmId: farm.id, observedAt: at, source: 'DEMO', weatherSource: 'DEMO', oceanSource: 'DEMO', weatherObservationId: wRow.id, oceanObservationId: oRow.id,
          ...pickO(o), airTemperatureC: w.airTemperatureC, rainfallMm: w.rainfallMm, windSpeedKmh: w.windSpeedKmh, windDirectionDeg: w.windDirectionDeg, humidityPct: w.humidityPct, weatherCondition: w.condition,
          sstAnomalyDays: null, isDemo: true, createdAt: at,
        },
      });
    }
  }

  // ── Observations (scenario-specific; some farms deliberately have no recent report) ──
  const observationFor = (scenario, farm) => {
    switch (scenario) {
      case 'HEAT': return farm.farmCode !== 'FARM001' && rng() < 0.5 ? { cropCondition: 'GOOD', notes: 'Water feels warm, crop OK so far (demo).' } : { cropCondition: 'FAIR', whitening: true, percentAffected: 5, notes: 'Some tips turning white on a few lines (demo).', waterAppearance: 'CLEAR', lineCondition: 'GOOD', anchorCondition: 'GOOD' };
      case 'STORM': return { cropCondition: 'GOOD', lineCondition: 'GOOD', anchorCondition: 'GOOD', notes: 'Lines fine, water getting rough (demo).' };
      case 'POOR_GROWTH': return { cropCondition: 'FAIR', unusualGrowth: false, growthCondition: 'SLOW', waterAppearance: 'CLEAR', notes: 'Growth slower than last season (demo).' };
      case 'NEAR_HARVEST': return { cropCondition: 'GOOD', notes: 'Seaweed looks big and healthy (demo).' };
      default: return { cropCondition: 'GOOD', notes: 'Normal (demo).' };
    }
  };
  for (const [i, farm] of farms.entries()) {
    const older = addDays(new Date(), -int(15, 25));
    await prisma.farmObservation.create({ data: { farmId: farm.id, reporterId: farm.owner.user.id, observedAt: older, cropCondition: 'GOOD', confidence: 'MEDIUM', channel: 'SEED', reviewStatus: 'REVIEWED', reviewedById: extension.id, reviewedAt: older, isDemo: true, notes: 'Routine check (demo).' } });
    const skipRecent = farm.scenario === 'NORMAL' && i % 4 === 1; // → missing-report alerts
    if (skipRecent) continue;
    const recent = addDays(new Date(), -(farm.scenario === 'NORMAL' ? int(2, 9) : int(1, 3)));
    const obs = await prisma.farmObservation.create({ data: { farmId: farm.id, reporterId: farm.owner.user.id, observedAt: recent, confidence: 'MEDIUM', channel: 'SEED', isDemo: true, ...observationFor(farm.scenario, farm) } });
    if (obs.whitening) await prisma.diseaseObservation.create({ data: { observationId: obs.id, farmId: farm.id, diseaseType: 'ICE_ICE', severity: 'MEDIUM', percentAffected: obs.percentAffected } });
  }

  // ── Run the REAL AI pipeline for every farm: environment → risk → action → alerts ──
  console.log('[seed] running risk engine for 50 farms…');
  for (const farm of farms) await RiskService.runForFarm(farm.id, { trigger: 'SEED' });
  await AlertService.checkMissingReports();
  await HarvestForecastService.generate();
  await prisma.riskPrediction.updateMany({ data: { isDemo: true } });
  await prisma.alert.updateMany({ data: { isDemo: true } });
  await prisma.actionRecommendation.updateMany({ data: { isDemo: true } });

  // ── Extension notes ──
  for (const farm of farms.filter((f) => f.scenario !== 'NORMAL').slice(0, 6)) {
    await prisma.extensionNote.create({ data: { farmId: farm.id, authorId: extension.id, note: `Demo note: visited ${farm.farmCode}, discussed ${farm.scenario.toLowerCase().replace('_', ' ')} signs with the farmer.`, visitPriority: farm.scenario === 'NORMAL' ? 'LOW' : 'HIGH', createdAt: addDays(new Date(), -int(8, 20)) } });
  }

  await prisma.auditLog.create({ data: { userId: admin.id, action: 'SEED', entityType: 'System', details: { farms: farms.length, demo: true } } });

  // ── Summary ──
  const counts = {
    cooperatives: await prisma.cooperative.count(), farmers: await prisma.farmer.count(), farms: await prisma.farm.count(),
    plantingCycles: await prisma.plantingCycle.count(), environmentalObservations: await prisma.environmentalObservation.count(),
    observations: await prisma.farmObservation.count(), riskPredictions: await prisma.riskPrediction.count(), recommendations: await prisma.actionRecommendation.count(),
    alerts: await prisma.alert.count(), harvests: await prisma.harvestRecord.count(), losses: await prisma.lossRecord.count(),
    outcomes: await prisma.actionOutcome.count(), forecasts: await prisma.harvestForecast.count(), actionLibrary: await prisma.actionLibrary.count(),
  };
  const levels = await prisma.$queryRaw`SELECT DISTINCT ON (f.farm_code, p.risk_type) f.farm_code, p.risk_type, p.risk_level, round(p.probability::numeric, 2) AS p
    FROM risk_predictions p JOIN farms f ON f.id = p.farm_id WHERE f.farm_code IN ('FARM001','FARM002','FARM003','FARM004','FARM005') AND p.is_simulation = false
    ORDER BY f.farm_code, p.risk_type, p.created_at DESC`;
  console.log('[seed] counts:', counts, `(historical predictions: ${pastPredictions})`);
  console.log('[seed] scenario farms:');
  const table = {};
  for (const l of levels) { table[l.farm_code] ||= {}; table[l.farm_code][l.risk_type] = `${l.risk_level} ${l.p}`; }
  console.table(table);

  const creds = [
    'MwaniMlinzi AI — DEMO accounts (local development only)',
    `Password for all demo accounts: ${password}`,
    '',
    ...['farmer', 'cooperative', 'extension', 'buyer', 'admin'].map((r) => `${r.padEnd(12)} ${r}@${DEMO_DOMAIN}`),
    '',
    "Demo farmer phone (login, Africa's Talking sandbox SMS/USSD): +255777000001  farms: FARM001 (heat risk), FARM002 (near harvest)",
  ].join('\n');
  if (!env.isTest) fs.writeFileSync(path.join(here, '..', 'DEMO_CREDENTIALS.local.txt'), `${creds}\n`, { mode: 0o600 });
  console.log(`\n${creds}\n`);
  if (generated) console.log('[seed] A random demo password was generated (set DEMO_PASSWORD in .env to choose one). Saved to backend/DEMO_CREDENTIALS.local.txt');
  console.log(`[seed] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const pickW = (w) => ({ airTemperatureC: w.airTemperatureC, rainfallMm: w.rainfallMm, windSpeedKmh: w.windSpeedKmh, windDirectionDeg: w.windDirectionDeg, humidityPct: w.humidityPct, condition: w.condition });
const pickO = (o) => ({ seaSurfaceTempC: o.seaSurfaceTempC, sstAnomalyC: o.sstAnomalyC, waveHeightM: o.waveHeightM, currentVelocityMs: o.currentVelocityMs, salinityPsu: o.salinityPsu, chlorophyllMgM3: o.chlorophyllMgM3 });

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
