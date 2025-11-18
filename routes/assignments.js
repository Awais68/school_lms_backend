const express = require('express');
const asyncHandler = require('express-async-handler');
const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Grade = require('../models/Grade');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get assignments
// @route   GET /api/assignments
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { course, instructor, assignedTo, status, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (course) query.course = course;
  if (instructor) query.instructor = instructor;
  if (assignedTo) query.assignedTo = assignedTo;
  if (status === 'active') {
    query.isActive = true;
    query.dueDate = { $gte: new Date() };
  } else if (status === 'inactive') {
    query.isActive = false;
  } else if (status === 'overdue') {
    query.dueDate = { $lt: new Date() };
    query.isActive = true;
  }

  const assignments = await Assignment.find(query)
    .populate('course', 'title code')
    .populate('instructor', 'firstName lastName')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ dueDate: -1, createdAt: -1 });

  const total = await Assignment.countDocuments(query);

  res.json({
    success: true,
    data: {
      assignments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get assignment by ID
// @route   GET /api/assignments/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id)
    .populate('course', 'title code')
    .populate('instructor', 'firstName lastName')
    .populate('assignedTo', 'firstName lastName rollNumber');

  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'Assignment not found'
    });
  }

  res.json({
    success: true,
    data: assignment
  });
}));

// @desc    Create assignment
// @route   POST /api/assignments
// @access  Private/Teacher/Admin
router.post('/', protect, checkRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const { title, description, course, assignedTo, dueDate, maxPoints, submissionType, objectives } = req.body;

  if (!title || !course || !dueDate || !maxPoints) {
    return res.status(400).json({
      success: false,
      message: 'Please provide required fields: title, course, dueDate, maxPoints'
    });
  }

  // Check if course exists and user has permission to create assignment for it
  const courseDoc = await Course.findById(course);
  if (!courseDoc) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  // Check authorization - only instructor or admin can create assignment
  if (req.user.role === 'teacher') {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher || !courseDoc.instructor.equals(teacher._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create assignment for this course'
      });
    }
  }

  // If assignedTo is provided, check if students exist
  let assignedStudents = [];
  if (assignedTo && Array.isArray(assignedTo) && assignedTo.length > 0) {
    assignedStudents = await Student.find({ 
      _id: { $in: assignedTo },
      class: courseDoc.class  // Only allow assignment to students in the same class
    });
    
    if (assignedStudents.length !== assignedTo.length) {
      return res.status(404).json({
        success: false,
        message: 'Some students not found or not in the course class'
      });
    }
  }

  const assignment = await Assignment.create({
    title,
    description,
    course,
    instructor: req.user.role === 'admin' ? req.body.instructor : 
                (await Teacher.findOne({ user: req.user.id }))._id,
    dueDate,
    maxPoints,
    submissionType,
    assignedTo: assignedTo || courseDoc.enrolledStudents, // Default to all enrolled students
    objectives
  });

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    const studentIds = assignedTo || courseDoc.enrolledStudents;
    studentIds.forEach(studentId => {
      io.to(`user_${studentId}`).emit('assignment_created', {
        assignmentId: assignment._id,
        title: assignment.title,
        dueDate: assignment.dueDate,
        courseId: assignment.course
      });
    });
  }

  res.status(201).json({
    success: true,
    message: 'Assignment created successfully',
    data: assignment
  });
}));

// @desc    Update assignment
// @route   PUT /api/assignments/:id
// @access  Private/Teacher/Admin
router.put('/:id', protect, checkRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'Assignment not found'
    });
  }

  // Check authorization
  if (req.user.role === 'teacher') {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher || !assignment.instructor.equals(teacher._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this assignment'
      });
    }
  }

  const updatedAssignment = await Assignment.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  )
  .populate('course', 'title code')
  .populate('instructor', 'firstName lastName');

  res.json({
    success: true,
    message: 'Assignment updated successfully',
    data: updatedAssignment
  });
}));

// @desc    Delete assignment
// @route   DELETE /api/assignments/:id
// @access  Private/Teacher/Admin
router.delete('/:id', protect, checkRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'Assignment not found'
    });
  }

  // Check authorization
  if (req.user.role === 'teacher') {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher || !assignment.instructor.equals(teacher._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this assignment'
      });
    }
  }

  // Check if any grades have been assigned for this assignment
  const gradeExists = await Grade.findOne({ assignment: assignment._id });
  if (gradeExists) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete assignment with associated grades'
    });
  }

  await assignment.remove();

  res.json({
    success: true,
    message: 'Assignment deleted successfully'
  });
}));

// @desc    Submit assignment
// @route   POST /api/assignments/:id/submit
// @access  Private/Student
router.post('/:id/submit', protect, checkRole('student'), asyncHandler(async (req, res) => {
  const { submission } = req.body;

  const assignment = await Assignment.findById(req.params.id)
    .populate('course', 'title code')
    .populate('instructor', 'firstName lastName');

  if (!assignment) {
    return res.status(404).json({
      success: false,
      message: 'Assignment not found'
    });
  }

  // Check if assignment is still active and not overdue
  if (!assignment.isActive || new Date(assignment.dueDate) < new Date()) {
    return res.status(400).json({
      success: false,
      message: 'Assignment submission deadline has passed'
    });
  }

  // Check if student is assigned to this assignment
  const student = await Student.findOne({ user: req.user.id });
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student record not found'
    });
  }

  if (!assignment.assignedTo.includes(student._id)) {
    return res.status(403).json({
      success: false,
      message: 'You are not assigned to this assignment'
    });
  }

  // Add submission to assignment
  if (!assignment.submissions) {
    assignment.submissions = [];
  }

  // Check if student has already submitted
  const existingSubmission = assignment.submissions.find(
    sub => sub.student.toString() === student._id.toString()
  );

  if (existingSubmission) {
    return res.status(400).json({
      success: false,
      message: 'Assignment already submitted'
    });
  }

  // Add new submission
  assignment.submissions.push({
    student: student._id,
    submission: submission,
    submittedAt: new Date()
  });

  await assignment.save();

  res.json({
    success: true,
    message: 'Assignment submitted successfully',
    data: {
      assignmentId: assignment._id,
      submittedAt: new Date()
    }
  });
}));

module.exports = router;