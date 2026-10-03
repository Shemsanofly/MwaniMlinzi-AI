import { farmRecords, events } from '../../src/db/records.js';
import { api, auth, login, farmByCode } from '../helpers.js';
import prisma from '../../src/config/prisma.js';

afterAll(() => prisma.$disconnect());

const today = () => new Date().toISOString().slice(0, 10);

describe('record book: sales, costs, work and profit per cycle', () => {
  let farmer; let admin; let farm; let foreign;

  beforeAll(async () => {
    farmer = await login('farmer');
    admin = await login('admin');
    farm = await farmByCode(farmer, 'FARM002'); // fixture farm near harvest, owned by the fixture farmer
    foreign = await farmByCode(admin, 'FARM003'); // another farmer's farm
    // Other suites (e.g. USSD) also record on FARM002: start this suite from an empty record book.
    await Promise.all([farmRecords(prisma, 'SALE').deleteMany({ where: { farmId: farm.id } }), farmRecords(prisma, 'COST').deleteMany({ where: { farmId: farm.id } }), farmRecords(prisma, 'WORK').deleteMany({ where: { farmId: farm.id } })]);
  });

  test('a sale is stored with its total, assigned to the current cycle, and listed', async () => {
    const res = await api().post(`/api/farms/${farm.id}/sales`).set(auth(farmer))
      .send({ saleDate: today(), quantityKg: 120, pricePerKg: 1000, buyerName: 'Mwanaidi Traders', paymentStatus: 'PENDING' });
    expect(res.status).toBe(201);
    const cycle = await prisma.plantingCycle.findFirst({ where: { farmId: farm.id, status: 'ACTIVE' } });
    expect(res.body.data.sale).toMatchObject({ quantityKg: 120, pricePerKg: 1000, totalTzs: 120000, paymentStatus: 'PENDING', plantingCycleId: cycle.id, channel: 'APP' });
    const list = await api().get(`/api/farms/${farm.id}/sales`).set(auth(farmer));
    expect(list.body.data.sales.some((s) => s.id === res.body.data.sale.id)).toBe(true);
  });

  test('costs and work are stored; invalid amounts and categories are rejected', async () => {
    expect((await api().post(`/api/farms/${farm.id}/costs`).set(auth(farmer)).send({ costDate: today(), category: 'SEEDLINGS', amountTzs: 30000 })).status).toBe(201);
    expect((await api().post(`/api/farms/${farm.id}/costs`).set(auth(farmer)).send({ costDate: today(), category: 'ROPE_LINES', amountTzs: 20000, notes: '2 rolls' })).status).toBe(201);
    expect((await api().post(`/api/farms/${farm.id}/costs`).set(auth(farmer)).send({ costDate: today(), category: 'SEEDLINGS', amountTzs: 0 })).status).toBe(400);
    expect((await api().post(`/api/farms/${farm.id}/costs`).set(auth(farmer)).send({ costDate: today(), category: 'PHONE', amountTzs: 100 })).status).toBe(400);
    expect((await api().post(`/api/farms/${farm.id}/sales`).set(auth(farmer)).send({ saleDate: today(), quantityKg: -5, pricePerKg: 900 })).status).toBe(400);
    const work = await api().post(`/api/farms/${farm.id}/work`).set(auth(farmer)).send({ workDate: today(), activity: 'CLEANING_LINES' });
    expect(work.status).toBe(201);
    expect(work.body.data.work).toMatchObject({ activity: 'CLEANING_LINES' });
  });

  test('summary: income, owed, costs by category and profit for the cycle — from the farmer\'s entries only', async () => {
    const res = await api().get(`/api/farms/${farm.id}/records/summary`).set(auth(farmer));
    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    expect(s.incomeTzs).toBe(120000);
    expect(s.owedTzs).toBe(120000);
    expect(s.costsTzs).toBe(50000);
    expect(s.costsByCategory).toEqual({ SEEDLINGS: 30000, ROPE_LINES: 20000 });
    expect(s.profitTzs).toBe(70000);
    expect(s.counts).toMatchObject({ sales: 1, costs: 2, work: 1 });
    expect(res.body.data.cycles.length).toBeGreaterThan(0);
  });

  test('harvest with a price ("sold now") creates exactly one sale; a later sale goes to that harvested cycle', async () => {
    const before = await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id } });
    const h = await api().post(`/api/farms/${farm.id}/harvests`).set(auth(farmer)).send({ harvestDate: today(), actualQuantity: 150, unit: 'KG_DRY', pricePerKg: 1100 });
    expect(h.status).toBe(201);
    const sales = await farmRecords(prisma, 'SALE').findMany({ where: { farmId: farm.id, harvestRecordId: h.body.data.harvest.id } });
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ quantityKg: 150, pricePerKg: 1100, totalTzs: 165000, paymentStatus: 'PAID' });
    expect(await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id } })).toBe(before + 1);

    // The harvest closed the cycle; a sale entered afterwards still belongs to it (most recent cycle).
    const cycle = await prisma.plantingCycle.findUnique({ where: { id: h.body.data.harvest.plantingCycleId } });
    expect(cycle.status).toBe('HARVESTED');
    const late = await api().post(`/api/farms/${farm.id}/sales`).set(auth(farmer)).send({ saleDate: today(), quantityKg: 10, pricePerKg: 900 });
    expect(late.body.data.sale.plantingCycleId).toBe(cycle.id);
  });

  test('a harvest without a price creates no sale', async () => {
    const before = await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id } });
    await api().post(`/api/farms/${farm.id}/harvests`).set(auth(farmer)).send({ harvestDate: today(), actualQuantity: 20, unit: 'KG_DRY', closeCycle: false });
    expect(await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id } })).toBe(before);
  });

  test('another farmer\'s farm is forbidden; the owner and an admin may delete an entry (audit-logged)', async () => {
    expect((await api().post(`/api/farms/${foreign.id}/costs`).set(auth(farmer)).send({ costDate: today(), category: 'OTHER', amountTzs: 1000 })).status).toBe(403);
    expect((await api().get(`/api/farms/${foreign.id}/records/summary`).set(auth(farmer))).status).toBe(403);
    const mine = (await api().post(`/api/farms/${farm.id}/costs`).set(auth(farmer)).send({ costDate: today(), category: 'TRANSPORT', amountTzs: 3000 })).body.data.cost;
    const theirs = await farmRecords(prisma, 'COST').create({ data: { farmId: foreign.id, costDate: new Date(), category: 'OTHER', amountTzs: 500 } });
    expect((await api().delete(`/api/farms/${foreign.id}/costs/${theirs.id}`).set(auth(farmer))).status).toBe(403);
    expect((await api().delete(`/api/farms/${farm.id}/costs/${theirs.id}`).set(auth(farmer))).status).toBe(404); // not this farm's entry
    expect((await api().delete(`/api/farms/${farm.id}/costs/${mine.id}`).set(auth(farmer))).status).toBe(200);
    expect((await api().delete(`/api/farms/${foreign.id}/costs/${theirs.id}`).set(auth(admin))).status).toBe(200);
    expect(await events(prisma, 'AUDIT').count({ where: { entityType: 'FarmCost', entityId: mine.id, action: 'DELETE' } })).toBe(1);
  });

  test('an explicit cycle must belong to the farm', async () => {
    const other = await prisma.plantingCycle.findFirst({ where: { farmId: foreign.id } });
    expect((await api().post(`/api/farms/${farm.id}/work`).set(auth(farmer)).send({ workDate: today(), activity: 'DRYING', cycleId: other.id })).status).toBe(400);
  });
});

