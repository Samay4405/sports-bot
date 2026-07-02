import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const tasks = await prisma.task.findMany({
  select: { id: true, sport: true, slotTime: true, triggerTime: true, enabled: true }
});

console.log('ALL TASKS:');
tasks.forEach(t => console.log(JSON.stringify(t)));

await prisma.$disconnect();
