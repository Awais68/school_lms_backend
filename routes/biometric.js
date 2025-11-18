const express = require('express');
const asyncHandler = require('express-async-handler');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const User = require('../models/User');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Sync attendance data from biometric device
// @route   POST /api/biometric/sync-attendance
// @access  Private (Biometric device authentication)
router.post('/sync-attendance', asyncHandler(async (req, res) => {
  // Verify biometric device authentication using a device token
  const deviceToken = req.headers['x-device-token'];
  if (!deviceToken || deviceToken !== process.env.BIOMETRIC_DEVICE_TOKEN) {
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized device access' 
    });
  }

  const { attendanceRecords } = req.body;

  if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid attendance records' 
    });
  }

  const processedRecords = [];
  const failedRecords = [];

  for (const record of attendanceRecords) {
    try {
      // Map biometric ID to student
      const student = await Student.findOne({ 
        biometricId: record.biometricId 
      }).populate('user', 'firstName lastName email');
      
      if (!student) {
        failedRecords.push({
          biometricId: record.biometricId,
          error: 'Student not found'
        });
        continue;
      }

      // Check if attendance already exists for this date/time
      const existingAttendance = await Attendance.findOne({
        student: student._id,
        date: { 
          $gte: new Date(record.timestamp).setHours(0, 0, 0, 0), 
          $lt: new Date(record.timestamp).setHours(24, 0, 0, 0) 
        },
        biometricData: { deviceId: record.deviceId }
      });

      if (existingAttendance) {
        // Skip if attendance already recorded
        processedRecords.push({
          ...record,
          studentId: student._id,
          status: 'already_recorded'
        });
        continue;
      }

      // Create attendance record
      const attendance = new Attendance({
        student: student._id,
        course: record.courseId || null, // If course is specified in the record
        date: new Date(record.timestamp),
        status: 'present', // Biometric data implies present
        method: 'biometric',
        markedBy: null, // Will be updated later if teacher confirms
        biometricData: {
          deviceId: record.deviceId,
          timestamp: new Date(record.timestamp),
          fingerprintId: record.biometricId,
          confidence: record.confidence
        }
      });

      const savedAttendance = await attendance.save();
      
      processedRecords.push({
        ...record,
        attendanceId: savedAttendance._id,
        studentId: student._id,
        status: 'saved'
      });

      // Emit real-time notification
      const io = req.app.get('io');
      if (io) {
        io.emit('attendance_sync', {
          studentId: student._id,
          studentName: `${student.user.firstName} ${student.user.lastName}`,
          date: new Date(record.timestamp),
          status: 'present',
          method: 'biometric'
        });
      }

    } catch (error) {
      failedRecords.push({
        biometricId: record.biometricId,
        error: error.message
      });
    }
  }

  res.json({
    success: true,
    message: 'Attendance sync completed',
    data: {
      processed: processedRecords.length,
      failed: failedRecords.length,
      processedRecords,
      failedRecords
    }
  });

}));

// @desc    Manual attendance override for biometric errors
// @route   POST /api/biometric/manual-override
// @access  Private/Teacher/Admin
router.post('/manual-override', protect, checkRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { studentId, date, status, courseId } = req.body;

  if (!studentId || !date || !status) {
    return res.status(400).json({
      success: false,
      message: 'Student ID, date, and status are required'
    });
  }

  if (!['present', 'absent', 'late', 'excused'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status. Must be present, absent, late, or excused'
    });
  }

  // Find existing biometric record to update
  const existingRecord = await Attendance.findOne({
    student: studentId,
    date: { 
      $gte: new Date(date).setHours(0, 0, 0, 0), 
      $lt: new Date(date).setHours(24, 0, 0, 0) 
    },
    method: 'biometric'
  });

  if (!existingRecord) {
    return res.status(404).json({
      success: false,
      message: 'No biometric record found for the specified date'
    });
  }

  // Update the attendance status
  existingRecord.status = status;
  existingRecord.markedBy = req.user.id;
  existingRecord.updatedAt = new Date();

  await existingRecord.save();

  res.json({
    success: true,
    message: 'Attendance record updated successfully',
    data: existingRecord
  });
}));

