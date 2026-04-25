import express from "express";
import prisma from "../lib/prisma.js";

export default function createLogsRouter() {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    const runs = await prisma.run.findMany({
      include: {
        task: {
          select: {
            sport: true,
            slotTime: true,
          },
        },
      },
      orderBy: {
        executedAt: "desc",
      },
      take: 100,
    });

    const payload = runs.map((run) => ({
      id: run.id,
      taskId: run.taskId,
      date: run.executedAt,
      sport: run.task?.sport || "Unknown",
      slotTime: run.task?.slotTime || "Unknown",
      status: run.status,
      logs: JSON.parse(run.logs || "[]"),
      screenshotPath: run.screenshotPath,
    }));

    res.json(payload);
  });

  return router;
}
