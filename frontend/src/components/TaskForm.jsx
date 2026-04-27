import { useMemo, useState } from "react";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

const SLOT_LABEL_OPTIONS = [
  "7:00 AM – 7:45 AM",
  "8:00 AM – 8:45 AM",
  "9:00 AM – 9:45 AM",
  "10:00 AM – 10:45 AM",
  "11:00 AM – 11:45 AM",
  "12:00 PM – 12:45 PM",
  "__custom__",
];

const EMPTY_FORM = {
  id: "",
  websiteUrl: "",
  username: "",
  password: "",
  sport: "",
  customSport: "",
  slotTime: "7:00 AM – 7:45 AM",
  customSlotTime: "",
  triggerTime: "05:00:00",
  enabled: true,
};

export default function TaskForm({
  tasks,
  currentTask,
  onSave,
  onRunNow,
  onDelete,
  busy,
}) {
  const [form, setForm] = useState(() => currentTask || EMPTY_FORM);

  const sports = useMemo(() => {
    const unique = new Set(tasks.map((task) => task.sport).filter(Boolean));
    if (form.sport && !unique.has(form.sport)) unique.add(form.sport);
    return Array.from(unique);
  }, [tasks, form.sport]);

  const effectiveSport = form.sport === "__custom__" ? form.customSport : form.sport;
  const effectiveSlotTime = form.slotTime === "__custom__" ? form.customSlotTime : form.slotTime;

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const loadTask = (taskId) => {
    if (!taskId) {
      setForm(EMPTY_FORM);
      return;
    }
    const selected = tasks.find((task) => task.id === taskId);
    if (selected) {
      setForm({ ...selected, password: "", customSport: "", customSlotTime: "" });
    }
  };

  const handleSave = (event) => {
    event.preventDefault();
    onSave({
      ...form,
      sport: effectiveSport,
      slotTime: effectiveSlotTime,
      triggerTime: form.triggerTime.slice(0, 5),
    });
  };

  return (
    <Card className="animate-rise">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-ink">Task Configuration</h2>
        <Select value={form.id} onChange={(e) => loadTask(e.target.value)} className="max-w-xs">
          <option value="">New Task</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.sport} at {task.slotTime} ({task.triggerTime})
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-700">Saved Tasks ({tasks.length})</p>
        {tasks.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">No tasks yet. Save one to see it listed here.</p>
        ) : (
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto pr-1 text-xs text-slate-700">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-md border border-slate-200 bg-white px-2 py-1">
                {task.sport} at {task.slotTime} (trigger {task.triggerTime})
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleSave} className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">Target Website URL</label>
          <Input
            required
            value={form.websiteUrl}
            onChange={(e) => update({ websiteUrl: e.target.value })}
            placeholder="https://sports.college.edu/booking"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Username / Student ID</label>
          <Input
            required
            value={form.username}
            onChange={(e) => update({ username: e.target.value })}
            placeholder="student123"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => update({ password: e.target.value })}
            placeholder={form.id ? "Leave empty to keep saved password" : "Enter password"}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Sport</label>
          <Select
            required
            value={sports.includes(form.sport) ? form.sport : form.sport ? "__custom__" : ""}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                update({ sport: "__custom__", customSport: "" });
              } else {
                update({ sport: e.target.value, customSport: "" });
              }
            }}
          >
            <option value="">Choose sport</option>
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
            <option value="__custom__">Enter manually</option>
          </Select>
          {form.sport === "__custom__" && (
            <Input
              className="mt-2"
              value={form.customSport}
              onChange={(e) => update({ customSport: e.target.value })}
              placeholder="e.g., Badminton"
              required
            />
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Preferred Slot Label</label>
          <Select
            required
            value={SLOT_LABEL_OPTIONS.includes(form.slotTime) ? form.slotTime : form.slotTime ? "__custom__" : ""}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                update({ slotTime: "__custom__", customSlotTime: "" });
              } else {
                update({ slotTime: e.target.value, customSlotTime: "" });
              }
            }}
          >
            <option value="">Choose exact slot label</option>
            {SLOT_LABEL_OPTIONS.map((slot) => (
              <option key={slot} value={slot}>
                {slot === "__custom__" ? "Enter manually" : slot}
              </option>
            ))}
          </Select>
          {form.slotTime === "__custom__" && (
            <Input
              className="mt-2"
              value={form.customSlotTime}
              onChange={(e) => update({ customSlotTime: e.target.value })}
              placeholder="7:00 AM – 7:45 AM"
              required
            />
          )}
          <p className="mt-1 text-xs text-slate-500">
            Paste the exact slot text shown on the website so the bot can match it.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Trigger Bot At</label>
          <Input
            required
            type="time"
            step="1"
            value={form.triggerTime}
            onChange={(e) => update({ triggerTime: e.target.value })}
          />
        </div>

        <div className="flex items-end gap-3">
          <div>
            <p className="text-sm font-medium">Task Enabled</p>
            <p className="text-xs text-slate-500">Disable to keep config without scheduling</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(enabled) => update({ enabled })} />
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
          <Button type="submit" disabled={busy || !effectiveSport}>
            Save Task
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !form.id}
            onClick={() => onRunNow(form.id)}
          >
            Run Now (Test)
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={busy || !form.id}
            onClick={() => {
              onDelete(form.id);
              setForm(EMPTY_FORM);
            }}
          >
            Delete Task
          </Button>
        </div>
      </form>
    </Card>
  );
}
