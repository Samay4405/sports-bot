import cron from "node-cron";

export class CronManager {
  constructor({ onTrigger }) {
    this.jobs = new Map();
    this.onTrigger = onTrigger;
  }

  static toCronExpression(triggerTime) {
    const [hourRaw, minuteRaw] = triggerTime.split(":");
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      throw new Error("triggerTime must be in HH:MM format");
    }

    return `0 ${minute} ${hour} * * *`;
  }

  clearAll() {
    for (const [, job] of this.jobs.entries()) {
      job.stop();
    }
    this.jobs.clear();
  }

  registerTask(task) {
    if (!task.enabled) {
      return;
    }

    const expression = CronManager.toCronExpression(task.triggerTime);
    const job = cron.schedule(expression, () => {
      this.onTrigger(task.id).catch((error) => {
        console.error("Scheduled task failed", task.id, error);
      });
    });

    this.jobs.set(task.id, job);
  }

  refresh(tasks) {
    this.clearAll();
    for (const task of tasks) {
      this.registerTask(task);
    }
  }

  remove(taskId) {
    const job = this.jobs.get(taskId);
    if (!job) {
      return;
    }

    job.stop();
    this.jobs.delete(taskId);
  }
}
