const express = require('express');
const asyncHandler = require('express-async-handler');
const Fee = require('../models/Fee');
const Student = require('../models/Student');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get fees
// @route   GET /api/fees
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { student, status, feeType, academicYear, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (student) query.student = student;
  if (status) query.status = status;
  if (feeType) query.feeType = feeType;
  if (academicYear) query.academicYear = academicYear;

  // Only admin, accountant, or the student themselves can view fees
  if (req.user.role === 'student') {
    // Find the student record for this user
    const studentRecord = await Student.findOne({ user: req.user.id });
    if (studentRecord) {
      query.student = studentRecord._id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'No student record found for this user'
      });
    }
  } else if (req.user.role === 'parent') {
    // Parents can only see fees for their children
    const studentRecords = await Student.find({ parent: req.user.id });
    if (studentRecords.length > 0) {
      query.student = { $in: studentRecords.map(s => s._id) };
    } else {
      return res.status(403).json({
        success: false,
        message: 'No student records found for this parent'
      });
    }
  }

  const fees = await Fee.find(query)
    .populate('student', 'firstName lastName rollNumber studentId')
    .populate('createdBy', 'firstName lastName')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ dueDate: -1, createdAt: -1 });

  const total = await Fee.countDocuments(query);

  res.json({
    success: true,
    data: {
      fees,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get fee by ID
// @route   GET /api/fees/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const fee = await Fee.findById(req.params.id)
    .populate('student', 'firstName lastName rollNumber studentId')
    .populate('createdBy', 'firstName lastName');

  if (!fee) {
    return res.status(404).json({
      success: false,
      message: 'Fee record not found'
    });
  }

  // Check authorization
  if (req.user.role === 'student') {
    const student = await Student.findOne({ user: req.user.id });
    if (!student || fee.student._id.toString() !== student._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this fee record'
      });
    }
  } else if (req.user.role === 'parent') {
    const student = await Student.findOne({ _id: fee.student._id, parent: req.user.id });
    if (!student) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this fee record'
      });
    }
  }

  res.json({
    success: true,
    data: fee
  });
}));

// @desc    Create fee
// @route   POST /api/fees
// @access  Private/Admin/Accountant
router.post('/', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const { student, academicYear, feeType, amount, dueDate, notes } = req.body;

  if (!student || !academicYear || !feeType || !amount || !dueDate) {
    return res.status(400).json({
      success: false,
      message: 'Please provide all required fields: student, academicYear, feeType, amount, dueDate'
    });
  }

  // Check if student exists
  const studentExists = await Student.findById(student);
  if (!studentExists) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  const fee = await Fee.create({
    student,
    academicYear,
    feeType,
    amount,
    dueDate,
    notes,
    createdBy: req.user.id
  });

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.emit('fee_created', {
      studentId: student,
      feeId: fee._id,
      amount: fee.amount,
      dueDate: fee.dueDate
    });
  }

  res.status(201).json({
    success: true,
    message: 'Fee record created successfully',
    data: fee
  });
}));

// @desc    Update fee
// @route   PUT /api/fees/:id
// @access  Private/Admin/Accountant
router.put('/:id', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const fee = await Fee.findById(req.params.id);

  if (!fee) {
    return res.status(404).json({
      success: false,
      message: 'Fee record not found'
    });
  }

  const updatedFee = await Fee.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  )
  .populate('student', 'firstName lastName rollNumber studentId')
  .populate('createdBy', 'firstName lastName');

  res.json({
    success: true,
    message: 'Fee record updated successfully',
    data: updatedFee
  });
}));

// @desc    Delete fee
// @route   DELETE /api/fees/:id
// @access  Private/Admin
router.delete('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const fee = await Fee.findById(req.params.id);

  if (!fee) {
    return res.status(404).json({
      success: false,
      message: 'Fee record not found'
    });
  }

  if (fee.status === 'paid') {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete a paid fee record'
    });
  }

  await fee.remove();

  res.json({
    success: true,
    message: 'Fee record deleted successfully'
  });
}));

// @desc    Process fee payment
// @route   POST /api/fees/:id/pay
// @access  Private/Admin/Accountant
router.post('/:id/pay', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const { paymentMethod, transactionId, receiptNumber } = req.body;

  const fee = await Fee.findById(req.params.id);
  if (!fee) {
    return res.status(404).json({
      success: false,
      message: 'Fee record not found'
    });
  }

  if (fee.status === 'paid') {
    return res.status(400).json({
      success: false,
      message: 'Fee is already paid'
    });
  }

  // Update fee status
  fee.status = 'paid';
  fee.paymentMethod = paymentMethod;
  fee.paymentDate = new Date();
  if (transactionId) fee.transactionId = transactionId;
  if (receiptNumber) fee.receiptNumber = receiptNumber;

  const updatedFee = await fee.save();

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.emit('fee_paid', {
      studentId: fee.student,
      feeId: fee._id,
      amount: fee.amount
    });
  }

  res.json({
    success: true,
    message: 'Fee payment processed successfully',
    data: updatedFee
  });
}));

// @desc    Get student fee summary
// @route   GET /api/fees/student/:studentId/summary
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
        message: 'Not authorized to view this student\'s fees'
      });
    }
  } else if (req.user.role === 'parent') {
    if (student.parent.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this student\'s fees'
      });
    }
  }

  const allFees = await Fee.find({ student: req.params.studentId });
  
  // Calculate summary
  const totalFees = allFees.length;
  const totalAmount = allFees.reduce((sum, fee) => sum + fee.amount, 0);
  const paidFees = allFees.filter(fee => fee.status === 'paid');
  const paidAmount = paidFees.reduce((sum, fee) => sum + fee.amount, 0);
  const pendingFees = allFees.filter(fee => fee.status === 'pending');
  const pendingAmount = pendingFees.reduce((sum, fee) => sum + fee.amount, 0);
  const overdueFees = allFees.filter(fee => 
    fee.status === 'pending' && new Date(fee.dueDate) < new Date()
  );
  const overdueAmount = overdueFees.reduce((sum, fee) => sum + fee.amount, 0);

  const summary = {
    totalFees,
    totalAmount,
    paidFees: paidFees.length,
    paidAmount,
    pendingFees: pendingFees.length,
    pendingAmount,
    overdueFees: overdueFees.length,
    overdueAmount,
    balance: totalAmount - paidAmount
  };

  res.json({
    success: true,
    data: summary
  });
}));

module.exports = router;