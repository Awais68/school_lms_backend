const express = require('express');
const asyncHandler = require('express-async-handler');
const Transport = require('../models/Transport');
const Route = require('../models/Route');
const Vehicle = require('../models/Vehicle');
const Student = require('../models/Student');
const User = require('../models/User');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get transport records
// @route   GET /api/transport
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { route, vehicle, driver, status, branchId, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (route) query.routeId = route;
  if (vehicle) query.vehicle = vehicle;
  if (driver) query.driver = driver;
  if (status) query.status = status;
  if (branchId) {
    // Find routes in the branch and get transport records for those routes
    const routes = await Route.find({ branchId });
    const routeIds = routes.map(r => r._id);
    query.routeId = { $in: routeIds };
  }

  const transportRecords = await Transport.find(query)
    .populate('routeId', 'name origin destination')
    .populate('vehicle', 'registrationNumber model capacity')
    .populate('driver', 'firstName lastName phone')
    .populate('assignedStudents', 'firstName lastName rollNumber studentId')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const total = await Transport.countDocuments(query);

  res.json({
    success: true,
    data: {
      transportRecords,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get transport record by ID
// @route   GET /api/transport/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const transport = await Transport.findById(req.params.id)
    .populate('routeId', 'name origin destination stops operationalDays')
    .populate('vehicle', 'registrationNumber model manufacturer capacity fuelType')
    .populate('driver', 'firstName lastName phone')
    .populate('assignedStudents', 'firstName lastName rollNumber studentId');

  if (!transport) {
    return res.status(404).json({
      success: false,
      message: 'Transport record not found'
    });
  }

  res.json({
    success: true,
    data: transport
  });
}));

// @desc    Create transport record
// @route   POST /api/transport
// @access  Private/Admin
router.post('/', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const { routeId, vehicle, driver, capacity } = req.body;

  if (!routeId || !vehicle || !driver) {
    return res.status(400).json({
      success: false,
      message: 'Please provide required fields: routeId, vehicle, driver'
    });
  }

  // Check if route exists
  const route = await Route.findById(routeId);
  if (!route) {
    return res.status(404).json({
      success: false,
      message: 'Route not found'
    });
  }

  // Check if vehicle exists
  const vehicleDoc = await Vehicle.findById(vehicle);
  if (!vehicleDoc) {
    return res.status(404).json({
      success: false,
      message: 'Vehicle not found'
    });
  }

  // Check if driver exists and is assigned the driver role
  const driverDoc = await User.findById(driver);
  if (!driverDoc || driverDoc.role !== 'driver') {
    return res.status(404).json({
      success: false,
      message: 'Driver not found or invalid role'
    });
  }

  // Validate capacity
  if (capacity > vehicleDoc.capacity) {
    return res.status(400).json({
      success: false,
      message: 'Capacity cannot exceed vehicle capacity'
    });
  }

  const transport = await Transport.create({
    routeId,
    vehicle,
    driver,
    capacity
  });

  res.status(201).json({
    success: true,
    message: 'Transport record created successfully',
    data: transport
  });
}));

// @desc    Update transport record
// @route   PUT /api/transport/:id
// @access  Private/Admin
router.put('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const { capacity, status } = req.body;

  const transport = await Transport.findById(req.params.id);
  if (!transport) {
    return res.status(404).json({
      success: false,
      message: 'Transport record not found'
    });
  }

  // Update allowed fields
  if (capacity !== undefined) {
    const vehicle = await Vehicle.findById(transport.vehicle);
    if (vehicle && capacity > vehicle.capacity) {
      return res.status(400).json({
        success: false,
        message: 'Capacity cannot exceed vehicle capacity'
      });
    }
    transport.capacity = capacity;
  }

  if (status !== undefined) {
    transport.status = status;
  }

  const updatedTransport = await transport.save();

  res.json({
    success: true,
    message: 'Transport record updated successfully',
    data: updatedTransport
  });
}));

// @desc    Delete transport record
// @route   DELETE /api/transport/:id
// @access  Private/Admin
router.delete('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const transport = await Transport.findById(req.params.id);
  if (!transport) {
    return res.status(404).json({
      success: false,
      message: 'Transport record not found'
    });
  }

  await transport.remove();

  res.json({
    success: true,
    message: 'Transport record deleted successfully'
  });
}));

