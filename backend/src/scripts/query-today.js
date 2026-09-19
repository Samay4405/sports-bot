import 'dotenv/config';
import prisma from '../lib/prisma.js';

// Get ALL runs, show full details
const runs = await prisma.run.findMany({
  orderBy: { executedAt: 'desc' },
  take: 10,
  include: { task: { select: { sport: true, slotTime: true, triggerTime: true, username: true } } }
});

for (const r of runs) {
  const ist = r.executedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Run ID: ${r.id}`);
  console.log(`Task ID: ${r.taskId}`);
  console.log(`Status: ${r.status}`);
  console.log(`Sport: ${r.task?.sport} @ ${r.task?.slotTime}`);
  console.log(`Trigger: ${r.task?.triggerTime}`);
  console.log(`User: ${r.task?.username}`);
  console.log(`Executed At: ${ist}`);
  console.log(`Screenshot: ${r.screenshotPath || 'none'}`);
  
  console.log(`\nLogs (raw length): ${r.logs?.length || 0} chars`);
  
  try {
    const logs = JSON.parse(r.logs);
    console.log(`Log entries: ${logs.length}`);
    if (logs.length === 0) {
      console.log('  (empty logs!)');
    }
    for (const l of logs) {
      const time = new Date(l.epochMs).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
      console.log(`  [${l.level}] ${time}: ${l.message}`);
    }
  } catch (e) {
    console.log(`  Could not parse logs: ${e.message}`);
    console.log(`  Raw logs (first 500 chars): ${(r.logs || '').substring(0, 500)}`);
  }
}

await prisma.$disconnect();
