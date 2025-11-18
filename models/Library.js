const mongoose = require('mongoose');

const librarySchema = new mongoose.Schema({
  bookId: {
    type: String,
    required: [true, 'Book ID is required'],
    unique: true,
    trim: true
  },
  title: {
    type: String,
    required: [true, 'Book title is required'],
    trim: true
  },
  author: {
    type: String,
    required: [true, 'Author is required'],
    trim: true
  },
  isbn: String,
  category: {
    type: String,
    required: true,
    trim: true
  },
  publisher: String,
  publishedYear: Number,
  edition: String,
  totalCopies: {
    type: Number,
    required: true,
    min: 1
  },
  availableCopies: {
    type: Number,
    default: 0
  },
  price: Number,
  shelfLocation: String,
  status: {
    type: String,
    default: 'available',
    enum: ['available', 'borrowed', 'reserved', 'damaged', 'lost']
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Library', librarySchema);