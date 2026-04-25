import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import http from "http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import prisma from "./lib/prisma.js";
import createTaskRouter from "./routes/tasks.js";
import createLogsRouter from "./routes/logs.js";
import { CronManager } from "./scheduler/cronManager.js";
import { LiveLogHub } from "./lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const screenshotsDir = path.resolve(__dirname, "../screenshots");
await fs.mkdir(screenshotsDir, { recursive: true });
app.use("/screenshots", express.static(screenshotsDir));

const logHub = new LiveLogHub();
let taskRunner = null;

const cronManager = new CronManager({
  onTrigger: async (taskId) => {
    if (!taskRunner) return;
    await taskRunner(taskId);
  },
});

const { router: tasksRouter, runTaskNow } = createTaskRouter({ cronManager, logHub });
taskRunner = runTaskNow;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

app.use("/api/tasks", tasksRouter);
app.use("/api/logs", createLogsRouter());

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  logHub.addClient(socket);
  socket.send(JSON.stringify({ event: "connected", payload: { at: Date.now() } }));
});

async function bootstrapCronJobs() {
  const activeTasks = await prisma.task.findMany({ where: { enabled: true } });
  cronManager.refresh(activeTasks);
}

await bootstrapCronJobs();

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  cronManager.clearAll();
  await prisma.$disconnect();
  process.exit(0);
});
