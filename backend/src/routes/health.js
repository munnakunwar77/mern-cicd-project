const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

// Used by the ALB target-group health check, the Docker HEALTHCHECK and the
// deployment scripts. Returns 503 when MongoDB is unreachable so a bad
// release never receives traffic.
router.get('/', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'connected' : 'disconnected',
    version: process.env.APP_VERSION || 'dev',
    uptime: Math.round(process.uptime())
  });
});

module.exports = router;
