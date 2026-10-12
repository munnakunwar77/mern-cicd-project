const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mern_cicd';

let retryTimer;

// MongoDB may not be reachable yet when the container starts (Atlas allow-list
// propagation, NAT warm-up, local compose start order). Keep retrying with a
// growing delay instead of giving up after the first failure; /api/health
// reports 503 until a connection exists, so no traffic reaches a half-started task.
async function connectWithRetry(attempt = 1) {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');
  } catch (err) {
    const delayMs = Math.min(30000, attempt * 2000);
    console.error(
      `MongoDB connection error (attempt ${attempt}): ${err.message} - retrying in ${delayMs / 1000}s`
    );
    retryTimer = setTimeout(() => connectWithRetry(attempt + 1), delayMs);
  }
}

function start() {
  // The server starts listening first so the health endpoint can report
  // "degraded" while Mongo is still connecting.
  const server = app.listen(PORT, () => console.log(`API listening on ${PORT}`));

  connectWithRetry();

  // ECS sends SIGTERM during deployments - drain connections gracefully.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    clearTimeout(retryTimer);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
