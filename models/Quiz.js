const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Quiz title is required'],
    trim: true
  },
  description: String,
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },
  quizType: {
    type: String,
    required: true,
    enum: ['practice', 'graded', 'exam']
  },
  totalQuestions: Number,
  totalPoints: Number,
  duration: {
    type: Number, // in minutes
    min: 1
  },
  startDate: Date,
  endDate: Date,
  allowedAttempts: {
    type: Number,
    default: 1
  },
  shuffleQuestions: {
    type: Boolean,
    default: false
  },
  shuffleAnswers: {
    type: Boolean,
    default: false
  },
  negativeMarking: {
    type: Boolean,
    default: false
  },
  assignedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Quiz', quizSchema);