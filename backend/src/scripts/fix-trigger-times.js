import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

console.log('Fixing trigger times for 5 PM Swimming Pool tasks...\n');

// Fix task 2770f28a - Swimming Pool 5PM (en-dash version)
await prisma.task.update({
  where: { id: '2770f28a-1e01-4cad-af1c-86c2364f44c1' },
  data: { triggerTime: '17:00' }
});
console.log('Updated task 2770f28a -> triggerTime: 17:00');

// Fix task 956ab9be - Swimming Pool 5PM (hyphen version) - disable as duplicate
await prisma.task.update({
  where: { id: '956ab9be-6c3c-48f0-817d-0de5b784ec33' },
  data: { triggerTime: '17:00', enabled: false }
});
console.log('Updated task 956ab9be -> triggerTime: 17:00, enabled: false (duplicate disabled)');

console.log('\nVerifying final state:');
const tasks = await prisma.task.findMany({
  select: { id: true, sport: true, slotTime: true, triggerTime: true, enabled: true }
});
tasks.forEach(t => console.log(JSON.stringify(t)));

await prisma.$disconnect();
