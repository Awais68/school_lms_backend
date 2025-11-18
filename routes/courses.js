const express = require('express');
const asyncHandler = require('express-async-handler');
const Course = require('../models/Course');
const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get all courses
// @route   GET /api/courses
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { branchId, instructor, grade, type, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (branchId) query.branchId = branchId;
  if (instructor) query.instructor = instructor;
  if (grade) query.grade = grade;
  if (type) query.type = type;

  const courses = await Course.find(query)
    .populate('instructor', 'firstName lastName')
    .populate('branchId', 'name')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const total = await Course.countDocuments(query);

  res.json({
    success: true,
    data: {
      courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get course by ID
// @route   GET /api/courses/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id)
    .populate('instructor', 'firstName lastName')
    .populate('branchId', 'name')
    .populate('enrolledStudents', 'firstName lastName rollNumber');

  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  res.json({
    success: true,
    data: course
  });
}));

// @desc    Create course
// @route   POST /api/courses
// @access  Private/Admin/Teacher
router.post('/', protect, checkRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const {
    title, code, description, type, subject, grade, branchId, instructor,
    duration, schedule, prerequisites, objectives, maxEnrollment, startDate, endDate
  } = req.body;

  // Validation
  if (!title || !code || !type || !subject || !grade || !branchId || !instructor) {
    return res.status(400).json({
      success: false,
      message: 'Please provide required fields: title, code, type, subject, grade, branchId, instructor'
    });
  }

  // Check if course code already exists
  const courseExists = await Course.findOne({ code });

  if (courseExists) {
    return res.status(400).json({
      success: false,
      message: 'Course with this code already exists'
    });
  }

  const course = await Course.create({
    title,
    code,
    description,
    type,
    subject,
    grade,
    branchId,
    instructor,
    duration,
    schedule,
    prerequisites,
    objectives,
    maxEnrollment,
    startDate,
    endDate
  });

  res.status(201).json({
    success: true,
    message: 'Course created successfully',
    data: course
  });
}));

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private/Admin/Teacher
router.put('/:id', protect, checkRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  // Only the instructor or admin can update the course
  if (req.user.role !== 'admin' && course.instructor.toString() !== req.user.id) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this course'
    });
  }

  const updatedCourse = await Course.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  )
  .populate('instructor', 'firstName lastName')
  .populate('branchId', 'name');

  res.json({
    success: true,
    message: 'Course updated successfully',
    data: updatedCourse
  });
}));

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private/Admin
router.delete('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  await course.remove();

  res.json({
    success: true,
    message: 'Course deleted successfully'
  });
}));

// @desc    Enroll students in course
// @route   POST /api/courses/:id/enroll
// @access  Private/Admin/Teacher
router.post('/:id/enroll', protect, checkRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { students } = req.body;

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an array of student IDs'
    });
  }

  const course = await Course.findById(req.params.id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  // Check if course has reached max enrollment
  if (course.maxEnrollment && (course.enrolledStudents.length + students.length) > course.maxEnrollment) {
    return res.status(400).json({
      success: false,
      message: `Cannot enroll more than ${course.maxEnrollment} students in this course`
    });
  }

  // Verify that students exist and get their class/section
  const existingStudents = await Student.find({ _id: { $in: students } });
  const existingStudentIds = existingStudents.map(s => s._id.toString());

  // Check if any students don't exist
  const notFoundStudents = students.filter(s => !existingStudentIds.includes(s));
  if (notFoundStudents.length > 0) {
    return res.status(404).json({
      success: false,
      message: `Students not found: ${notFoundStudents.join(', ')}`
    });
  }

  // Enroll students
  const enrolledStudentsBefore = course.enrolledStudents.length;
  const newStudents = students.filter(s => !course.enrolledStudents.includes(s));
  
  if (newStudents.length === 0) {
    return res.json({
      success: true,
      message: 'Students already enrolled in course',
      data: course
    });
  }

  course.enrolledStudents = [...course.enrolledStudents, ...newStudents];
  await course.save();

  res.json({
    success: true,
    message: `${newStudents.length} students enrolled successfully`,
    data: {
      course,
      newlyEnrolled: newStudents
    }
  });
}));

// @desc    Get enrolled students for a course
// @route   GET /api/courses/:id/students
// @access  Private
router.get('/:id/students', protect, asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id)
    .populate('enrolledStudents', 'firstName lastName rollNumber studentId');

  if (!course) {
    return res.status(404).json({
      success: false,
      message: 'Course not found'
    });
  }

  res.json({
    success: true,
    data: {
      enrolledStudents: course.enrolledStudents,
      totalEnrolled: course.enrolledStudents.length
    }
  });
}));

module.exports = router;