const express = require("express");
const asyncHandler = require("express-async-handler");
const Branch = require("../models/Branch");
const { protect, checkRole } = require("../middleware/auth");

const router = express.Router();

// @desc    Get all branches
// @route   GET /api/branches
// @access  Public (for registration) / Private (for management)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const branches = await Branch.find({ isActive: true })
      .select("name address phone email")
      .sort({ name: 1 });

    res.json({
      success: true,
      data: {
        branches,
        count: branches.length,
      },
    });
  })
);

// @desc    Get branch by ID
// @route   GET /api/branches/:id
// @access  Private
router.get(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    const branch = await Branch.findById(req.params.id).populate(
      "principal",
      "firstName lastName email"
    );

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    res.json({
      success: true,
      data: branch,
    });
  })
);

// @desc    Create branch
// @route   POST /api/branches
// @access  Private/Admin
router.post(
  "/",
  protect,
  checkRole("admin"),
  asyncHandler(async (req, res) => {
    const { name, address, phone, email, principal, establishedDate } =
      req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Branch name is required",
      });
    }

    const branchExists = await Branch.findOne({ name });

    if (branchExists) {
      return res.status(400).json({
        success: false,
        message: "Branch with this name already exists",
      });
    }

    const branch = await Branch.create({
      name,
      address,
      phone,
      email,
      principal,
      establishedDate,
    });

    res.status(201).json({
      success: true,
      message: "Branch created successfully",
      data: branch,
    });
  })
);

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private/Admin
router.put(
  "/:id",
  protect,
  checkRole("admin"),
  asyncHandler(async (req, res) => {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    const updatedBranch = await Branch.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Branch updated successfully",
      data: updatedBranch,
    });
  })
);

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private/Admin
router.delete(
  "/:id",
  protect,
  checkRole("admin"),
  asyncHandler(async (req, res) => {
    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Soft delete - just mark as inactive
    branch.isActive = false;
    await branch.save();

    res.json({
      success: true,
      message: "Branch deactivated successfully",
    });
  })
);

module.exports = router;
