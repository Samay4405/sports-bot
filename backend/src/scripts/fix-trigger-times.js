import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Set ALL tasks to triggerTime 05:00 — booking opens at 5 AM for everything
const tasks = await prisma.task.findMany({ where: { enabled: true } });
console.log(`Updating ${tasks.length} enabled tasks to triggerTime: 05:00\n`);

for (const t of tasks) {
  await prisma.task.update({ where: { id: t.id }, data: { triggerTime: '05:00' } });
  console.log(`  [✓] ${t.sport} | ${t.slotTime} → triggerTime: 05:00`);
}

console.log('\nFinal state:');
const all = await prisma.task.findMany({ select: { sport: true, slotTime: true, triggerTime: true, enabled: true } });
all.forEach(t => console.log(`  ${t.enabled ? '✓' : '✗'} ${t.sport} | ${t.slotTime} | trigger: ${t.triggerTime}`));

await prisma.$disconnect();
