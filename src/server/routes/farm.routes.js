import { Router } from 'express';
import * as c from '../controllers/farmController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as s from '../validators/schemas.js';

const r = Router();
r.use(authenticate);

// Farm owners see their own farms; administrators see all farms.
// Writing (observations, harvests, actions) stays owner-only to keep farmer-reported data authored by farmers.
const farmViewers = authorize('FARMER', 'ADMIN');
const recorders = authorize('FARMER', 'ADMIN');

r.get('/', farmViewers, c.listFarms);
r.post('/', authorize('FARMER', 'ADMIN'), validate(s.farmSchema), c.createFarm);
r.get('/predictions/:predictionId', farmViewers, c.latestPrediction);
r.get('/:id', farmViewers, c.getFarm);
r.patch('/:id', recorders, validate(s.farmUpdateSchema, 'body', { partial: true }), c.updateFarm);

r.get('/:id/cycles', farmViewers, c.listCycles);
r.post('/:id/cycles', recorders, validate(s.cycleSchema), c.createCycle);
r.patch('/:id/cycles/:cycleId', recorders, validate(s.cycleUpdateSchema), c.updateCycle);

r.get('/:id/observations', farmViewers, c.listObservations);
r.post('/:id/observations', recorders, validate(s.observationSchema), c.createObservation);

r.get('/:id/harvests', farmViewers, c.listHarvests);
r.post('/:id/harvests', recorders, validate(s.harvestSchema), c.createHarvest);

r.get('/:id/losses', farmViewers, c.listLosses);
r.post('/:id/losses', recorders, validate(s.lossSchema), c.createLoss);

r.get('/:id/records/summary', farmViewers, c.recordSummary);
for (const [kind, schema] of [['sales', s.saleSchema], ['costs', s.costSchema], ['work', s.workSchema]]) {
  r.get(`/:id/${kind}`, farmViewers, c.listRecords(kind));
  r.post(`/:id/${kind}`, recorders, validate(schema), c.createRecord(kind));
  r.delete(`/:id/${kind}/:recordId`, recorders, c.deleteRecord(kind));
}

r.get('/:id/risks', farmViewers, c.getRisks);
r.get('/:id/intelligence', farmViewers, c.farmIntelligence);
r.post('/:id/risks/run', farmViewers, c.runRisks);
r.get('/:id/risks/history', farmViewers, c.riskHistory);

r.get('/:id/recommendations', farmViewers, c.listRecommendations);
r.patch('/:id/recommendations/:recId', recorders, validate(s.recommendationUpdateSchema), c.updateRecommendation);

r.get('/:id/actions', farmViewers, c.listActions);
r.post('/:id/actions', recorders, validate(s.farmerActionSchema), c.createAction);

r.get('/:id/outcomes', farmViewers, c.listOutcomes);
r.post('/:id/outcomes', recorders, validate(s.outcomeSchema), c.createOutcome);

r.get('/:id/history', farmViewers, c.farmHistoryTimeline);
r.get('/:id/environment', farmViewers, c.farmEnvironment);
r.get('/:id/outlook', farmViewers, c.farmOutlook);
r.get('/:id/alerts', farmViewers, c.farmAlerts);

r.get('/:id/notes', farmViewers, c.listNotes);
r.post('/:id/notes', authorize('ADMIN'), validate(s.extensionNoteSchema), c.createNote);

export default r;