// @desc    Assign students to transport
// @route   POST /api/transport/:id/assign-students
// @access  Private/Admin
router.post('/:id/assign-students', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const { students } = req.body;

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an array of student IDs'
    });
  }

  const transport = await Transport.findById(req.params.id)
    .populate('assignedStudents', 'firstName lastName rollNumber studentId');
  if (!transport) {
    return res.status(404).json({
      success: false,
      message: 'Transport record not found'
    });
  }

  if (transport.status !== 'active') {
    return res.status(400).json({
      success: false,
      message: 'Cannot assign students to inactive transport'
    });
  }

  // Check if adding these students would exceed capacity
  if (transport.assignedStudents.length + students.length > transport.capacity) {
    return res.status(400).json({
      success: false,
      message: `Adding ${students.length} students would exceed capacity of ${transport.capacity}. Current: ${transport.assignedStudents.length}`
    });
  }

  // Verify that students exist
  const existingStudents = await Student.find({ 
    _id: { $in: students },
    isActive: true 
  });
  const existingStudentIds = existingStudents.map(s => s._id.toString());

  // Check if any students don't exist
  const notFoundStudents = students.filter(s => !existingStudentIds.includes(s));
  if (notFoundStudents.length > 0) {
    return res.status(404).json({
      success: false,
      message: `Students not found: ${notFoundStudents.join(', ')}`
    });
  }

  // Filter out already assigned students
  const newStudents = students.filter(s => 
    !transport.assignedStudents.some(assigned => assigned._id.toString() === s)
  );

  if (newStudents.length === 0) {
    return res.json({
      success: true,
      message: 'All students already assigned to this transport',
      data: transport
    });
  }

  transport.assignedStudents = [...transport.assignedStudents.map(s => s._id), ...newStudents];
  await transport.save();

  // Populate the updated transport record
  const updatedTransport = await Transport.findById(transport._id)
    .populate('routeId', 'name origin destination')
    .populate('vehicle', 'registrationNumber model capacity')
    .populate('driver', 'firstName lastName phone')
    .populate('assignedStudents', 'firstName lastName rollNumber studentId');

  res.json({
    success: true,
    message: `${newStudents.length} students assigned successfully`,
    data: updatedTransport
  });
}));

// @desc    Remove students from transport
// @route   POST /api/transport/:id/remove-students
// @access  Private/Admin
router.post('/:id/remove-students', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const { students } = req.body;

  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an array of student IDs'
    });
  }

  const transport = await Transport.findById(req.params.id);
  if (!transport) {
    return res.status(404).json({
      success: false,
      message: 'Transport record not found'
    });
  }

  // Filter out students that are assigned to this transport
  const updatedAssignedStudents = transport.assignedStudents.filter(
    assignedId => !students.includes(assignedId.toString())
  );

  transport.assignedStudents = updatedAssignedStudents;
  await transport.save();

  res.json({
    success: true,
    message: 'Students removed from transport successfully',
    data: transport
  });
}));

// @desc    Get all routes
// @route   GET /api/transport/routes
// @access  Private
router.get('/routes', protect, asyncHandler(async (req, res) => {
  const { branchId, operational, page = 1, limit = 10 } = req.query;

  let query = {};
  if (branchId) query.branchId = branchId;
  if (operational !== undefined) query.isActive = operational === 'true';

  const routes = await Route.find(query)
    .populate('branchId', 'name')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ name: 1 });

  const total = await Route.countDocuments(query);

  res.json({
    success: true,
    data: {
      routes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get all vehicles
// @route   GET /api/transport/vehicles
// @access  Private
router.get('/vehicles', protect, asyncHandler(async (req, res) => {
  const { branchId, status, page = 1, limit = 10 } = req.query;

  let query = {};
  if (branchId) query.branchId = branchId;
  if (status) query.status = status;

  const vehicles = await Vehicle.find(query)
    .populate('branchId', 'name')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ registrationNumber: 1 });

  const total = await Vehicle.countDocuments(query);

  res.json({
    success: true,
    data: {
      vehicles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

module.exports = router;