const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const healthRoutes = require('./routes/health');
const taskRoutes = require('./routes/tasks');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '100kb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('combined'));

app.use('/api/health', healthRoutes);
app.use('/api/tasks', taskRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler. Client mistakes must answer 4xx, never 5xx, otherwise
// the canary / blue-green error-rate checks would count them as a broken release.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // Raised by express.json(): malformed JSON or a body over the size limit.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  // Raised by Mongoose: schema validation / bad value casts.
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
