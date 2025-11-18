const express = require('express');
const asyncHandler = require('express-async-handler');
const Grade = require('../models/Grade');
const Assignment = require('../models/Assignment');
const Quiz = require('../models/Quiz');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get grades
// @route   GET /api/grades
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { student, course, assignment, quiz, gradeType, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (student) query.student = student;
  if (course) query.course = course;
  if (assignment) query.assignment = assignment;
  if (quiz) query.quiz = quiz;
  if (gradeType) query.gradeType = gradeType;

  const grades = await Grade.find(query)
    .populate('student', 'firstName lastName rollNumber studentId')
    .populate('course', 'title code')
    .populate('assignment', 'title')
    .populate('quiz', 'title')
    .populate('gradedBy', 'firstName lastName')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const total = await Grade.countDocuments(query);

  res.json({
    success: true,
    data: {
      grades,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get grade by ID
// @route   GET /api/grades/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const grade = await Grade.findById(req.params.id)
    .populate('student', 'firstName lastName rollNumber studentId')
    .populate('course', 'title code')
    .populate('assignment', 'title')
    .populate('quiz', 'title')
    .populate('gradedBy', 'firstName lastName');

  if (!grade) {
    return res.status(404).json({
      success: false,
      message: 'Grade not found'
    });
  }

  // Check authorization
  if (req.user.role === 'student') {
    const student = await Student.findOne({ user: req.user.id });
    if (!student || grade.student._id.toString() !== student._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this grade'
      });
    }
  } else if (req.user.role === 'parent') {
    const student = await Student.findOne({ _id: grade.student._id, parent: req.user.id });
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this grade'
      });
    }
  }

  res.json({
    success: true,
    data: grade
  });
}));

// @desc    Create grade
// @route   POST /api/grades
// @access  Private/Teacher/Admin
router.post('/', protect, checkRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const { student, course, assignment, quiz, gradeType, pointsEarned, maxPoints, feedback } = req.body;

  if (!student || !course || !gradeType || pointsEarned === undefined || maxPoints === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Please provide required fields: student, course, gradeType, pointsEarned, maxPoints'
    });
  }

  if (pointsEarned < 0 || pointsEarned > maxPoints) {
    return res.status(400).json({
      success: false,
      message: 'Points earned must be between 0 and max points'
    });
  }

  // Check if student exists and is enrolled in the course
  const studentDoc = await Student.findById(student);
  if (!studentDoc) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  const courseDoc = await Course.findById(course);
  if (!courseDoc || !courseDoc.enrolledStudents.includes(student)) {
    return res.status(400).json({
      success: false,
      message: 'Student is not enrolled in this course'
    });
  }

  // Check if assignment/quiz exists and belongs to the course
  if (assignment) {
    const assignmentDoc = await Assignment.findById(assignment);
    if (!assignmentDoc || !assignmentDoc.course.equals(course)) {
      return res.status(400).json({
        success: false,
        message: 'Assignment not found or does not belong to this course'
      });
    }
  }

  if (quiz) {
    const quizDoc = await Quiz.findById(quiz);
    if (!quizDoc || !quizDoc.course.equals(course)) {
      return res.status(400).json({
        success: false,
        message: 'Quiz not found or does not belong to this course'
      });
    }
  }

  // Calculate percentage and letter grade
  const percentage = (pointsEarned / maxPoints) * 100;
  let letterGrade = '';
  
  if (percentage >= 90) letterGrade = 'A+';
  else if (percentage >= 85) letterGrade = 'A';
  else if (percentage >= 80) letterGrade = 'A-';
  else if (percentage >= 75) letterGrade = 'B+';
  else if (percentage >= 70) letterGrade = 'B';
  else if (percentage >= 65) letterGrade = 'B-';
  else if (percentage >= 60) letterGrade = 'C+';
  else if (percentage >= 55) letterGrade = 'C';
  else if (percentage >= 50) letterGrade = 'C-';
  else if (percentage >= 45) letterGrade = 'D';
  else letterGrade = 'F';

  // Check authorization - only instructor or admin can create grade
  if (req.user.role === 'teacher') {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher || !courseDoc.instructor.equals(teacher._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to grade for this course'
      });
    }
  }

  const grade = await Grade.create({
    student,
    course,
    assignment,
    quiz,
    gradeType,
    pointsEarned,
    maxPoints,
    percentage,
    letterGrade,
    feedback,
    gradedBy: req.user.role === 'admin' ? req.body.gradedBy : 
              (await Teacher.findOne({ user: req.user.id }))._id
  });

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${student}`).emit('grade_updated', {
      gradeId: grade._id,
      studentId: student,
      courseId: course,
      pointsEarned: grade.pointsEarned,
      maxPoints: grade.maxPoints,
      percentage: grade.percentage,
      letterGrade: grade.letterGrade
    });
  }

  res.status(201).json({
    success: true,
    message: 'Grade created successfully',
    data: grade
  });
}));

// @desc    Update grade
// @route   PUT /api/grades/:id
// @access  Private/Teacher/Admin
router.put('/:id', protect, checkRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const { pointsEarned, maxPoints, feedback } = req.body;

  const grade = await Grade.findById(req.params.id);
  if (!grade) {
    return res.status(404).json({
      success: false,
      message: 'Grade not found'
    });
  }

  // Check authorization
  const courseDoc = await Course.findById(grade.course);
  if (req.user.role === 'teacher') {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher || !courseDoc.instructor.equals(teacher._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this grade'
      });
    }
  }

  if (pointsEarned !== undefined) {
    if (pointsEarned < 0 || pointsEarned > maxPoints) {
      return res.status(400).json({
        success: false,
        message: 'Points earned must be between 0 and max points'
      });
    }

    grade.pointsEarned = pointsEarned;
  }

  if (maxPoints !== undefined) {
    if (maxPoints <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Max points must be greater than 0'
      });
    }

    grade.maxPoints = maxPoints;
  }

  // Update percentage and letter grade based on new values
  if (grade.pointsEarned !== undefined && grade.maxPoints !== undefined) {
    const percentage = (grade.pointsEarned / grade.maxPoints) * 100;
    grade.percentage = percentage;

    let letterGrade = '';
    if (percentage >= 90) letterGrade = 'A+';
    else if (percentage >= 85) letterGrade = 'A';
    else if (percentage >= 80) letterGrade = 'A-';
    else if (percentage >= 75) letterGrade = 'B+';
    else if (percentage >= 70) letterGrade = 'B';
    else if (percentage >= 65) letterGrade = 'B-';
    else if (percentage >= 60) letterGrade = 'C+';
    else if (percentage >= 55) letterGrade = 'C';
    else if (percentage >= 50) letterGrade = 'C-';
    else if (percentage >= 45) letterGrade = 'D';
    else letterGrade = 'F';

    grade.letterGrade = letterGrade;
  }

  if (feedback !== undefined) {
    grade.feedback = feedback;
  }

  const updatedGrade = await grade.save();

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${grade.student}`).emit('grade_updated', {
      gradeId: updatedGrade._id,
      studentId: grade.student,
      courseId: grade.course,
      pointsEarned: updatedGrade.pointsEarned,
      maxPoints: updatedGrade.maxPoints,
      percentage: updatedGrade.percentage,
      letterGrade: updatedGrade.letterGrade
    });
  }

  res.json({
    success: true,
    message: 'Grade updated successfully',
    data: updatedGrade
  });
}));

