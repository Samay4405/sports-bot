import { PrismaClient } from '@prisma/client';
import { runBookingAgent } from '../bot/bookingAgent.js';
import { RunLogger } from '../lib/logger.js';
import { decryptText } from '../lib/encrypt.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

// Read task from DB
const allTasks = await prisma.task.findMany({ where: { enabled: true } });
await prisma.$disconnect();

if (!allTasks.length) { console.error('No enabled tasks found in DB!'); process.exit(1); }

// Pick Swimming Pool task
const task = allTasks.find(t => t.sport.toLowerCase().includes('swimming')) || allTasks[0];

console.log(`\n${'='.repeat(60)}`);
console.log(`Testing with a CURRENTLY OPEN slot so you can see it book successfully.`);
console.log(`Sport: ${task.sport}`);
console.log(`Slot: 2:00 PM - 2:45 PM`);
console.log(`Username: ${task.username}`);
console.log(`${'='.repeat(60)}\n`);
console.log('A Chrome window will open — watch it!\n');

const testTask = {
  ...task,
  slotTime: '2:00 PM - 2:45 PM',  // We know this one is open right now!
  decryptedPassword: decryptText(task.password),
};

const logger = new RunLogger({ taskId: 'live-test', runId: 'live-test', emitter: null });

const result = await runBookingAgent(testTask, logger, {
  screenshotDir: path.resolve(__dirname, '../../screenshots'),
  headless: false,  // VISIBLE browser
});

console.log('\n=== RESULT ===');
console.log(JSON.stringify(result, null, 2));
console.log('\n=== ALL LOGS ===');
JSON.parse(logger.toJSON()).forEach(l => console.log(`[${l.level}] ${l.message}`));
