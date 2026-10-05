/**
 * Each repository scopes every read and write to one record type in a shared table.
 * Return Prisma promises directly so callers can also use array transactions.
 */
const repositories = new WeakMap();
const defaults = {
  SALE: () => ({ channel: 'APP', paymentStatus: 'PAID' }),
  COST: () => ({ channel: 'APP' }),
  WORK: () => ({ channel: 'APP' }),
  OUTCOME: () => ({ outcomeDate: new Date() }),
  JOB: () => ({ startedAt: new Date() }),
  SMS: () => ({ simulated: true }),
  UPLOAD: () => ({ storage: 'LOCAL' }),
};

function repository(db, model, recordType) {
  let cache = repositories.get(db);
  if (!cache) { cache = new Map(); repositories.set(db, cache); }
  const key = `${model}:${recordType}`;
  if (cache.has(key)) return cache.get(key);
  const delegate = db[model];
  const where = (value = {}) => ({ ...value, recordType });
  const createData = (data) => ({ ...(defaults[recordType]?.() || {}), ...data, recordType });
  const updateData = ({ recordType: _ignored, ...data }) => data;
  const scoped = {};
  for (const method of ['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy', 'delete', 'deleteMany']) {
    scoped[method] = (args = {}) => delegate[method]({ ...args, where: where(args.where) });
  }
  for (const method of ['create', 'createMany', 'createManyAndReturn']) {
    scoped[method] = (args) => delegate[method]({ ...args, data: Array.isArray(args.data) ? args.data.map(createData) : createData(args.data) });
  }
  for (const method of ['update', 'updateMany']) {
    scoped[method] = (args) => delegate[method]({ ...args, where: where(args.where), data: updateData(args.data) });
  }
  cache.set(key, scoped);
  return scoped;
}

export const farmRecords = (db, type) => repository(db, 'farmRecord', type);
export const events = (db, type) => repository(db, 'eventLog', type);
export const environmentReadings = (db, type) => repository(db, 'environmentalObservation', type);
