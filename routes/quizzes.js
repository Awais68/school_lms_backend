const express = require("express");
const asyncHandler = require("express-async-handler");
const Quiz = require("../models/Quiz");
const Course = require("../models/Course");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const { protect, checkRole } = require("../middleware/auth");

const router = express.Router();

// @desc    Get quizzes
// @route   GET /api/quizzes
// @access  Private
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const {
      course,
      instructor,
      quizType,
      status,
      page = 1,
      limit = 10,
    } = req.query;

    // Build query
    let query = {};
    if (course) query.course = course;
    if (instructor) query.instructor = instructor;
    if (quizType) query.quizType = quizType;
    if (status === "active") {
      query.isActive = true;
      query.endDate = { $gte: new Date() };
    } else if (status === "inactive") {
      query.isActive = false;
    } else if (status === "expired") {
      query.endDate = { $lt: new Date() };
    }

    const quizzes = await Quiz.find(query)
      .populate("course", "title code")
      .populate("instructor", "firstName lastName")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ startDate: -1, createdAt: -1 });

    const total = await Quiz.countDocuments(query);

    res.json({
      success: true,
      data: {
        quizzes,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
          totalDocs: total,
        },
      },
    });
  })
);

// @desc    Get quiz by ID
// @route   GET /api/quizzes/:id
// @access  Private
router.get(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id)
      .populate("course", "title code")
      .populate("instructor", "firstName lastName")
      .populate("assignedTo", "firstName lastName rollNumber");

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    res.json({
      success: true,
      data: quiz,
    });
  })
);

// @desc    Create quiz
// @route   POST /api/quizzes
// @access  Private/Teacher/Admin
router.post(
  "/",
  protect,
  checkRole("teacher", "admin"),
  asyncHandler(async (req, res) => {
    const {
      title,
      description,
      course,
      quizType,
      totalQuestions,
      totalPoints,
      duration,
      startDate,
      endDate,
      allowedAttempts,
      shuffleQuestions,
      shuffleAnswers,
      negativeMarking,
      assignedTo,
    } = req.body;

    if (!title || !course || !quizType || !totalPoints) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide required fields: title, course, quizType, totalPoints",
      });
    }

    // Check if course exists and user has permission to create quiz for it
    const courseDoc = await Course.findById(course);
    if (!courseDoc) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check authorization - only instructor or admin can create quiz
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ user: req.user.id });
      if (!teacher || !courseDoc.instructor.equals(teacher._id)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to create quiz for this course",
        });
      }
    }

    // If assignedTo is provided, check if students exist
    let assignedStudents = [];
    if (assignedTo && Array.isArray(assignedTo) && assignedTo.length > 0) {
      assignedStudents = await Student.find({
        _id: { $in: assignedTo },
        class: courseDoc.class, // Only allow assignment to students in the same class
      });

      if (assignedStudents.length !== assignedTo.length) {
        return res.status(404).json({
          success: false,
          message: "Some students not found or not in the course class",
        });
      }
    }

    const quiz = await Quiz.create({
      title,
      description,
      course,
      instructor:
        req.user.role === "admin"
          ? req.body.instructor
          : (
              await Teacher.findOne({ user: req.user.id })
            )._id,
      quizType,
      totalQuestions,
      totalPoints,
      duration,
      startDate,
      endDate,
      allowedAttempts,
      shuffleQuestions,
      shuffleAnswers,
      negativeMarking,
      assignedTo: assignedTo || courseDoc.enrolledStudents, // Default to all enrolled students
    });

    // Emit real-time notification
    const io = req.app.get("io");
    if (io) {
      const studentIds = assignedTo || courseDoc.enrolledStudents;
      studentIds.forEach((studentId) => {
        io.to(`user_${studentId}`).emit("quiz_created", {
          quizId: quiz._id,
          title: quiz.title,
          startDate: quiz.startDate,
          endDate: quiz.endDate,
          courseId: quiz.course,
        });
      });
    }

    res.status(201).json({
      success: true,
      message: "Quiz created successfully",
      data: quiz,
    });
  })
);

// @desc    Update quiz
// @route   PUT /api/quizzes/:id
// @access  Private/Teacher/Admin
router.put(
  "/:id",
  protect,
  checkRole("teacher", "admin"),
  asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check authorization
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ user: req.user.id });
      if (!teacher || !quiz.instructor.equals(teacher._id)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this quiz",
        });
      }
    }

    const updatedQuiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("course", "title code")
      .populate("instructor", "firstName lastName");

    res.json({
      success: true,
      message: "Quiz updated successfully",
      data: updatedQuiz,
    });
  })
);

// @desc    Delete quiz
// @route   DELETE /api/quizzes/:id
// @access  Private/Teacher/Admin
router.delete(
  "/:id",
  protect,
  checkRole("teacher", "admin"),
  asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check authorization
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ user: req.user.id });
      if (!teacher || !quiz.instructor.equals(teacher._id)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this quiz",
        });
      }
    }

    await quiz.deleteOne();

    res.json({
      success: true,
      message: "Quiz deleted successfully",
    });
  })
);

// @desc    Start quiz attempt
// @route   POST /api/quizzes/:id/start
// @access  Private/Student
router.post(
  "/:id/start",
  protect,
  checkRole("student"),
  asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id)
      .populate("course", "title code")
      .populate("instructor", "firstName lastName");

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found",
      });
    }

    // Check if quiz is active
    if (!quiz.isActive) {
      return res.status(400).json({
        success: false,
        message: "Quiz is not active",
      });
    }

    // Check if quiz has started
    if (quiz.startDate && new Date(quiz.startDate) > new Date()) {
      return res.status(400).json({
        success: false,
        message: "Quiz has not started yet",
      });
    }

    // Check if quiz has ended
    if (quiz.endDate && new Date(quiz.endDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Quiz has ended",
      });
    }

    // Check if student is assigned to this quiz
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student record not found",
      });
    }

    if (
      quiz.assignedTo &&
      quiz.assignedTo.length > 0 &&
      !quiz.assignedTo.includes(student._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this quiz",
      });
    }

    res.json({
      success: true,
      message: "Quiz started successfully",
      data: {
        quizId: quiz._id,
        startedAt: new Date(),
        duration: quiz.duration,
        endTime: quiz.duration
          ? new Date(Date.now() + quiz.duration * 60000)
          : null,
      },
    });
  })
);

module.exports = router;
