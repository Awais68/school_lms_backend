const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
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
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment'
  },
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz'
  },
  gradeType: {
    type: String,
    required: true,
    enum: ['assignment', 'quiz', 'exam', 'participation']
  },
  pointsEarned: {
    type: Number,
    required: true,
    min: 0
  },
  maxPoints: {
    type: Number,
    required: true,
    min: 1
  },
  percentage: Number,
  letterGrade: String, // A+, A, B+, B, C+, C, D, F
  feedback: String,
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true
  },
  gradedDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Grade', gradeSchema);