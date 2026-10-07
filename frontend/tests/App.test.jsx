import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';

const json = (body, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

let tasks;

beforeEach(() => {
  tasks = [{ _id: '1', title: 'Write pipeline', completed: false }];
  globalThis.fetch = vi.fn((url, opts = {}) => {
    if (url.endsWith('/health')) return json({ status: 'ok', version: '7-abc1234' });
    if (url.endsWith('/tasks') && opts.method === 'POST') {
      const created = { _id: '2', title: JSON.parse(opts.body).title, completed: false };
      tasks = [created, ...tasks];
      return json(created, 201);
    }
    if (url.endsWith('/tasks')) return json(tasks);
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

  it('adds a task', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Write pipeline');
    await user.type(screen.getByLabelText('New task'), 'Run canary');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(screen.getByText('Run canary')).toBeInTheDocument());
  });

  it('shows an error when the API is down', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });
});
