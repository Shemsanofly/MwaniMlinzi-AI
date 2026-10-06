import { farmRecords } from '../db/records.js';
import prisma from '../config/prisma.js';
import { badRequest, notFound } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { recordSummary } from './recordBook.js';

/** kind → farm-record type, date field, response key and audit entity. */
const KINDS = {
  sales: { type: 'SALE', date: 'saleDate', one: 'sale', entity: 'SaleRecord' },
  costs: { type: 'COST', date: 'costDate', one: 'cost', entity: 'FarmCost' },
  work: { type: 'WORK', date: 'workDate', one: 'work', entity: 'WorkLog' },
};

/** Largest amount stored (Int column); totals above it are rejected up front, never half-saved. */
export const MAX_TOTAL_TZS = 2000000000;

const cycleSelect = { id: true, plantingDate: true, expectedHarvestDate: true, linesPlanted: true, status: true };

/** Key fields kept in the audit log (so a deleted entry can still be traced). */
const auditDetails = (kind, row) => ({
  farmId: row.farmId,
  channel: row.channel,
  ...(kind === 'sales' ? { saleDate: row.saleDate, quantityKg: row.quantityKg, pricePerKg: row.pricePerKg, totalTzs: row.totalTzs, paymentStatus: row.paymentStatus } : {}),
  ...(kind === 'costs' ? { costDate: row.costDate, category: row.category, amountTzs: row.amountTzs } : {}),
  ...(kind === 'work' ? { workDate: row.workDate, activity: row.activity } : {}),
});

export const RecordBookService = {
  KINDS,

  /** Explicit cycle (must belong to the farm) → ACTIVE cycle → most recent cycle → null. */
  async resolveCycleId(farmId, cycleId = null, db = prisma) {
    if (cycleId) {
      const c = await db.plantingCycle.findUnique({ where: { id: cycleId }, select: { farmId: true } });
      if (!c || c.farmId !== farmId) throw badRequest('This planting cycle does not belong to the farm');
      return cycleId;
    }
    const active = await db.plantingCycle.findFirst({ where: { farmId, status: 'ACTIVE' }, orderBy: { plantingDate: 'desc' }, select: { id: true } });
    if (active) return active.id;
    const latest = await db.plantingCycle.findFirst({ where: { farmId }, orderBy: { plantingDate: 'desc' }, select: { id: true } });
    return latest?.id ?? null;
  },

  /** Entries recorded before the farm had any planting (e.g. seedlings bought first) join its first planting. */
  async attachUnassigned(farmId, cycleId, db = prisma) {
    const where = { farmId, plantingCycleId: null };
    await Promise.all([
      farmRecords(db, 'SALE').updateMany({ where, data: { plantingCycleId: cycleId } }),
      farmRecords(db, 'COST').updateMany({ where, data: { plantingCycleId: cycleId } }),
      farmRecords(db, 'WORK').updateMany({ where, data: { plantingCycleId: cycleId } }),
    ]);
  },

  /** `db` may be a transaction client (harvest "sold now" is saved atomically with its harvest). */
  async createSale(farmId, user, data, { channel = 'APP', harvestRecordId = null, db = prisma } = {}) {
    const pricePerKg = Math.round(data.pricePerKg);
    const totalTzs = Math.round(data.quantityKg * pricePerKg);
    if (totalTzs > MAX_TOTAL_TZS) throw badRequest('The sale total is too large. Check the kilograms and the price per kg.');
    const plantingCycleId = await this.resolveCycleId(farmId, data.cycleId, db);
    const row = await farmRecords(db, 'SALE').create({
      data: {
        farmId, plantingCycleId, harvestRecordId,
        saleDate: data.saleDate, quantityKg: data.quantityKg, pricePerKg, totalTzs,
        buyerName: data.buyerName || null, qualityGrade: data.qualityGrade || null,
        paymentStatus: data.paymentStatus || 'PAID', notes: data.notes || null, channel, createdById: user?.id ?? null,
      },
    });
    if (db === prisma) await this.auditCreate('sales', row, user); // inside a transaction the caller audits after commit
    return row;
  },

  auditCreate(kind, row, user) { return audit({ user }, 'CREATE', KINDS[kind].entity, row.id, auditDetails(kind, row)); },

  async createCost(farmId, user, data, { channel = 'APP' } = {}) {
    const plantingCycleId = await this.resolveCycleId(farmId, data.cycleId);
    const row = await farmRecords(prisma, 'COST').create({
      data: { farmId, plantingCycleId, costDate: data.costDate, category: data.category, amountTzs: Math.round(data.amountTzs), notes: data.notes || null, channel, createdById: user?.id ?? null },
    });
    await audit({ user }, 'CREATE', KINDS.costs.entity, row.id, auditDetails('costs', row));
    return row;
  },

  async createWork(farmId, user, data, { channel = 'APP' } = {}) {
    const plantingCycleId = await this.resolveCycleId(farmId, data.cycleId);
    const row = await farmRecords(prisma, 'WORK').create({
      data: { farmId, plantingCycleId, workDate: data.workDate, activity: data.activity, notes: data.notes || null, channel, createdById: user?.id ?? null },
    });
    await audit({ user }, 'CREATE', KINDS.work.entity, row.id, auditDetails('work', row));
    return row;
  },

  async list(kind, farmId, { cycleId = null } = {}) {
    const k = KINDS[kind];
    return farmRecords(prisma, k.type).findMany({ where: { farmId, ...(cycleId ? { plantingCycleId: cycleId } : {}) }, orderBy: [{ [k.date]: 'desc' }, { createdAt: 'desc' }] });
  },

  /** Deletes one entry of this farm (404 when the id belongs to another farm); the audit log keeps what was deleted. */
  async remove(kind, farmId, recordId, user = null) {
    const k = KINDS[kind];
    const row = await farmRecords(prisma, k.type).findUnique({ where: { id: recordId } });
    if (!row || row.farmId !== farmId) throw notFound('Record');
    await farmRecords(prisma, k.type).delete({ where: { id: recordId } });
    await audit({ user }, 'DELETE', k.entity, row.id, auditDetails(kind, row));
    return row;
  },

  /**
   * Summary for one cycle (default: the cycle new entries go to). Farms without any cycle get a summary of all
   * their entries. Also returns the farm's cycles so the web can offer a picker.
   */
  async summary(farmId, { cycleId = null } = {}) {
    const cycles = await prisma.plantingCycle.findMany({ where: { farmId }, orderBy: { plantingDate: 'desc' }, select: cycleSelect });
    const id = await this.resolveCycleId(farmId, cycleId);
    const cycle = id ? cycles.find((c) => c.id === id) : null;
    const where = { farmId, ...(cycle ? { plantingCycleId: cycle.id } : {}) };
    const [harvests, sales, costs, work] = await Promise.all([
      prisma.harvestRecord.findMany({ where, select: { actualQuantity: true, unit: true } }),
      farmRecords(prisma, 'SALE').findMany({ where, select: { quantityKg: true, totalTzs: true, paymentStatus: true } }),
      farmRecords(prisma, 'COST').findMany({ where, select: { category: true, amountTzs: true } }),
      farmRecords(prisma, 'WORK').findMany({ where, select: { id: true } }),
    ]);
    return { cycle, cycles, summary: recordSummary({ cycle, harvests, sales, costs, work }) };
  },
};
