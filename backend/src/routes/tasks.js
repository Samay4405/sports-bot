import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import prisma from "../lib/prisma.js";
import { encryptText, decryptText } from "../lib/encrypt.js";
import { RunLogger } from "../lib/logger.js";
import { runBookingAgent } from "../bot/bookingAgent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseNextSlots(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((slot) => slot.trim())
    .filter(Boolean);
}

function sanitizeTask(task) {
  return {
    id: task.id,
    websiteUrl: task.websiteUrl,
    username: task.username,
    sport: task.sport,
    slotTime: task.slotTime,
    triggerTime: task.triggerTime,
    enabled: task.enabled,
    createdAt: task.createdAt,
    hasPassword: Boolean(task.password),
  };
}

export default function createTaskRouter({ cronManager, logHub }) {
  const router = express.Router();

  const runTaskNow = async (taskId) => {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new Error("Task not found");
    }

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
      emitter: (event, payload) => logHub.emit(event, payload),
    });

    logger.push("Run started");

    // Create per-run screenshot subdirectory: screenshots/YYYY-MM-DD/HH-MM-IST-manual-{runId}/
    const now = new Date();
    const istDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const istTime = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).replace(':', '-');
    const screenshotsBase = path.resolve(__dirname, "../../screenshots");
    const runSubdir = path.join(screenshotsBase, istDate, `${istTime}-IST-manual-${run.id.slice(0, 8)}`);
    await fs.mkdir(runSubdir, { recursive: true });

    const result = await runBookingAgent(
      {
        ...task,
        decryptedPassword: decryptText(task.password),
        nextSlotTimes: parseNextSlots(task.nextSlotTimes),
      },
      logger,
      { screenshotDir: runSubdir }
    );

    await prisma.run.update({
      where: { id: run.id },
      data: {
        status: result.status,
        screenshotPath: result.screenshotPath,
        logs: logger.toJSON(),
      },
    });

    logHub.emit("run-complete", {
      taskId: task.id,
      runId: run.id,
      status: result.status,
      reason: result.reason,
      screenshotPath: result.screenshotPath,
    });

    return result;
  };

  router.post("/", async (req, res) => {
    const { id, websiteUrl, username, password, sport, slotTime, triggerTime, enabled } = req.body;

    if (!websiteUrl || !username || !sport || !slotTime || !triggerTime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (id) {
      const existing = await prisma.task.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ error: "Task not found" });
      }

      const encryptedPassword = password
        ? encryptText(password)
        : existing.password;

      const updated = await prisma.task.update({
        where: { id },
        data: {
          websiteUrl,
          username,
          password: encryptedPassword,
          sport,
          slotTime,
          triggerTime,
          enabled: Boolean(enabled),
        },
      });

      const activeTasks = await prisma.task.findMany({ where: { enabled: true } });
      cronManager.refresh(activeTasks);

      return res.json(sanitizeTask(updated));
    }

    if (!password) {
      return res.status(400).json({ error: "Password is required for new tasks" });
    }

    const created = await prisma.task.create({
      data: {
        websiteUrl,
        username,
        password: encryptText(password),
        sport,
        slotTime,
        triggerTime,
        enabled: Boolean(enabled),
      },
    });

    const activeTasks = await prisma.task.findMany({ where: { enabled: true } });
    cronManager.refresh(activeTasks);

    return res.status(201).json(sanitizeTask(created));
  });

  router.get("/", async (_req, res) => {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(tasks.map(sanitizeTask));
  });

  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    await prisma.run.deleteMany({ where: { taskId: id } });
    await prisma.task.delete({ where: { id } });
    cronManager.remove(id);

    res.status(204).send();
  });

  router.post("/:id/run", async (req, res) => {
    const { id } = req.params;

    try {
      const result = await runTaskNow(id);
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  return { router, runTaskNow };
}
