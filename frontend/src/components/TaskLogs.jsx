import { Card } from "./ui/card";

function levelColor(level) {
  if (level === "error") return "text-rose-700";
  if (level === "warn") return "text-amber-700";
  return "text-slate-700";
}

function groupByDate(runs) {
  const groups = {};
  runs.forEach((run) => {
    const d = new Date(run.date).toISOString().slice(0, 10);
    groups[d] = groups[d] || [];
    groups[d].push(run);
  });
  // sort keys desc
  const ordered = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));
  return { groups, ordered };
}

export default function TaskLogs({ runs, selectedTaskId }) {
  if (!selectedTaskId) {
    return (
      <Card className="animate-rise">
        <h2 className="mb-4 font-display text-xl text-ink">Task Logs</h2>
        <p className="text-sm text-slate-500">Select a saved task to view day-wise run logs.</p>
      </Card>
    );
  }

  const taskRuns = runs.filter((r) => r.taskId === selectedTaskId).sort((a, b) => new Date(b.date) - new Date(a.date));
  const { groups, ordered } = groupByDate(taskRuns);

  return (
    <Card className="animate-rise">
      <h2 className="mb-4 font-display text-xl text-ink">Task Logs</h2>
      {taskRuns.length === 0 ? (
        <p className="text-sm text-slate-500">No runs for this task yet.</p>
      ) : (
        <div className="space-y-4">
          {ordered.map((day) => (
            <div key={day} className="rounded-md border border-slate-100 bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <strong className="text-sm">{new Date(day).toLocaleDateString()}</strong>
                <span className="text-xs text-slate-500">{groups[day].length} run(s)</span>
              </div>
              <div className="space-y-2 text-sm">
                {groups[day].map((run) => (
                  <div key={run.id} className="rounded-md border border-slate-50 bg-slate-50 p-2">
                    <div className="mb-1 text-xs text-slate-600">{new Date(run.date).toLocaleString()} — <span className="font-medium">{run.status}</span></div>
                    <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100 bg-white p-2">
                      {run.logs.length === 0 ? (
                        <div className="text-xs text-slate-500">No logs captured for this run.</div>
                      ) : (
                        <ul className="space-y-1 text-xs">
                          {run.logs.map((line, idx) => (
                            <li key={`${run.id}-${idx}`} className={levelColor(line.level)}>
                              <span className="font-semibold">[{new Date(line.timestamp).toLocaleTimeString()}]</span> {line.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
