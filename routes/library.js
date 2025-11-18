const express = require('express');
const asyncHandler = require('express-async-handler');
const Library = require('../models/Library');
const Student = require('../models/Student');
const Branch = require('../models/Branch');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get library books
// @route   GET /api/library
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { branchId, category, status, available, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (branchId) query.branchId = branchId;
  if (category) query.category = category;
  if (status) query.status = status;

  // Filter for available books
  if (available === 'true') {
    query.status = 'available';
  }

  const books = await Library.find(query)
    .populate('branchId', 'name')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ title: 1 });

  const total = await Library.countDocuments(query);

  res.json({
    success: true,
    data: {
      books,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get library book by ID
// @route   GET /api/library/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const book = await Library.findById(req.params.id)
    .populate('branchId', 'name');

  if (!book) {
    return res.status(404).json({
      success: false,
      message: 'Book not found'
    });
  }

  res.json({
    success: true,
    data: book
  });
}));

// @desc    Create library book
// @route   POST /api/library
// @access  Private/Admin
router.post('/', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const { 
    bookId, title, author, isbn, category, publisher, publishedYear, 
    edition, totalCopies, price, shelfLocation, branchId 
  } = req.body;

  if (!bookId || !title || !author || !category || totalCopies === undefined || !branchId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide required fields: bookId, title, author, category, totalCopies, branchId'
    });
  }

  if (totalCopies < 0) {
    return res.status(400).json({
      success: false,
      message: 'Total copies cannot be negative'
    });
  }

  // Check if book ID already exists
  const bookIdExists = await Library.findOne({ bookId });
  if (bookIdExists) {
    return res.status(400).json({
      success: false,
      message: 'Book ID already exists'
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

  const book = await Library.create({
    bookId,
    title,
    author,
    isbn,
    category,
    publisher,
    publishedYear,
    edition,
    totalCopies,
    availableCopies: totalCopies, // Initially all copies are available
    price,
    shelfLocation,
    branchId
  });

  res.status(201).json({
    success: true,
    message: 'Book added to library successfully',
    data: book
  });
}));

// @desc    Update library book
// @route   PUT /api/library/:id
// @access  Private/Admin
router.put('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const { title, author, isbn, category, publisher, publishedYear, edition, price, shelfLocation, status } = req.body;

  const book = await Library.findById(req.params.id);
  if (!book) {
    return res.status(404).json({
      success: false,
      message: 'Book not found'
    });
  }

  // Update allowed fields
  if (title !== undefined) book.title = title;
  if (author !== undefined) book.author = author;
  if (isbn !== undefined) book.isbn = isbn;
  if (category !== undefined) book.category = category;
  if (publisher !== undefined) book.publisher = publisher;
  if (publishedYear !== undefined) book.publishedYear = publishedYear;
  if (edition !== undefined) book.edition = edition;
  if (price !== undefined) book.price = price;
  if (shelfLocation !== undefined) book.shelfLocation = shelfLocation;
  if (status !== undefined) book.status = status;

  const updatedBook = await book.save();

  res.json({
    success: true,
    message: 'Book updated successfully',
    data: updatedBook
  });
}));

// @desc    Delete library book
// @route   DELETE /api/library/:id
// @access  Private/Admin
router.delete('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const book = await Library.findById(req.params.id);
  if (!book) {
    return res.status(404).json({
      success: false,
      message: 'Book not found'
    });
  }

  // Check if book is currently borrowed
  if (book.status !== 'available') {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete book that is currently borrowed or reserved'
    });
  }

  await book.remove();

  res.json({
    success: true,
    message: 'Book removed from library successfully'
  });
}));

// @desc    Issue book to student
// @route   POST /api/library/issue
// @access  Private/Admin/Teacher
router.post('/issue', protect, checkRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { bookId, studentId, dueDate } = req.body;

  if (!bookId || !studentId || !dueDate) {
    return res.status(400).json({
      success: false,
      message: 'Please provide bookId, studentId, and dueDate'
    });
  }

  const book = await Library.findById(bookId);
  if (!book) {
    return res.status(404).json({
      success: false,
      message: 'Book not found'
    });
  }

  if (book.status !== 'available') {
    return res.status(400).json({
      success: false,
      message: 'Book is not available for issue'
    });
  }

  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found'
    });
  }

  // Update book status
  book.status = 'borrowed';
  book.availableCopies = Math.max(0, book.availableCopies - 1);
  
  await book.save();

  // Here you would typically create a LibraryTransaction record
  // For now, we'll just return the updated book status
  res.json({
    success: true,
    message: 'Book issued successfully',
    data: {
      book,
      issuedTo: student,
      dueDate
    }
  });
}));

// @desc    Return book from student
// @route   POST /api/library/return
// @access  Private/Admin/Teacher
router.post('/return', protect, checkRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { bookId } = req.body;

  if (!bookId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide bookId'
    });
  }

  const book = await Library.findById(bookId);
  if (!book) {
    return res.status(404).json({
      success: false,
      message: 'Book not found'
    });
  }

  if (book.status !== 'borrowed') {
    return res.status(400).json({
      success: false,
      message: 'Book is not currently borrowed'
    });
  }

  // Update book status
  book.status = 'available';
  book.availableCopies = Math.min(book.totalCopies, book.availableCopies + 1);
  
  await book.save();

  res.json({
    success: true,
    message: 'Book returned successfully',
    data: book
  });
}));

// @desc    Search books
// @route   GET /api/library/search
// @access  Private
router.get('/search', protect, asyncHandler(async (req, res) => {
  const { q, branchId } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      message: 'Please provide search query'
    });
  }

  const query = {
    $or: [
      { title: { $regex: q, $options: 'i' } },
      { author: { $regex: q, $options: 'i' } },
      { isbn: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } }
    ]
  };

  if (branchId) {
    query.branchId = branchId;
  }

  const books = await Library.find(query)
    .populate('branchId', 'name')
    .limit(20)
    .sort({ title: 1 });

  res.json({
    success: true,
    data: books
  });
}));

// @desc    Get library statistics
// @route   GET /api/library/stats
// @access  Private
router.get('/stats', protect, asyncHandler(async (req, res) => {
  const { branchId } = req.query;

  let query = {};
  if (branchId) query.branchId = branchId;

  const totalBooks = await Library.countDocuments(query);
  const availableBooks = await Library.countDocuments({ ...query, status: 'available' });
  const borrowedBooks = await Library.countDocuments({ ...query, status: 'borrowed' });
  const reservedBooks = await Library.countDocuments({ ...query, status: 'reserved' });
  const damagedBooks = await Library.countDocuments({ ...query, status: 'damaged' });
  const lostBooks = await Library.countDocuments({ ...query, status: 'lost' });

  // Get top categories
  const topCategories = await Library.aggregate([
    { $match: query },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  // Get books by status
  const booksByStatus = await Library.aggregate([
    { $match: query },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  res.json({
    success: true,
    data: {
      total: totalBooks,
      available: availableBooks,
      borrowed: borrowedBooks,
      reserved: reservedBooks,
      damaged: damagedBooks,
      lost: lostBooks,
      topCategories,
      booksByStatus
    }
  });
}));

module.exports = router;