const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  registrationNumber: {
    type: String,
    required: [true, 'Registration number is required'],
    unique: true,
    trim: true
  },
  model: String,
  manufacturer: String,
  year: Number,
  capacity: {
    type: Number,
    required: true,
    min: 1
  },
  fuelType: {
    type: String,
    enum: ['diesel', 'petrol', 'electric', 'cng']
  },
  insuranceExpiry: Date,
  permitExpiry: Date,
  fitnessExpiry: Date,
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  status: {
    type: String,
    default: 'active',
    enum: ['active', 'maintenance', 'decommissioned']
  },
  lastServiceDate: Date,
  nextServiceDate: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('Vehicle', vehicleSchema);