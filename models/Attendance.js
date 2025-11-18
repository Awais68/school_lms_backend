const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['present', 'absent', 'late', 'excused']
  },
  method: {
    type: String,
    required: true,
    enum: ['manual', 'biometric', 'gps']
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Teacher or Admin who marked attendance
  },
  biometricData: {
    deviceId: String,
    timestamp: Date,
    fingerprintId: String
  },
  gpsData: {
    latitude: Number,
    longitude: Number,
    accuracy: Number
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate attendance records
attendanceSchema.index({ student: 1, date: 1, course: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);