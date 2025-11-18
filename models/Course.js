const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Course code is required'],
    unique: true,
    trim: true
  },
  description: String,
  type: {
    type: String,
    required: [true, 'Course type is required'],
    enum: ['online', 'campus', 'hybrid']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  grade: {
    type: Number,
    required: [true, 'Grade is required'],
    min: 1,
    max: 10
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },
  duration: {
    type: Number, // in weeks
    min: 1
  },
  schedule: {
    type: String,
    days: [String], // e.g., ["Monday", "Wednesday", "Friday"]
    startTime: String, // "HH:MM"
    endTime: String  // "HH:MM"
  },
  prerequisites: [String],
  objectives: [String],
  materials: [{
    title: String,
    type: {
      type: String,
      enum: ['video', 'pdf', 'assignment', 'quiz', 'other']
    },
    url: String,
    size: Number,
    uploadDate: Date,
    description: String
  }],
  enrolledStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }],
  maxEnrollment: {
    type: Number,
    min: 1
  },
  startDate: Date,
  endDate: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Course', courseSchema);