// @desc    Register biometric ID for a student
// @route   POST /api/biometric/register/:studentId
// @access  Private/Admin
router.post('/register/:studentId', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const { biometricId } = req.body;
  const { studentId } = req.params;

  if (!biometricId) {
    return res.status(400).json({
      success: false,
      message: 'Biometric ID is required'
    });
  }

  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  // Check if biometric ID is already registered to another student
  const existingBiometric = await Student.findOne({ biometricId, _id: { $ne: studentId } });
  if (existingBiometric) {
    return res.status(400).json({
      success: false,
      message: 'Biometric ID is already registered to another student'
    });
  }

  // Register the biometric ID
  student.biometricId = biometricId;
  student.biometricStatus = 'registered';
  student.biometricRegistrationDate = new Date();

  await student.save();

  res.json({
    success: true,
    message: 'Biometric ID registered successfully',
    data: {
      studentId: student._id,
      biometricId: student.biometricId,
      status: student.biometricStatus
    }
  });
}));

// @desc    Get biometric device status
// @route   GET /api/biometric/device-status
// @access  Private/Admin
router.get('/device-status', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  // In a real implementation, this would check actual device connectivity
  // This is a stub that returns simulated device status
  
  const deviceStatus = {
    devices: [
      {
        id: 'device_001',
        location: 'Main Entrance',
        status: 'online',
        lastSync: new Date(),
        totalScans: 1245,
        connectionType: 'wifi',
        firmwareVersion: '2.1.5'
      },
      {
        id: 'device_002',
        location: 'Library',
        status: 'online',
        lastSync: new Date(Date.now() - 300000), // 5 minutes ago
        totalScans: 234,
        connectionType: 'wifi',
        firmwareVersion: '2.1.5'
      },
      {
        id: 'device_003',
        location: 'Sports Complex',
        status: 'offline',
        lastSync: new Date(Date.now() - 7200000), // 2 hours ago
        totalScans: 567,
        connectionType: 'wifi',
        firmwareVersion: '2.1.3'
      }
    ],
    overallHealth: 'good',
    totalDevices: 3,
    onlineDevices: 2,
    offlineDevices: 1,
    lastUpdated: new Date()
  };

  res.json({
    success: true,
    data: deviceStatus
  });
}));

// @desc    Get biometric attendance report
// @route   GET /api/biometric/report
// @access  Private/Admin/Teacher
router.get('/report', protect, checkRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { studentId, startDate, endDate, deviceId } = req.query;

  let query = { method: 'biometric' };
  
  if (studentId) query.student = studentId;
  if (deviceId) query['biometricData.deviceId'] = deviceId;
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const attendanceRecords = await Attendance.find(query)
    .populate('student', 'firstName lastName rollNumber studentId')
    .populate('course', 'title code');

  // Calculate statistics
  let totalRecords = attendanceRecords.length;
  let presentCount = attendanceRecords.filter(r => r.status === 'present').length;
  let absentCount = attendanceRecords.filter(r => r.status === 'absent').length;
  let lateCount = attendanceRecords.filter(r => r.status === 'late').length;
  let attendanceRate = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

  // Group by student if no student filter
  let recordsByStudent = {};
  if (!studentId) {
    attendanceRecords.forEach(record => {
      const studentId = record.student._id.toString();
      if (!recordsByStudent[studentId]) {
        recordsByStudent[studentId] = {
          student: record.student,
          records: [],
          stats: { total: 0, present: 0, absent: 0, late: 0 }
        };
      }
      recordsByStudent[studentId].records.push(record);
      recordsByStudent[studentId].stats.total += 1;
      if (record.status === 'present') recordsByStudent[studentId].stats.present += 1;
      else if (record.status === 'absent') recordsByStudent[studentId].stats.absent += 1;
      else if (record.status === 'late') recordsByStudent[studentId].stats.late += 1;
    });
  }

  res.json({
    success: true,
    data: {
      summary: {
        totalRecords,
        presentCount,
        absentCount,
        lateCount,
        attendanceRate
      },
      records: recordsByStudent,
      details: attendanceRecords.slice(0, 50) // Limit detailed records
    }
  });
}));

module.exports = router;