import prisma from '../src/server/config/prisma.js';
import { ACTION_LIBRARY } from '../prisma/data/actionLibrary.js';

// Install the new rule on an existing database without reseeding data or changing expert edits.
try {
  const action = ACTION_LIBRARY.find((entry) => entry.code === 'STORM_LOW_REPORTED_DAMAGE');
  const saved = await prisma.actionLibrary.upsert({ where: { code: action.code }, create: action, update: {} });
  console.log(`Available action: ${saved.code}; expert validated: ${saved.validated}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
