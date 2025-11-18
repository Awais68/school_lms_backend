const express = require('express');
const asyncHandler = require('express-async-handler');
const Expense = require('../models/Expense');
const Branch = require('../models/Branch');
const User = require('../models/User');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get expenses
// @route   GET /api/expenses
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { branchId, expenseType, category, dateFrom, dateTo, paidBy, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (branchId) query.branchId = branchId;
  if (expenseType) query.expenseType = expenseType;
  if (category) query.category = category;
  if (paidBy) query.paidBy = paidBy;

  // Date range filter
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = new Date(dateFrom);
    if (dateTo) query.date.$lte = new Date(dateTo);
  }

  const expenses = await Expense.find(query)
    .populate('branchId', 'name')
    .populate('paidBy', 'firstName lastName')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ date: -1, createdAt: -1 });

  const total = await Expense.countDocuments(query);
  const totalAmount = await Expense.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);

  res.json({
    success: true,
    data: {
      expenses,
      totalAmount: totalAmount.length > 0 ? totalAmount[0].total : 0,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get expense by ID
// @route   GET /api/expenses/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id)
    .populate('branchId', 'name')
    .populate('paidBy', 'firstName lastName email');

  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found'
    });
  }

  res.json({
    success: true,
    data: expense
  });
}));

// @desc    Create expense
// @route   POST /api/expenses
// @access  Private/Admin/Accountant
router.post('/', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const { expenseType, category, amount, date, description, receipt, paymentMethod, branchId } = req.body;

  if (!expenseType || !category || amount === undefined || !date || !branchId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide required fields: expenseType, category, amount, date, branchId'
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be greater than 0'
    });
  }

  // Check if branch exists
  const branch = await Branch.findById(branchId);
  if (!branch) {
    return res.status(404).json({
      success: false,
      message: 'Branch not found'
    });
  }

  const expense = await Expense.create({
    expenseType,
    category,
    amount,
    date,
    description,
    receipt,
    paymentMethod,
    paidBy: req.user.id, // Current user is who paid
    branchId
  });

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.emit('expense_created', {
      expenseId: expense._id,
      branchId: expense.branchId,
      amount: expense.amount,
      category: expense.category,
      date: expense.date
    });
  }

  res.status(201).json({
    success: true,
    message: 'Expense created successfully',
    data: expense
  });
}));

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private/Admin/Accountant
router.put('/:id', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const { amount, description, receipt, paymentMethod } = req.body;

  const expense = await Expense.findById(req.params.id);
  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found'
    });
  }

  // Update allowed fields
  if (amount !== undefined) {
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }
    expense.amount = amount;
  }

  if (description !== undefined) expense.description = description;
  if (receipt !== undefined) expense.receipt = receipt;
  if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;

  const updatedExpense = await expense.save();

  res.json({
    success: true,
    message: 'Expense updated successfully',
    data: updatedExpense
  });
}));

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private/Admin
router.delete('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) {
    return res.status(404).json({
      success: false,
      message: 'Expense not found'
    });
  }

  await expense.remove();

  res.json({
    success: true,
    message: 'Expense deleted successfully'
  });
}));

// @desc    Get expenses summary
// @route   GET /api/expenses/summary
// @access  Private
router.get('/summary', protect, asyncHandler(async (req, res) => {
  const { branchId, dateFrom, dateTo } = req.query;

  let query = {};
  if (branchId) query.branchId = branchId;

  // Date range filter
  if (dateFrom || dateTo) {
    query.date = {};
    if (dateFrom) query.date.$gte = new Date(dateFrom);
    if (dateTo) query.date.$lte = new Date(dateTo);
  }

  const expenses = await Expense.find(query);

  // Group by expense type and calculate totals
  const summaryByType = {};
  let totalExpenses = 0;
  let totalAmount = 0;

  expenses.forEach(expense => {
    if (!summaryByType[expense.expenseType]) {
      summaryByType[expense.expenseType] = {
        type: expense.expenseType,
        count: 0,
        totalAmount: 0
      };
    }

    summaryByType[expense.expenseType].count += 1;
    summaryByType[expense.expenseType].totalAmount += expense.amount || 0;

    totalExpenses += 1;
    totalAmount += expense.amount || 0;
  });

  // Get expenses by month for trend analysis
  const expensesByMonth = {};
  expenses.forEach(expense => {
    const monthKey = new Date(expense.date).toISOString().slice(0, 7); // YYYY-MM
    if (!expensesByMonth[monthKey]) {
      expensesByMonth[monthKey] = 0;
    }
    expensesByMonth[monthKey] += expense.amount || 0;
  });

  res.json({
    success: true,
    data: {
      summaryByType,
      expensesByMonth,
      overall: {
        totalExpenses,
        totalAmount,
        averageExpense: totalExpenses > 0 ? totalAmount / totalExpenses : 0
      }
    }
  });
}));

// @desc    Get expenses by category
// @route   GET /api/expenses/categories
// @access  Private
router.get('/categories', protect, asyncHandler(async (req, res) => {
  const { branchId } = req.query;

  let query = {};
  if (branchId) query.branchId = branchId;

  const categories = await Expense.aggregate([
    { $match: query },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        averageAmount: { $avg: "$amount" }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);

  res.json({
    success: true,
    data: categories
  });
}));

module.exports = router;