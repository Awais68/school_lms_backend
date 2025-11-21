const express = require("express");
const asyncHandler = require("express-async-handler");
const multer = require("multer");
const path = require("path");
const User = require("../models/User");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const { protect, checkRole } = require("../middleware/auth");

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/profiles/");
  },
  filename: function (req, file, cb) {
    cb(null, `${req.user._id}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed!"));
  },
});

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get(
  "/",
  protect,
  checkRole("admin", "accountant"),
  asyncHandler(async (req, res) => {
    const { type, branchId, page = 1, limit = 10 } = req.query;

    // Build query
    let query = {};
    if (type) query.role = type;
    if (branchId) query.branchId = branchId;

    const users = await User.find(query)
      .populate("branchId", "name")
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
          totalDocs: total,
        },
      },
    });
  })
);

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private
router.get(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).populate(
      "branchId",
      "name"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  })
);

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  checkRole("admin"),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, address, role, isActive } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
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
      message: "User updated successfully",
      data: updatedUser,
    });
  })
);

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  checkRole("admin"),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user has related records in other collections
    let associatedRecord = null;

    if (user.role === "student") {
      associatedRecord = await Student.findOne({ user: user._id });
    } else if (user.role === "teacher") {
      associatedRecord = await Teacher.findOne({ user: user._id });
    }

    if (associatedRecord) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete user with associated records",
      });
    }

    await user.remove();

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  })
);

// @desc    Update own profile
// @route   PUT /api/users/profile
// @access  Private
router.put(
  "/profile",
  protect,
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.phone = phone || user.phone;

    const updatedUser = await user.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        _id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
      },
    });
  })
);

// @desc    Upload profile image
// @route   PUT /api/users/profile/image
// @access  Private
router.put(
  "/profile/image",
  protect,
  upload.single("profileImage"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload an image",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Store relative path
    user.profileImage = `/uploads/profiles/${req.file.filename}`;
    await user.save();

    res.json({
      success: true,
      message: "Profile image uploaded successfully",
      profileImage: user.profileImage,
    });
  })
);

// @desc    Update privacy settings
// @route   PUT /api/users/privacy-settings
// @access  Private
router.put(
  "/privacy-settings",
  protect,
  asyncHandler(async (req, res) => {
    const { profileVisibility, showEmail, showPhone } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.privacySettings = {
      profileVisibility:
        profileVisibility ||
        user.privacySettings?.profileVisibility ||
        "public",
      showEmail:
        showEmail !== undefined
          ? showEmail
          : user.privacySettings?.showEmail !== undefined
          ? user.privacySettings.showEmail
          : true,
      showPhone:
        showPhone !== undefined
          ? showPhone
          : user.privacySettings?.showPhone !== undefined
          ? user.privacySettings.showPhone
          : false,
    };

    await user.save();

    res.json({
      success: true,
      message: "Privacy settings updated successfully",
      data: user.privacySettings,
    });
  })
);

// @desc    Update notification settings
// @route   PUT /api/users/notification-settings
// @access  Private
router.put(
  "/notification-settings",
  protect,
  asyncHandler(async (req, res) => {
    const {
      emailNotifications,
      pushNotifications,
      smsNotifications,
      assignmentReminders,
      gradeUpdates,
      eventNotifications,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.notificationSettings = {
      emailNotifications:
        emailNotifications !== undefined
          ? emailNotifications
          : user.notificationSettings?.emailNotifications !== undefined
          ? user.notificationSettings.emailNotifications
          : true,
      pushNotifications:
        pushNotifications !== undefined
          ? pushNotifications
          : user.notificationSettings?.pushNotifications !== undefined
          ? user.notificationSettings.pushNotifications
          : true,
      smsNotifications:
        smsNotifications !== undefined
          ? smsNotifications
          : user.notificationSettings?.smsNotifications !== undefined
          ? user.notificationSettings.smsNotifications
          : false,
      assignmentReminders:
        assignmentReminders !== undefined
          ? assignmentReminders
          : user.notificationSettings?.assignmentReminders !== undefined
          ? user.notificationSettings.assignmentReminders
          : true,
      gradeUpdates:
        gradeUpdates !== undefined
          ? gradeUpdates
          : user.notificationSettings?.gradeUpdates !== undefined
          ? user.notificationSettings.gradeUpdates
          : true,
      eventNotifications:
        eventNotifications !== undefined
          ? eventNotifications
          : user.notificationSettings?.eventNotifications !== undefined
          ? user.notificationSettings.eventNotifications
          : true,
    };

    await user.save();

    res.json({
      success: true,
      message: "Notification settings updated successfully",
      data: user.notificationSettings,
    });
  })
);

module.exports = router;
