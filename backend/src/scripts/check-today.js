import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Jul 22 IST starts at Jul 21 18:30 UTC
const since = new Date('2026-07-21T18:30:00Z');

const runs = await prisma.run.findMany({
  orderBy: { executedAt: 'asc' },
  where: { executedAt: { gte: since } },
  include: { task: true }
});

console.log(`Runs today (Jul 22): ${runs.length}\n`);

for (const r of runs) {
  const ist = new Date(r.executedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const logs = JSON.parse(r.logs || '[]');
  console.log(`${'='.repeat(60)}`);
  console.log(`[${r.status.toUpperCase()}] ${r.task.sport} | ${r.task.slotTime}`);
  console.log(`IST: ${ist} | Logs: ${logs.length}`);
  console.log(`${'='.repeat(60)}`);
  const seen = new Set();
  for (const l of logs) {
    if (l.message.includes('at epoch')) continue;
    if (!seen.has(l.message)) {
      seen.add(l.message);
      console.log(`[${l.level}] ${l.message}`);
    }
  }
  console.log();
}

await prisma.$disconnect();
