export class RunLogger {
  constructor({ taskId, runId, emitter }) {
    this.taskId = taskId;
    this.runId = runId;
    this.lines = [];
    this.emitter = emitter;
  }

  push(message, level = "info") {
    const timestamp = new Date().toISOString();
    const epochMs = Date.now();
    const line = { taskId: this.taskId, runId: this.runId, level, timestamp, epochMs, message };

    this.lines.push(line);
    if (this.emitter) {
      this.emitter("log", line);
    }
  }

  toJSON() {
    return JSON.stringify(this.lines);
  }
}

export class LiveLogHub {
  constructor() {
    this.clients = new Set();
  }

  addClient(socket) {
    this.clients.add(socket);
    socket.on("close", () => this.clients.delete(socket));
  }

  emit(event, payload) {
    const message = JSON.stringify({ event, payload });
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }
}
