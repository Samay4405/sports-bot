import { Card } from "./ui/card";
import { screenshotUrl } from "../api";

const badgeStyles = {
  success: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  unavailable: "bg-amber-100 text-amber-700",
  running: "bg-blue-100 text-blue-700",
};

export default function HistoryTable({ runs }) {
  return (
    <Card className="animate-rise">
      <h2 className="mb-4 font-display text-xl text-ink">Task History</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Sport</th>
              <th className="px-3 py-2">Slot</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Screenshot</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={5}>
                  No task runs yet.
                </td>
              </tr>
            )}
            {runs.map((run) => {
              const shot = screenshotUrl(run.screenshotPath);
              return (
                <tr key={run.id} className="border-b border-slate-100">
                  <td className="px-3 py-3">{new Date(run.date).toLocaleString()}</td>
                  <td className="px-3 py-3">{run.sport}</td>
                  <td className="px-3 py-3">{run.slotTime}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeStyles[run.status] || "bg-slate-100 text-slate-700"}`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {shot ? (
                      <a href={shot} target="_blank" rel="noreferrer">
                        <img
                          src={shot}
                          alt="run screenshot"
                          className="h-12 w-20 rounded-md border border-slate-200 object-cover"
                        />
                      </a>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
