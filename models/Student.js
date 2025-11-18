const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentId: {
    type: String,
    required: [true, 'Student ID is required'],
    unique: true,
    trim: true
  },
  rollNumber: {
    type: String,
    required: [true, 'Roll number is required'],
    trim: true
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  section: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Section',
    required: true
  },
  admissionDate: {
    type: Date,
    required: [true, 'Admission date is required']
  },
  dateOfBirth: Date,
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Reference to parent user
  },
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  medicalInformation: {
    allergies: [String],
    conditions: [String],
    medications: [String]
  },
  transport: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transport'
  },
  biometricId: {
    type: String,
    unique: true,
    sparse: true // Allow null values
  },
  biometricRegistrationDate: Date,
  biometricStatus: {
    type: String,
    enum: ['registered', 'inactive', 'requires_re_enrollment'],
    default: 'inactive'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  academicHistory: [{
    class: String,
    year: String,
    grade: String
  }]
}, {
  timestamps: true
});

// Method to register biometric ID
studentSchema.methods.registerBiometric = function(biometricId) {
  this.biometricId = biometricId;
  this.biometricStatus = 'registered';
  this.biometricRegistrationDate = new Date();
  return this.save();
};

// Method to deactivate biometric
studentSchema.methods.deactivateBiometric = function() {
  this.biometricStatus = 'inactive';
  return this.save();
};

module.exports = mongoose.model('Student', studentSchema);