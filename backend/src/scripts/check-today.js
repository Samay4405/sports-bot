import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Check only the Jul 12 5PM run (first one at 5:02 PM)
const since = new Date('2026-07-11T18:30:00Z');
const runs = await prisma.run.findMany({
  orderBy: { executedAt: 'asc' },
  where: { executedAt: { gte: since } },
  include: { task: true }
});

for (const r of runs) {
  const ist = new Date(r.executedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const logs = JSON.parse(r.logs || '[]');
  
  // Show unique messages for the Jul 12 5PM run (it ran 3 times)
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[${r.status.toUpperCase()}] IST: ${ist}`);
  
  const seen = new Set();
  for (const l of logs) {
    const msg = l.message;
    if (!seen.has(msg)) {
      seen.add(msg);
      // Skip purely repetitive check messages
      if (!msg.includes('at epoch')) {
        console.log(`[${l.level}] ${msg}`);
      }
    }
  }
}

await prisma.$disconnect();
