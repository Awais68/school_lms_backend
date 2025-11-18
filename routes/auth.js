const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// Generate refresh token
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE,
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Check for user
    const user = await User.findOne({ email });

    if (user && (await user.comparePassword(password))) {
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: "Account is deactivated",
        });
      }

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          token: generateToken(user._id),
          refreshToken: generateRefreshToken(user._id),
          user: {
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            branchId: user.branchId,
            profilePicture: user.profilePicture,
          },
        },
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }
  })
);

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password, firstName, lastName, phone, role, branchId } =
      req.body;

    // Validation - branchId is now optional
    if (!email || !password || !firstName || !lastName || !phone || !role) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // Create user data object
    const userData = {
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
    };

    // Only add branchId if it's provided and valid
    if (branchId && branchId.match(/^[0-9a-fA-F]{24}$/)) {
      userData.branchId = branchId;
    }

    // Create user
    const user = await User.create(userData);

    if (user) {
      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          token: generateToken(user._id),
          refreshToken: generateRefreshToken(user._id),
          user: {
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            branchId: user.branchId,
          },
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid user data",
      });
    }
  })
);

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
router.get(
  "/profile",
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).populate("branchId");

    if (user) {
      res.json({
        success: true,
        data: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          address: user.address,
          profilePicture: user.profilePicture,
          role: user.role,
          branchId: user.branchId,
          isActive: user.isActive,
        },
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  })
);

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put(
  "/profile",
  protect,
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, address, profilePicture } = req.body;

    const user = await User.findById(req.user.id);

    if (user) {
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.phone = phone || user.phone;
      user.address = address || user.address;
      user.profilePicture = profilePicture || user.profilePicture;

      const updatedUser = await user.save();

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          _id: updatedUser._id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone,
          address: updatedUser.address,
          profilePicture: updatedUser.profilePicture,
          role: updatedUser.role,
        },
      });
    } else {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  })
);

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put(
  "/change-password",
  protect,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide current and new password",
      });
    }

    const user = await User.findById(req.user.id);

    if (user && (await user.comparePassword(currentPassword))) {
      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }
  })
);

// @desc    Forgot password - send reset token
// @route   POST /api/auth/forgot-password
// @access  Public
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide email",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No user found with that email",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set token expiry to 1 hour
    user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    // In a production environment, you would send an email here
    // For now, we'll just return the token
    const resetUrl = `${
      process.env.CLIENT_URL || "http://localhost:3000"
    }/reset-password/${resetToken}`;

    res.status(200).json({
      success: true,
      message: "Password reset email sent",
      // In production, remove this - only for development
      resetToken: resetToken,
      resetUrl: resetUrl,
    });
  })
);

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
router.post(
  "/reset-password/:token",
  asyncHandler(async (req, res) => {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please provide new password",
      });
    }

    // Hash the token from params
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    // Find user by token and check if token is still valid
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Set new password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  })
);

module.exports = router;
