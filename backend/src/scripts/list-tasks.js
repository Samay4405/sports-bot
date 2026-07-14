import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const all = await prisma.task.findMany();
all.forEach(t => console.log(JSON.stringify({
  id: t.id, sport: t.sport, slot: t.slotTime, trigger: t.triggerTime, enabled: t.enabled
})));
await prisma.$disconnect();
