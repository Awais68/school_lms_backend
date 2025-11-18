const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');

const router = express.Router();

// @desc    Health check endpoint
// @route   GET /health
// @access  Public
router.get('/health', asyncHandler(async (req, res) => {
  try {
    // Check database connection
    const dbOk = mongoose.connection.readyState === 1;
    
    // Check other services as needed
    const services = {
      database: {
        status: dbOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 100) / 100
      },
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    };

    const isHealthy = dbOk;

    res.status(isHealthy ? 200 : 503).json({
      success: true,
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// @desc    Ping endpoint
// @route   GET /health/ping
// @access  Public
router.get('/ping', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString()
  });
}));

// @desc    Get server info
// @route   GET /health/info
// @access  Public
router.get('/info', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      name: process.env.npm_package_name || 'School LMS API',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch
    }
  });
}));

module.exports = router;