import { PrismaClient } from '@prisma/client';
import { runBookingAgent } from './bot/bookingAgent.js';
import { RunLogger } from './lib/logger.js';
import { decryptText } from './lib/encrypt.js';
import path from 'path';

const prisma = new PrismaClient();

async function test() {
  const tasks = await prisma.task.findMany();
  const anyTask = tasks[0];
  if (!anyTask) { console.error("No tasks"); return; }

  // Test Swimming Pool 5 PM slot - this is the one that failed today
  const testTask = {
    ...anyTask,
    sport: "Swimming Pool",
    slotTime: "5:00 PM - 5:40 PM",
    decryptedPassword: decryptText(anyTask.password),
  };

  console.log(`Testing: ${testTask.sport} @ ${testTask.slotTime}`);

  // Create per-run screenshot subdirectory: screenshots/YYYY-MM-DD/HH-MM-IST-test/
  const now = new Date();
  const istDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const istTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).replace(':', '-');
  const testSubdir = path.join(process.cwd(), 'screenshots', istDate, `${istTime}-IST-test`);

  const logger = new RunLogger({ taskId: "fix-test", runId: "fix-test", emitter: null });
  const result = await runBookingAgent(testTask, logger, {
    screenshotDir: testSubdir
  });

  console.log("\n=== RESULT ===");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n=== KEY LOGS ===");
  JSON.parse(logger.toJSON()).forEach(l => console.log(`[${l.level}] ${l.message}`));
}

test().finally(() => prisma.$disconnect());
