import { PrismaClient } from '@prisma/client';

// Single shared Prisma client (parameterised queries → SQL-injection safe).
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.__mwaniPrisma || new PrismaClient({ log: ['warn', 'error'] });
if (!globalForPrisma.__mwaniPrisma) globalForPrisma.__mwaniPrisma = prisma;

export default prisma;
