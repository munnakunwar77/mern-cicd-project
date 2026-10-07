import { useCallback, useEffect, useState } from 'react';
import { addTask, getHealth, getTasks, removeTask, setCompleted } from './api.js';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState('');

  const load = useCallback(async () => {
    try {
      setTasks(await getTasks());
      setError('');
    } catch (err) {
      setError(`Could not load tasks: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    load();
    getHealth()
      .then((h) => setVersion(h.version))
      .catch(() => setVersion('unreachable'));
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await addTask(title.trim());
      setTitle('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (task) => {
    try {
      await setCompleted(task._id, !task.completed);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (task) => {
    try {
      await removeTask(task._id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const done = tasks.filter((t) => t.completed).length;

  return (
    <main className="board">
      <header className="board__head">
        <h1>Release board</h1>
        <p className="board__build" aria-label="Deployed API version">
          API build <strong>{version || '…'}</strong>
        </p>
      </header>

      <form className="board__form" onSubmit={handleAdd}>
        <label htmlFor="new-task" className="sr-only">
          New task
        </label>
        <input
          id="new-task"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to ship?"
          maxLength={140}
        />
        <button type="submit">Add task</button>
      </form>

      {error && (
        <p role="alert" className="board__error">
          {error}
        </p>
      )}

      {tasks.length === 0 ? (
        <p className="board__empty">No tasks yet. Add the first thing you want to ship.</p>
      ) : (
        <>
          <p className="board__count">
            {done} of {tasks.length} done
          </p>
          <ul className="board__list">
            {tasks.map((task) => (
              <li key={task._id} className={task.completed ? 'is-done' : ''}>
                <label>
                  <input type="checkbox" checked={task.completed} onChange={() => toggle(task)} />
                  <span>{task.title}</span>
                </label>
                <button type="button" onClick={() => remove(task)} aria-label={`Delete ${task.title}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
