const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  expenseType: {
    type: String,
    required: true,
    enum: ['building', 'utility', 'salary', 'maintenance', 'other']
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    required: true
  },
  description: String,
  receipt: String, // URL to receipt image
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  paymentMethod: String, // "cash", "check", "online"
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Expense', expenseSchema);