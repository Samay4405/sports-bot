import { PrismaClient } from '@prisma/client';
import { runBookingAgent } from './bot/bookingAgent.js';
import { RunLogger } from './lib/logger.js';
import { decryptText } from './lib/encrypt.js';
import path from 'path';

const prisma = new PrismaClient();

async function testSwimmingPool() {
  const tasks = await prisma.task.findMany();
  const anyTask = tasks[0];

  if (!anyTask) {
    console.error("No tasks found in DB");
    return;
  }

  // Test the 5:00 PM Swimming Pool slot (currently open per screenshot)
  const testTask = {
    ...anyTask,
    sport: "Swimming Pool",
    slotTime: "5:00 PM - 5:40 PM",
    decryptedPassword: decryptText(anyTask.password),
  };

  console.log(`Testing Swimming Pool 5:00 PM slot (should be open right now)...`);

  const logger = new RunLogger({
    taskId: "swim-test",
    runId: "swim-test-live",
    emitter: null
  });

  const result = await runBookingAgent(
    testTask,
    logger,
    { screenshotDir: path.join(process.cwd(), "screenshots") }
  );

  console.log("\n=== RESULT ===");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n=== ALL LOGS ===");
  const logsArr = JSON.parse(logger.toJSON());
  logsArr.forEach(l => console.log(`[${l.level}] ${l.message}`));
}

testSwimmingPool().finally(() => prisma.$disconnect());
