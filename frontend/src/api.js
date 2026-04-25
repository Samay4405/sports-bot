const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const getWsUrl = () => {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  return API_BASE.replace(/^http/i, "ws") + "/ws";
};

export async function listTasks() {
  const response = await fetch(`${API_BASE}/api/tasks`);
  return response.json();
}

export async function saveTask(payload) {
  const response = await fetch(`${API_BASE}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error((await response.json()).error || "Unable to save task");
  }

  return response.json();
}

export async function runTask(taskId) {
  const response = await fetch(`${API_BASE}/api/tasks/${taskId}/run`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error((await response.json()).error || "Unable to run task");
  }

  return response.json();
}

export async function deleteTask(taskId) {
  const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Unable to delete task");
  }
}

export async function fetchRunHistory() {
  const response = await fetch(`${API_BASE}/api/logs`);
  return response.json();
}

export function screenshotUrl(fileName) {
  if (!fileName) return null;
  return `${API_BASE}/screenshots/${fileName}`;
}
