import "dotenv/config";
import path from "path";
import fs from "fs/promises";
import prisma from "../lib/prisma.js";
import { decryptText } from "../lib/encrypt.js";
import { RunLogger } from "../lib/logger.js";
import { runBookingAgent } from "../bot/bookingAgent.js";

function parseBool(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function isValidHHmm(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function getCurrentIstHHmm() {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";

  return `${hour}:${minute}`;
}

/** Convert "HH:MM" to minutes since midnight. */
function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Check if a task's triggerTime falls within the allowed window.
 * Looks BACKWARD (up to `backwardMin`) for late triggers,
 * and FORWARD (up to `forwardMin`) for early triggers.
 *
 * Returns { match: boolean, waitMs: number }
 *   - match: true if the trigger time is within the combined window
 *   - waitMs: milliseconds to wait before executing (0 if trigger is in the past)
 */
function isWithinWindow(triggerHHmm, currentHHmm, backwardMin = 180, forwardMin = 45) {
  const triggerMin = hhmmToMinutes(triggerHHmm);
  const currentMin = hhmmToMinutes(currentHHmm);

  // Difference: positive = trigger is in the past, negative = trigger is in the future.
  let diff = currentMin - triggerMin;
  // Handle midnight wraparound (e.g., current=01:00, trigger=23:30)
  if (diff < -720) diff += 1440;    // trigger looks far future but is actually past midnight
  if (diff > 720) diff -= 1440;     // trigger looks far past but is actually near midnight

  if (diff >= 0 && diff <= backwardMin) {
    // Trigger was in the past, within backward window → run immediately.
    return { match: true, waitMs: 0 };
  }

  if (diff < 0 && Math.abs(diff) <= forwardMin) {
    // Trigger is in the future, within forward window → wait until trigger time.
    return { match: true, waitMs: Math.abs(diff) * 60 * 1000 };
  }

  return { match: false, waitMs: 0 };
}

/** Get today's date string in IST (YYYY-MM-DD) for duplicate-run checking. */
function getTodayIstDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date()); // "2026-05-30"
}

async function runTask(task) {
  const run = await prisma.run.create({
    data: {
      taskId: task.id,
      status: "running",
      logs: "[]",
    },
  });

  const logger = new RunLogger({
    taskId: task.id,
    runId: run.id,
    emitter: null,
  });

  logger.push("GitHub Actions run started");

  // Build date+time-specific screenshot folder: screenshots/YYYY-MM-DD/HH-MM-IST/
  const now = new Date();
  const istDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // "2026-07-22"
  const istTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).replace(':', '-'); // "04-30"
  const runSubdir = path.join(process.cwd(), 'screenshots', istDate, `${istTime}-IST-run-${run.id.slice(0, 8)}`);

  const result = await runBookingAgent(
    {
      ...task,
      decryptedPassword: decryptText(task.password),
    },
    logger,
    {
      screenshotDir: runSubdir,
      preWaitMs: task._waitMs || 0,
    }
  );

  // Extract key diagnostic info from logs for the summary.
  const logs = JSON.parse(logger.toJSON());
  const cardText = logs.find(l => l.message.includes('Matched slot card text'))?.message || '';
  const spotsMatch = cardText.match(/(\d+)\/(\d+)\s+spots?/);
  const outsideHours = logs.some(l => l.message.includes('Outside Booking Hours'));
  const shotFile = result.screenshotPath || logs.find(l => l.message.includes('screenshot:'))?.message?.split(': ')[1] || 'none';

  // Write a human-readable summary.md into the screenshot folder.
  const summaryMd = [
    `# Run Summary`,
    `**Date (IST):** ${istDate} ${istTime.replace('-', ':')} AM`,
    `**Sport:** ${task.sport}`,
    `**Slot:** ${task.slotTime}`,
    `**Status:** ${result.status}`,
    `**Reason:** ${result.reason || '-'}`,
    spotsMatch ? `**Spots available:** ${spotsMatch[1]}/${spotsMatch[2]}` : '',
    outsideHours ? `**Booking window:** \u274c Outside Booking Hours at this time` : `**Booking window:** \u2705 Open`,
    `**Screenshot:** ${shotFile}`,
  ].filter(Boolean).join('\n');

  await fs.mkdir(runSubdir, { recursive: true }).catch(() => null);
  await fs.writeFile(path.join(runSubdir, 'summary.md'), summaryMd).catch(() => null);

  await prisma.run.update({
    where: { id: run.id },
    data: {
      status: result.status,
      screenshotPath: result.screenshotPath,
      logs: logger.toJSON(),
    },
  });

  return {
    runId: run.id,
    status: result.status,
    reason: result.reason,
    screenshotPath: result.screenshotPath,
    spotsInfo: spotsMatch ? `${spotsMatch[1]}/${spotsMatch[2]}` : 'unknown',
    outsideHours,
    istTime,
    istDate,
  };
}

async function appendStepSummary(lines) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) {
    return;
  }

  await fs.appendFile(summaryFile, `${lines.join("\n")}\n`);
}