// @desc    Delete grade
// @route   DELETE /api/grades/:id
// @access  Private/Admin
router.delete('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const grade = await Grade.findById(req.params.id);
  if (!grade) {
    return res.status(404).json({
      success: false,
      message: 'Grade not found'
    });
  }

  await grade.remove();

  res.json({
    success: true,
    message: 'Grade deleted successfully'
  });
}));

// @desc    Get student grades summary
// @route   GET /api/grades/student/:studentId/summary
// @access  Private
router.get('/student/:studentId/summary', protect, asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.studentId);
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  // Check authorization
  if (req.user.role === 'student') {
    if (student.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this student\'s grades'
      });
    }
  } else if (req.user.role === 'parent') {
    if (student.parent.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this student\'s grades'
      });
    }
  }

  const allGrades = await Grade.find({ student: req.params.studentId })
    .populate('course', 'title code')
    .populate('assignment', 'title')
    .populate('quiz', 'title');

  // Group by course and calculate averages
  const gradesByCourse = {};
  const courseAverages = {};
  const allCourses = [...new Set(allGrades.map(g => g.course._id.toString()))];

  for (const courseId of allCourses) {
    const courseGrades = allGrades.filter(g => g.course._id.toString() === courseId);
    
    if (courseGrades.length > 0) {
      const totalPoints = courseGrades.reduce((sum, g) => sum + g.percentage, 0);
      const average = totalPoints / courseGrades.length;
      
      gradesByCourse[courseId] = courseGrades.map(grade => ({
        _id: grade._id,
        type: grade.gradeType,
        assignmentTitle: grade.assignment?.title,
        quizTitle: grade.quiz?.title,
        pointsEarned: grade.pointsEarned,
        maxPoints: grade.maxPoints,
        percentage: grade.percentage,
        letterGrade: grade.letterGrade
      }));
      
      courseAverages[courseId] = {
        course: courseGrades[0].course,
        average: parseFloat(average.toFixed(2)),
        totalGrades: courseGrades.length,
        grades: gradesByCourse[courseId]
      };
    }
  }

  // Calculate overall GPA
  const allAverages = Object.values(courseAverages).map(c => c.average);
  const overallGPA = allAverages.length > 0 
    ? parseFloat((allAverages.reduce((sum, avg) => sum + avg, 0) / allAverages.length).toFixed(2))
    : 0;

  res.json({
    success: true,
    data: {
      gradesByCourse: courseAverages,
      overallGPA,
      totalGrades: allGrades.length
    }
  });
}));

module.exports = router;