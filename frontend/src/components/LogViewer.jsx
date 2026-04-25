import { Card } from "./ui/card";

function levelColor(level) {
  if (level === "error") return "text-rose-700";
  if (level === "warn") return "text-amber-700";
  return "text-slate-700";
}

export default function LogViewer({ logs }) {
  return (
    <Card className="animate-rise">
      <h2 className="mb-4 font-display text-xl text-ink">Live Logs</h2>
      <div className="max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">No live logs yet. Trigger a test run or wait for scheduled execution.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {logs.map((line, index) => (
              <li key={`${line.runId}-${index}`} className={levelColor(line.level)}>
                <span className="font-semibold">[{new Date(line.timestamp).toLocaleTimeString()}]</span> {line.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
