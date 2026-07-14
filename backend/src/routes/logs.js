import express from "express";
import prisma from "../lib/prisma.js";

export default function createLogsRouter() {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    const runs = await prisma.run.findMany({
      orderBy: {
        executedAt: "desc",
      },
      take: 100,
    });

    const taskIds = [...new Set(runs.map((run) => run.taskId))];
    const tasks = await prisma.task.findMany({
      where: {
        id: {
          in: taskIds,
        },
      },
      select: {
        id: true,
        sport: true,
        slotTime: true,
      },
    });

    const taskById = new Map(tasks.map((task) => [task.id, task]));

    const payload = runs.map((run) => ({
      id: run.id,
      taskId: run.taskId,
      date: run.executedAt,
      sport: taskById.get(run.taskId)?.sport || "Unknown",
      slotTime: taskById.get(run.taskId)?.slotTime || "Unknown",
      status: run.status,
      logs: JSON.parse(run.logs || "[]"),
      screenshotPath: run.screenshotPath,
    }));

    res.json(payload);
  });

  return router;
}
