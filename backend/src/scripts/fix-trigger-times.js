import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

await prisma.task.update({
  where: { id: '2770f28a-1e01-4cad-af1c-86c2364f44c1' },
  data: { triggerTime: '05:00' }
});

const t = await prisma.task.findUnique({ where: { id: '2770f28a-1e01-4cad-af1c-86c2364f44c1' } });
console.log(`Updated: ${t.sport} | ${t.slotTime} | triggerTime: ${t.triggerTime}`);

await prisma.$disconnect();
