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

  await prisma.run.update({
    where: { id: run.id },
    data: {
      status: result.status,
      screenshotPath: result.screenshotPath,
      logs: logger.toJSON(),
    },
  });

  return { runId: run.id, status: result.status, reason: result.reason, screenshotPath: result.screenshotPath };
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

  if (ignoreTriggerTime && !onlyTaskId) {
    throw new Error(
      "Safety check failed: RUN_IGNORE_TRIGGER_TIME=true requires RUN_ONLY_TASK_ID to be set"
    );
  }

  let targetHHmm = String(process.env.RUN_TARGET_IST_HHMM || "").trim();
  if (!targetHHmm) {
    targetHHmm = getCurrentIstHHmm();
  }

  if (!isValidHHmm(targetHHmm)) {
    throw new Error(`RUN_TARGET_IST_HHMM must be in HH:MM format, received: ${targetHHmm}`);
  }

  const where = {
    enabled: true,
    ...(onlyTaskId ? { id: onlyTaskId } : {}),
    ...(ignoreTriggerTime ? {} : { triggerTime: targetHHmm }),
  };

  console.log(`[scheduler] Looking for enabled tasks at IST ${targetHHmm}`);
  if (onlyTaskId) {
    console.log(`[scheduler] Task filter enabled: ${onlyTaskId}`);
  }
  if (ignoreTriggerTime) {
    console.log("[scheduler] Trigger time check is disabled for this run");
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  if (tasks.length === 0) {
    console.log("[scheduler] No due tasks found. Exiting.");
    await appendStepSummary([
      "## Scheduled Sports Booking",
      "- No due tasks matched the current run criteria.",
    ]);
    return;
  }

  console.log(`[scheduler] Found ${tasks.length} due task(s).`);
  const summaryLines = ["## Scheduled Sports Booking", `- Due tasks found: ${tasks.length}`];

  let failedCount = 0;

  for (const task of tasks) {
    console.log(`[scheduler] Running task ${task.id} (${task.sport} at ${task.slotTime})`);

    try {
      const result = await runTask(task);
      console.log(`[scheduler] Task ${task.id} finished with status: ${result.status}`);
      summaryLines.push(
        `- Task ${task.id} (${task.sport} ${task.slotTime}): ${result.status}${result.reason ? ` - ${result.reason}` : ""}`
      );

      if (result.status !== "success") {
        failedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      console.error(`[scheduler] Task ${task.id} crashed: ${error.message}`);
      summaryLines.push(`- Task ${task.id} (${task.sport} ${task.slotTime}): crashed - ${error.message}`);
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
