import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';

const json = (body, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const noContent = () => Promise.resolve({ ok: true, status: 204, json: () => Promise.reject() });

let tasks;

// A tiny in-memory fake of the backend API, driven through the global fetch mock.
beforeEach(() => {
  tasks = [{ _id: '1', title: 'Write pipeline', completed: false }];
  globalThis.fetch = vi.fn((url, opts = {}) => {
    const method = opts.method || 'GET';

    if (url.endsWith('/health')) return json({ status: 'ok', version: '7-abc1234' });

    if (url.endsWith('/tasks') && method === 'POST') {
      const created = { _id: '2', title: JSON.parse(opts.body).title, completed: false };
      tasks = [created, ...tasks];
      return json(created, 201);
    }
    if (url.endsWith('/tasks')) return json(tasks);

    const match = url.match(/\/tasks\/(.+)$/);
    if (match && method === 'PUT') {
      tasks = tasks.map((t) =>
        t._id === match[1] ? { ...t, completed: JSON.parse(opts.body).completed } : t
      );
      return json(tasks.find((t) => t._id === match[1]));
    }
    if (match && method === 'DELETE') {
      tasks = tasks.filter((t) => t._id !== match[1]);
      return noContent();
    }
    return json({});
  });
});

afterEach(() => vi.restoreAllMocks());

describe('App', () => {
  it('shows tasks and the deployed API build', async () => {
    render(<App />);
    expect(await screen.findByText('Write pipeline')).toBeInTheDocument();
    expect(await screen.findByText('7-abc1234')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 done')).toBeInTheDocument();
  });

  it('shows the empty state when there are no tasks', async () => {
    tasks = [];
    render(<App />);
    expect(await screen.findByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('adds a task', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Write pipeline');
    await user.type(screen.getByLabelText('New task'), 'Run canary');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(screen.getByText('Run canary')).toBeInTheDocument());
    expect(screen.getByLabelText('New task')).toHaveValue('');
  });

  it('does not call the API when the title is blank', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Write pipeline');
    await user.type(screen.getByLabelText('New task'), '   ');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    const posts = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('marks a task as done', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Write pipeline');
    await user.click(screen.getByRole('checkbox'));
    expect(await screen.findByText('1 of 1 done')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('deletes a task', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Write pipeline');
    await user.click(screen.getByRole('button', { name: 'Delete Write pipeline' }));
    await waitFor(() => expect(screen.queryByText('Write pipeline')).not.toBeInTheDocument());
    expect(screen.getByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('shows the API error message when adding a task is rejected', async () => {
    const user = userEvent.setup();
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn((url, opts = {}) =>
      opts.method === 'POST' ? json({ error: 'Title is required' }, 400) : original(url, opts)
    );
    render(<App />);
    await screen.findByText('Write pipeline');
    await user.type(screen.getByLabelText('New task'), 'Something');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Title is required');
  });

  it('shows an error when the API is down', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    expect(await screen.findByText('unreachable')).toBeInTheDocument();
  });
});
