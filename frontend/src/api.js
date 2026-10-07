const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const getHealth = () => request('/health');
export const getTasks = () => request('/tasks');
export const addTask = (title) =>
  request('/tasks', { method: 'POST', body: JSON.stringify({ title }) });
export const setCompleted = (id, completed) =>
  request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ completed }) });
export const removeTask = (id) => request(`/tasks/${id}`, { method: 'DELETE' });