describe('record book review fixes: money is whole shillings, totals fit, nothing half-saved, nothing lost', () => {
  let farmer; let farm;
  beforeAll(async () => {
    farmer = await login('farmer');
    farm = await farmByCode(farmer, 'FARM002');
  });

  test('prices and amounts must be whole shillings (a decimal is never stored as 0)', async () => {
    const post = (kind, body) => api().post(`/api/farms/${farm.id}/${kind}`).set(auth(farmer)).send(body);
    expect((await post('sales', { saleDate: today(), quantityKg: 10, pricePerKg: 0.4 })).status).toBe(400);
    expect((await post('sales', { saleDate: today(), quantityKg: 10, pricePerKg: 1000.5 })).status).toBe(400);
    expect((await post('costs', { costDate: today(), category: 'OTHER', amountTzs: 0.3 })).status).toBe(400);
    expect((await post('sales', { saleDate: today(), quantityKg: 12.5, pricePerKg: 1000 })).body.data.sale.totalTzs).toBe(12500);
  });

  test('a total too large to store is rejected up front — and a harvest with such a price is not half-saved', async () => {
    expect((await api().post(`/api/farms/${farm.id}/sales`).set(auth(farmer)).send({ saleDate: today(), quantityKg: 3000, pricePerKg: 1000000 })).status).toBe(400);
    const before = await prisma.harvestRecord.count({ where: { farmId: farm.id } });
    const h = await api().post(`/api/farms/${farm.id}/harvests`).set(auth(farmer)).send({ harvestDate: today(), actualQuantity: 3000, unit: 'KG_DRY', pricePerKg: 1000000, closeCycle: false });
    expect(h.status).toBe(400);
    expect(await prisma.harvestRecord.count({ where: { farmId: farm.id } })).toBe(before);
  });

  test('dates: missing or in the future are rejected (never stored as 1970)', async () => {
    const tomorrow = new Date(Date.now() + 2 * 86400e3).toISOString().slice(0, 10);
    expect((await api().post(`/api/farms/${farm.id}/work`).set(auth(farmer)).send({ workDate: null, activity: 'DRYING' })).status).toBe(400);
    expect((await api().post(`/api/farms/${farm.id}/costs`).set(auth(farmer)).send({ costDate: tomorrow, category: 'OTHER', amountTzs: 100 })).status).toBe(400);
  });

  test('a wet-weight harvest with a price creates no sale (sales are in kg of dried seaweed)', async () => {
    const before = await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id } });
    await api().post(`/api/farms/${farm.id}/harvests`).set(auth(farmer)).send({ harvestDate: today(), actualQuantity: 400, unit: 'KG_WET', pricePerKg: 150, closeCycle: false });
    expect(await farmRecords(prisma, 'SALE').count({ where: { farmId: farm.id } })).toBe(before);
  });

  test('a second harvest after the cycle closed goes to the same cycle as its sale; both are audit-logged with the user', async () => {
    const h = await api().post(`/api/farms/${farm.id}/harvests`).set(auth(farmer)).send({ harvestDate: today(), actualQuantity: 40, unit: 'KG_DRY', pricePerKg: 1000 });
    const harvest = h.body.data.harvest;
    const sale = await farmRecords(prisma, 'SALE').findFirst({ where: { harvestRecordId: harvest.id } });
    expect(harvest.plantingCycleId).toBeTruthy();
    expect(sale.plantingCycleId).toBe(harvest.plantingCycleId);
    expect(sale.createdById).toBeTruthy();
    expect(await events(prisma, 'AUDIT').count({ where: { entityType: 'SaleRecord', entityId: sale.id, action: 'CREATE', userId: sale.createdById } })).toBe(1);
  });

  test('deleting keeps what was deleted in the audit log', async () => {
    const cost = (await api().post(`/api/farms/${farm.id}/costs`).set(auth(farmer)).send({ costDate: today(), category: 'LABOUR', amountTzs: 7000 })).body.data.cost;
    await api().delete(`/api/farms/${farm.id}/costs/${cost.id}`).set(auth(farmer));
    const log = await events(prisma, 'AUDIT').findFirst({ where: { entityType: 'FarmCost', entityId: cost.id, action: 'DELETE' } });
    expect(log.details).toMatchObject({ amountTzs: 7000, category: 'LABOUR' });
  });

  test('costs recorded before any planting are attached to the first planting (not lost)', async () => {
    const species = (await api().get('/api/species')).body.data.species[0];
    const created = await api().post('/api/farms').set(auth(farmer)).send({ name: 'New plot', speciesId: species.id, latitude: -6.2, longitude: 39.5, locationName: 'Paje', district: 'Kusini', region: 'Unguja South' });
    const id = created.body.data.farm.id;
    const early = (await api().post(`/api/farms/${id}/costs`).set(auth(farmer)).send({ costDate: today(), category: 'SEEDLINGS', amountTzs: 40000 })).body.data.cost;
    expect(early.plantingCycleId).toBeNull();
    const cycle = await api().post(`/api/farms/${id}/cycles`).set(auth(farmer)).send({ plantingDate: today(), linesPlanted: 50 });
    expect(cycle.status).toBe(201);
    expect((await farmRecords(prisma, 'COST').findUnique({ where: { id: early.id } })).plantingCycleId).toBe(cycle.body.data.cycle.id);
    expect((await api().get(`/api/farms/${id}/records/summary`).set(auth(farmer))).body.data.summary.costsTzs).toBe(40000);
  });
});
