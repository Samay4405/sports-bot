import { PrismaClient } from '@prisma/client';
import { runBookingAgent } from './bot/bookingAgent.js';
import { RunLogger } from './lib/logger.js';
import { decryptText } from './lib/encrypt.js';
import path from 'path';

const prisma = new PrismaClient();

async function testBooking() {
  const tasks = await prisma.task.findMany();
  const task = tasks.find(t => t.sport.includes('Carrom'));
  
  if (!task) {
    console.error("Task not found");
    return;
  }
  
  console.log(`Running test for ${task.sport}...`);
  
  const logger = new RunLogger({
    taskId: task.id,
    runId: "local-test",
    emitter: null
  });

  const result = await runBookingAgent(
    {
      ...task,
      decryptedPassword: decryptText(task.password),
    },
    logger,
    {
      screenshotDir: path.join(process.cwd(), "screenshots"),
    }
  );
  
  console.log("Result:", result);
  console.log("Logs:");
  const logsArr = JSON.parse(logger.toJSON());
  logsArr.forEach(l => console.log(`[${l.level}] ${l.message}`));
}

testBooking().finally(() => prisma.$disconnect());
