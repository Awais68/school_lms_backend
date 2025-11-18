const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Route name is required'],
    trim: true
  },
  origin: {
    type: String,
    required: true,
    trim: true
  },
  destination: {
    type: String,
    required: true,
    trim: true
  },
  stops: [{
    name: String,
    location: {
      latitude: Number,
      longitude: Number
    },
    timing: String // "HH:MM"
  }],
  operationalDays: [String], // ["Monday", "Tuesday", ...]
  estimatedDuration: {
    type: Number, // in minutes
    min: 1
  },
  fare: {
    type: Number,
    min: 0
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Route', routeSchema);