import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const todayUTC = new Date('2026-07-01T18:30:00Z');
async function main() {
  const runs = await prisma.run.findMany({
    orderBy: { executedAt: 'asc' },
    where: { executedAt: { gte: todayUTC } },
    include: { task: true }
  });
  console.log('Runs:', runs.length);
  for (const r of runs) {
    const ist = new Date(r.executedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(ist + ' - ' + r.task.sport + ' (' + r.task.slotTime + ') - ' + r.status);
    const logs = JSON.parse(r.logs || '[]');
    console.log('Logs length:', logs.length);
    if (r.task.slotTime.includes('10:00')) {
      logs.slice(0, 5).forEach(l => console.log('  ', l.message));
      console.log('  ...');
      logs.slice(-5).forEach(l => console.log('  ', l.message));
    }
  }
}
main().finally(() => prisma.$disconnect());
