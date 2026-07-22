import { PrismaClient } from '@prisma/client';
import { runBookingAgent } from '../bot/bookingAgent.js';
import { RunLogger } from '../lib/logger.js';
import { decryptText } from '../lib/encrypt.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const [task] = await prisma.task.findMany({ where: { enabled: true } });
await prisma.$disconnect();

const TARGET_SLOT = '2:00 PM - 2:45 PM';

console.log(`\n${'='.repeat(60)}`);
console.log(`Sport:    ${task.sport}`);
console.log(`Slot:     ${TARGET_SLOT}`);
console.log(`Username: ${task.username}`);
console.log(`${'='.repeat(60)}\n`);
console.log('Chrome will open — watch it!\n');

const logger = new RunLogger({ taskId: 'live-test', runId: 'live-test', emitter: null });

const result = await runBookingAgent(
  { ...task, slotTime: TARGET_SLOT, decryptedPassword: decryptText(task.password) },
  logger,
  {
    screenshotDir: path.resolve(__dirname, '../../screenshots/live-test'),
    headless: false,
    preWaitMs: 0,
  }
);

console.log('\n=== RESULT ===');
console.log(JSON.stringify(result, null, 2));
console.log('\n=== KEY LOGS ===');
const logs = JSON.parse(logger.toJSON());
logs.filter(l => !l.message.includes('at epoch')).forEach(l => console.log(`[${l.level}] ${l.message}`));
