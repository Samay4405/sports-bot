import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const run = await prisma.run.findUnique({
    where: { id: '890154f0-85de-4de3-9698-728e1baf9e79' }
  });
  const logs = JSON.parse(run.logs);
  logs.forEach(l => console.log(`[${l.level}] ${l.message}`));
}
main().finally(() => prisma.$disconnect());
