const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');

const router = express.Router();

const MAX_TITLE_LENGTH = 140;

const validId = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  return next();
};

// Returns { title } when valid, otherwise { error } with a message for the client.
// Non-string values (numbers, objects, arrays) are rejected instead of crashing on .trim().
const parseTitle = (value) => {
  if (value === undefined || value === null) return { error: 'Title is required' };
  if (typeof value !== 'string') return { error: 'Title must be a string' };
  const title = value.trim();
  if (!title) return { error: 'Title is required' };
  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Title must be at most ${MAX_TITLE_LENGTH} characters` };
  }
  return { title };
};

router.get('/', async (_req, res, next) => {
  try {
    res.json(await Task.find().sort({ createdAt: -1 }));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, error } = parseTitle(req.body.title);
    if (error) return res.status(400).json({ error });
    const task = await Task.create({ title });
    return res.status(201).json(task);
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', validId, async (req, res, next) => {
  try {
    const update = {};

    if (req.body.title !== undefined) {
      const { title, error } = parseTitle(req.body.title);
      if (error) return res.status(400).json({ error });
      update.title = title;
    }
    if (typeof req.body.completed === 'boolean') update.completed = req.body.completed;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nothing to update: send "title" and/or "completed"' });
    }

    const task = await Task.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    return res.json(task);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', validId, async (req, res, next) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
