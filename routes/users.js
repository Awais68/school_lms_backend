const express = require('express');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get('/', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const { type, branchId, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (type) query.role = type;
  if (branchId) query.branchId = branchId;

  const users = await User.find(query)
    .populate('branchId', 'name')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(query);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).populate('branchId', 'name');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: user
  });
}));

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
router.put('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, address, role, isActive } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  user.firstName = firstName || user.firstName;
  user.lastName = lastName || user.lastName;
  user.phone = phone || user.phone;
  user.address = address || user.address;
  user.role = role || user.role;
  user.isActive = isActive !== undefined ? isActive : user.isActive;

  const updatedUser = await user.save();

  res.json({
    success: true,
    message: 'User updated successfully',
    data: updatedUser
  });
}));

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
router.delete('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Check if user has related records in other collections
  let associatedRecord = null;

  if (user.role === 'student') {
    associatedRecord = await Student.findOne({ user: user._id });
  } else if (user.role === 'teacher') {
    associatedRecord = await Teacher.findOne({ user: user._id });
  }

  if (associatedRecord) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete user with associated records'
    });
  }

  await user.remove();

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
}));

module.exports = router;