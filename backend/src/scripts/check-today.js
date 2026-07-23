import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const since = new Date('2026-07-22T18:30:00Z'); // Jul 23 IST start

const runs = await prisma.run.findMany({
  orderBy: { executedAt: 'asc' },
  where: { executedAt: { gte: since } },
  include: { task: true }
});

console.log(`Runs today (Jul 23): ${runs.length}\n`);

for (const r of runs) {
  const ist = new Date(r.executedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const logs = JSON.parse(r.logs || '[]');
  const keyLogs = logs.filter(l =>
    !l.message.includes('at epoch') &&
    (l.message.includes('Matched slot') ||
     l.message.includes('Outside Booking') ||
     l.message.includes('Slot not') ||
     l.message.includes('booking window') ||
     l.message.includes('screenshot') ||
     l.message.includes('Booking confirmed') ||
     l.message.includes('error') ||
     l.message.includes('failed') ||
     l.message.includes('booked') ||
     l.message.includes('spots available') ||
     l.message.includes('Auth') ||
     l.message.includes('GitHub'))
  );
  console.log(`[${r.status.toUpperCase()}] IST: ${ist}`);
  keyLogs.forEach(l => console.log(`  [${l.level}] ${l.message}`));
  console.log();
}

await prisma.$disconnect();
