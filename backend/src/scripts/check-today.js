import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// July 2 IST = July 1 18:30 UTC onwards
const todayUTC = new Date('2026-07-01T18:30:00Z');

const runs = await prisma.run.findMany({
  orderBy: { executedAt: 'asc' },
  where: { executedAt: { gte: todayUTC } },
  include: { task: true }
});

console.log(`Runs today (Jul 2): ${runs.length}`);
for (const run of runs) {
  const ist = new Date(run.executedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const logs = JSON.parse(run.logs || '[]');
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Sport: ${run.task.sport} | Slot: ${run.task.slotTime}`);
  console.log(`Status: ${run.status} | At (IST): ${ist}`);
  console.log(`${'='.repeat(60)}`);
  
  // Show ALL unique "Matched slot card text" lines to understand what the website shows
  const cardTextLogs = logs.filter(l => l.message.includes('Matched slot card text') || l.message.includes('Skipping') || l.message.includes('Clicked') || l.message.includes('Booked') || l.message.includes('Booking confirmed'));
  if (cardTextLogs.length > 0) {
    console.log('KEY EVENTS:');
    // Deduplicate
    const seen = new Set();
    for (const l of cardTextLogs) {
      if (!seen.has(l.message)) {
        seen.add(l.message);
        console.log(`  [${l.level}] ${l.message}`);
      }
    }
  }
  
  // Show first 3 and last 3 logs
  console.log('FIRST 3:');
  logs.slice(0, 3).forEach(l => console.log(`  [${l.level}] ${l.message}`));
  console.log('LAST 3:');
  logs.slice(-3).forEach(l => console.log(`  [${l.level}] ${l.message}`));
}

await prisma.$disconnect();
