import { useEffect, useMemo, useState } from "react";
import { deleteTask, fetchRunHistory, getWsUrl, listTasks, runTask, saveTask } from "../api";
import TaskForm from "../components/TaskForm";
import LogViewer from "../components/LogViewer";
import HistoryTable from "../components/HistoryTable";
import TaskLogs from "../components/TaskLogs";

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [runs, setRuns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [selectedTaskId, setSelectedTaskId] = useState("");

  const latestLogs = useMemo(() => logs.slice(-120), [logs]);

  const loadData = async () => {
    const [taskRows, runRows] = await Promise.all([listTasks(), fetchRunHistory()]);
    setTasks(taskRows);
    setRuns(runRows);
  };

  useEffect(() => {
    loadData().catch((error) => setStatusText(error.message));

    const ws = new WebSocket(getWsUrl());
    ws.onmessage = (event) => {
      const packet = JSON.parse(event.data);
      if (packet.event === "log") {
        setLogs((prev) => [...prev, packet.payload]);
      }
      if (packet.event === "run-complete") {
        loadData().catch(() => null);
      }
    };

    const poll = setInterval(() => {
      fetchRunHistory().then(setRuns).catch(() => null);
    }, 8000);

    return () => {
      ws.close();
      clearInterval(poll);
    };
  }, []);

  const handleSaveTask = async (payload) => {
    setBusy(true);
    setStatusText("Saving task...");
    try {
      await saveTask(payload);
      await loadData();
      setStatusText("Task saved and scheduler refreshed");
    } catch (error) {
      setStatusText(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRunTask = async (taskId) => {
    setBusy(true);
    setStatusText("Running task immediately...");
    try {
      await runTask(taskId);
      setStatusText("Test run finished");
      await loadData();
    } catch (error) {
      setStatusText(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    setBusy(true);
    setStatusText("Deleting task...");
    try {
      await deleteTask(taskId);
      await loadData();
      setStatusText("Task deleted");
    } catch (error) {
      setStatusText(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 animate-rise">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Automated Sports Slot Booking Agent</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-700 sm:text-base">
          Configure login, target sport, and exact trigger time. The scheduler launches Playwright at HH:MM:00,
          streams live logs, and stores screenshot evidence for every run.
        </p>
        <p className="mt-3 inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
          Status: {statusText}
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-2">
        <TaskForm
          tasks={tasks}
          currentTask={null}
          busy={busy}
          onSave={handleSaveTask}
          onRunNow={handleRunTask}
          onDelete={handleDeleteTask}
          onSelectTask={(id) => setSelectedTaskId(id)}
        />
        {selectedTaskId ? <TaskLogs runs={runs} selectedTaskId={selectedTaskId} /> : <LogViewer logs={latestLogs} />}
      </section>

      <section className="mt-5">
        <HistoryTable runs={runs} />
      </section>
    </main>
  );
}
