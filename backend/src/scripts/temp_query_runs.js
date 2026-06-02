import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const runs = await prisma.run.findMany({
    orderBy: { executedAt: 'desc' },
    take: 3
  });
  for (const run of runs) {
    console.log(`\n=== Run ID: ${run.id} ===`);
    console.log(`Status: ${run.status}`);
    console.log(`Executed At: ${run.executedAt}`);
    const logs = JSON.parse(run.logs || "[]");
    for (const l of logs) {
      if (l.level === 'warn' || l.level === 'error' || l.message.includes('search') || l.message.includes('navigat') || l.message.includes('card') || l.message.includes('slot')) {
        console.log(`[${l.level}] ${l.message}`);
      }
    }
    console.log("--- Last 10 logs ---");
    logs.slice(-10).forEach(l => console.log(`[${l.level}] ${l.message}`));
  }
}
main().finally(() => prisma.$disconnect());
