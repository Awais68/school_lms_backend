const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  feeType: {
    type: String,
    required: true,
    enum: ['annual', 'tuition', 'transport', 'library', 'development', 'other']
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'paid', 'overdue', 'waived']
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'check', 'online', 'bank_transfer', 'other']
  },
  paymentDate: Date,
  receiptNumber: String,
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Fee', feeSchema);