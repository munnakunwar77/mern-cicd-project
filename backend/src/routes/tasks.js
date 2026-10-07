const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');

const router = express.Router();

const validId = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  return next();
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
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const task = await Task.create({ title });
    return res.status(201).json(task);
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', validId, async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body.title === 'string') update.title = req.body.title.trim();
    if (typeof req.body.completed === 'boolean') update.completed = req.body.completed;
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
