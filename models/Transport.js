const mongoose = require('mongoose');

const transportSchema = new mongoose.Schema({
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Driver user account
    required: true
  },
  capacity: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    default: 'active',
    enum: ['active', 'maintenance', 'decommissioned']
  },
  assignedStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Transport', transportSchema);