async function main() {
  const onlyTaskId = String(process.env.RUN_ONLY_TASK_ID || "").trim();
  const ignoreTriggerTime = parseBool(process.env.RUN_IGNORE_TRIGGER_TIME);
  // How far back (in minutes) to look for tasks whose triggerTime has passed.
  const backwardMin = parseInt(process.env.TRIGGER_WINDOW_BACKWARD || "60", 10);
  // How far forward (in minutes) to look — bot will WAIT until the trigger time.
  const forwardMin = parseInt(process.env.TRIGGER_WINDOW_FORWARD || "90", 10);

  if (ignoreTriggerTime && !onlyTaskId) {
    throw new Error(
      "Safety check failed: RUN_IGNORE_TRIGGER_TIME=true requires RUN_ONLY_TASK_ID to be set"
    );
  }

  let currentIst = String(process.env.RUN_TARGET_IST_HHMM || "").trim();
  if (!currentIst) {
    currentIst = getCurrentIstHHmm();
  }

  if (!isValidHHmm(currentIst)) {
    throw new Error(`RUN_TARGET_IST_HHMM must be in HH:MM format, received: ${currentIst}`);
  }

  console.log(`[scheduler] Current IST time: ${currentIst} | Window: -${backwardMin}min / +${forwardMin}min`);
  if (onlyTaskId) {
    console.log(`[scheduler] Task filter enabled: ${onlyTaskId}`);
  }
  if (ignoreTriggerTime) {
    console.log("[scheduler] Trigger time check is disabled for this run");
  }

  // Fetch all enabled tasks (optionally filtered by ID).
  const allTasks = await prisma.task.findMany({
    where: {
      enabled: true,
      ...(onlyTaskId ? { id: onlyTaskId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  // Filter tasks using time-window matching (unless ignoring trigger time).
  // Each matched task also gets a `waitMs` indicating if the bot should sleep first.
  let tasks;
  if (ignoreTriggerTime) {
    tasks = allTasks.map((t) => ({ ...t, _waitMs: 0 }));
  } else {
    tasks = [];
    for (const t of allTasks) {
      if (!isValidHHmm(t.triggerTime)) continue;
      const { match, waitMs } = isWithinWindow(t.triggerTime, currentIst, backwardMin, forwardMin);
      if (match) {
        const action = waitMs > 0 ? `will wait ${Math.round(waitMs / 60000)} min` : "run now";
        console.log(`[scheduler] Task ${t.id} (${t.sport}, trigger ${t.triggerTime}) → ${action}`);
        tasks.push({ ...t, _waitMs: waitMs });
      }
    }
  }

  if (tasks.length === 0) {
    console.log(`[scheduler] No due tasks found within window [-${backwardMin}min / +${forwardMin}min] of ${currentIst}. Exiting.`);
    await appendStepSummary([
      "## Scheduled Sports Booking",
      `- No due tasks found within window of IST ${currentIst}.`,
    ]);
    return;
  }

  // Duplicate-run prevention: skip tasks that already ran today.
  const todayIst = getTodayIstDate();
  const todayStart = new Date(`${todayIst}T00:00:00+05:30`);
  const todayEnd = new Date(`${todayIst}T23:59:59+05:30`);

  const filteredTasks = [];
  for (const task of tasks) {
    const existingRun = await prisma.run.findFirst({
      where: {
        taskId: task.id,
        executedAt: { gte: todayStart, lte: todayEnd },
        status: { in: ['success', 'running'] },
      },
    });
    if (existingRun) {
      console.log(`[scheduler] Skipping task ${task.id} (${task.sport}) — already ran today (run ${existingRun.id}, status: ${existingRun.status})`);
    } else {
      filteredTasks.push(task);
    }
  }

  tasks = filteredTasks;

  if (tasks.length === 0) {
    console.log("[scheduler] All matching tasks already ran today. Exiting.");
    await appendStepSummary([
      "## Scheduled Sports Booking",
      "- All matching tasks already ran today.",
    ]);
    return;
  }

  console.log(`[scheduler] Found ${tasks.length} due task(s).`);

  // Build a rich per-run step summary.
  const istNow = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const summaryLines = [
    `## 🏊 Sports Booking — Check Cycle`,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Run time (IST)** | ${istNow} |`,
    `| **Tasks due** | ${tasks.length} |`,
  ];

  let failedCount = 0;

  for (const task of tasks) {
    if (task._waitMs > 0) {
      const waitMin = Math.round(task._waitMs / 60000);
      console.log(`[scheduler] ⏳ Task (${task.sport}) — pre-login, waiting ${waitMin} min until ${task.triggerTime} IST...`);
    }

    console.log(`[scheduler] Running task ${task.id} (${task.sport} at ${task.slotTime})`);

    try {
      const result = await runTask(task);
      console.log(`[scheduler] Task ${task.id} finished with status: ${result.status}`);

      const statusEmoji = result.status === 'success' ? '✅' : result.status === 'unavailable' ? '🔴' : '⏳';
      const windowStatus = result.outsideHours ? '❌ Outside Booking Hours' : '✅ Open';

      summaryLines.push(
        `| **Sport** | ${task.sport} |`,
        `| **Slot** | ${task.slotTime} |`,
        `| **Check time (IST)** | ${result.istDate} ${result.istTime?.replace('-', ':')} |`,
        `| **Booking window** | ${windowStatus} |`,
        `| **Spots available** | ${result.spotsInfo} |`,
        `| **Result** | ${statusEmoji} ${result.status} |`,
        `| **Reason** | ${result.reason || '-'} |`,
        `| **Screenshot** | \`${result.screenshotPath || 'see artifact'}\` |`,
        ``,
        result.status === 'success'
          ? `> ✅ **BOOKED SUCCESSFULLY!** Slot ${task.slotTime} is confirmed.`
          : result.outsideHours
          ? `> ⏳ Booking window not open yet. Next check in ~30 min.`
          : `> ❌ Booking failed: ${result.reason}`,
      );

      if (result.status !== 'success') failedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(`[scheduler] Task ${task.id} crashed: ${error.message}`);
      summaryLines.push(
        `| **Result** | 💥 crashed |`,
        `| **Error** | ${error.message} |`,
      );
    }
  }

  await appendStepSummary(summaryLines);

  if (failedCount > 0) {
    throw new Error(`${failedCount} task(s) failed in scheduled run`);
  }
}

main()
  .catch((error) => {
    console.error("[scheduler] Fatal error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
