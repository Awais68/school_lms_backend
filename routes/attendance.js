const express = require('express');
const asyncHandler = require('express-async-handler');
const Attendance = require('../models/Attendance');
const Course = require('../models/Course');
const Student = require('../models/Student');
const User = require('../models/User');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Mark attendance
// @route   POST /api/attendance/mark
// @access  Private/Teacher/Admin
router.post('/mark', protect, checkRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { attendanceRecords } = req.body;

  if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide attendance records'
    });
  }

  const results = [];
  const errors = [];

  for (const record of attendanceRecords) {
    try {
      const { student, course, date, status, method = 'manual' } = record;

      // Validate required fields
      if (!student || !course || !date || !status) {
        errors.push({
          record,
          error: 'Missing required fields: student, course, date, status'
        });
        continue;
      }

      // Check if student is enrolled in the course
      const courseDoc = await Course.findById(course);
      if (!courseDoc || !courseDoc.enrolledStudents.includes(student)) {
        errors.push({
          record,
          error: 'Student is not enrolled in this course'
        });
        continue;
      }

      // Check if attendance already exists for this date
      const existingAttendance = await Attendance.findOne({
        student,
        course,
        date: { 
          $gte: new Date(date).setHours(0, 0, 0, 0), 
          $lt: new Date(date).setHours(24, 0, 0, 0) 
        }
      });

      if (existingAttendance) {
        results.push({
          ...record,
          status: 'already_marked',
          attendanceId: existingAttendance._id
        });
        continue;
      }

      // Create attendance record
      const attendance = await Attendance.create({
        student,
        course,
        date: new Date(date),
        status,
        method,
        markedBy: req.user.id
      });

      results.push({
        ...record,
        attendanceId: attendance._id,
        status: 'marked'
      });

      // Emit real-time notification
      const io = req.app.get('io');
      if (io) {
        io.emit('attendance_updated', {
          studentId: student,
          courseId: course,
          date,
          status
        });
      }
    } catch (error) {
      errors.push({
        record,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    message: 'Attendance marked successfully',
    data: {
      results,
      errors,
      processed: results.length,
      failed: errors.length
    }
  });
}));

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { student, course, startDate, endDate, status, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (student) query.student = student;
  if (course) query.course = course;
  if (status) query.status = status;

  // Date range filter
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const attendanceRecords = await Attendance.find(query)
    .populate('student', 'firstName lastName rollNumber studentId')
    .populate('course', 'title code')
    .populate('markedBy', 'firstName lastName')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ date: -1, createdAt: -1 });

  const total = await Attendance.countDocuments(query);

  res.json({
    success: true,
    data: {
      attendanceRecords,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get attendance for a specific student
// @route   GET /api/attendance/student/:studentId
// @access  Private
router.get('/student/:studentId', protect, asyncHandler(async (req, res) => {
  const { startDate, endDate, course, page = 1, limit = 10 } = req.query;

  // Check if user has permission to view this student's data
  const student = await Student.findById(req.params.studentId);
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  // Only allow access if:
  // 1. User is admin
  // 2. User is the student themselves
  // 3. User is the parent of the student
  // 4. User is a teacher teaching a course the student is enrolled in
  if (req.user.role !== 'admin') {
    if (req.user.role === 'student' && student.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this student\'s attendance'
      });
    }
    
    if (req.user.role === 'parent' && student.parent && student.parent.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this student\'s attendance'
      });
    }
  }

  // Build query
  let query = { student: req.params.studentId };
  if (course) query.course = course;

  // Date range filter
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const attendanceRecords = await Attendance.find(query)
    .populate('course', 'title code')
    .populate('markedBy', 'firstName lastName')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ date: -1 });

  // Calculate attendance statistics
  const allRecords = await Attendance.find(query);
  const presentCount = allRecords.filter(record => record.status === 'present').length;
  const totalCount = allRecords.length;
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  const total = await Attendance.countDocuments(query);

  res.json({
    success: true,
    data: {
      attendanceRecords,
      statistics: {
        total: totalCount,
        present: presentCount,
        absent: totalCount - presentCount,
        attendanceRate
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get attendance summary for a class
// @route   GET /api/attendance/class/:classId
// @access  Private
router.get('/class/:classId', protect, asyncHandler(async (req, res) => {
  const { startDate, endDate, section } = req.query;

  // Build query - get all students in the class
  let studentQuery = { class: req.params.classId };
  if (section) studentQuery.section = section;

  const students = await Student.find(studentQuery);
  const studentIds = students.map(s => s._id);

  // Build attendance query
  let query = { student: { $in: studentIds } };
  
  // Date range filter
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const attendanceRecords = await Attendance.find(query)
    .populate('student', 'firstName lastName rollNumber studentId')
    .populate('markedBy', 'firstName lastName');

  // Group by student and calculate attendance rate
  const attendanceByStudent = {};
  studentIds.forEach(studentId => {
    attendanceByStudent[studentId] = {
      student: students.find(s => s._id.toString() === studentId.toString()),
      records: [],
      statistics: { total: 0, present: 0, absent: 0, rate: 0 }
    };
  });

  attendanceRecords.forEach(record => {
    const studentId = record.student._id.toString();
    if (attendanceByStudent[studentId]) {
      attendanceByStudent[studentId].records.push(record);
      
      attendanceByStudent[studentId].statistics.total += 1;
      if (record.status === 'present') {
        attendanceByStudent[studentId].statistics.present += 1;
      } else {
        attendanceByStudent[studentId].statistics.absent += 1;
      }
    }
  });

  // Calculate attendance rates
  Object.values(attendanceByStudent).forEach(studentData => {
    if (studentData.statistics.total > 0) {
      studentData.statistics.rate = Math.round(
        (studentData.statistics.present / studentData.statistics.total) * 100
      );
    }
  });

  // Calculate class average
  const allRates = Object.values(attendanceByStudent)
    .filter(s => s.statistics.total > 0)
    .map(s => s.statistics.rate);
  const classAverage = allRates.length > 0 
    ? Math.round(allRates.reduce((sum, rate) => sum + rate, 0) / allRates.length) 
    : 0;

  res.json({
    success: true,
    data: {
      attendanceByStudent,
      classSummary: {
        totalStudents: studentIds.length,
        studentsWithAttendance: Object.values(attendanceByStudent).filter(s => s.statistics.total > 0).length,
        classAverage
      }
    }
  });
}));

module.exports = router;