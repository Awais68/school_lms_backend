const express = require('express');
const asyncHandler = require('express-async-handler');
const Inventory = require('../models/Inventory');
const Branch = require('../models/Branch');
const User = require('../models/User');
const { protect, checkRole } = require('../middleware/auth');

const router = express.Router();

// @desc    Get inventory items
// @route   GET /api/inventory
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { branchId, category, status, lowStock, page = 1, limit = 10 } = req.query;

  // Build query
  let query = {};
  if (branchId) query.branchId = branchId;
  if (category) query.category = category;
  if (status) query.status = status;

  // Filter for low stock items
  if (lowStock === 'true') {
    query.$expr = { $lt: [{ $toInt: "$quantity" }, { $toInt: "$minStockLevel" }] };
  }

  const inventoryItems = await Inventory.find(query)
    .populate('branchId', 'name')
    .populate('supplier', 'firstName lastName company')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ name: 1 });

  const total = await Inventory.countDocuments(query);

  res.json({
    success: true,
    data: {
      inventoryItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Get inventory item by ID
// @route   GET /api/inventory/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const item = await Inventory.findById(req.params.id)
    .populate('branchId', 'name')
    .populate('supplier', 'firstName lastName company');

  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'Inventory item not found'
    });
  }

  res.json({
    success: true,
    data: item
  });
}));

// @desc    Create inventory item
// @route   POST /api/inventory
// @access  Private/Admin/Accountant
router.post('/', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const { 
    name, category, sku, description, quantity, unit, unitPrice, 
    supplier, purchaseDate, expiryDate, location, minStockLevel, branchId 
  } = req.body;

  if (!name || !category || !sku || quantity === undefined || !unit || !branchId) {
    return res.status(400).json({
      success: false,
      message: 'Please provide required fields: name, category, sku, quantity, unit, branchId'
    });
  }

  // Check if SKU already exists
  const skuExists = await Inventory.findOne({ sku, branchId });
  if (skuExists) {
    return res.status(400).json({
      success: false,
      message: 'SKU already exists in this branch'
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

  // Check if supplier exists (if provided)
  if (supplier) {
    const supplierExists = await User.findById(supplier);
    if (!supplierExists) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }
  }

  // Calculate total value
  const totalValue = (quantity || 0) * (unitPrice || 0);

  const item = await Inventory.create({
    name,
    category,
    sku,
    description,
    quantity,
    unit,
    unitPrice,
    totalValue,
    supplier,
    purchaseDate,
    expiryDate,
    location,
    minStockLevel: minStockLevel || 0,
    branchId
  });

  res.status(201).json({
    success: true,
    message: 'Inventory item created successfully',
    data: item
  });
}));

// @desc    Update inventory item
// @route   PUT /api/inventory/:id
// @access  Private/Admin/Accountant
router.put('/:id', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const { quantity, unitPrice, supplier, location, minStockLevel, status } = req.body;

  const item = await Inventory.findById(req.params.id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'Inventory item not found'
    });
  }

  // Update fields if provided
  if (quantity !== undefined) {
    item.quantity = quantity;
    item.totalValue = quantity * (item.unitPrice || 0);
  }

  if (unitPrice !== undefined) {
    item.unitPrice = unitPrice;
    item.totalValue = (item.quantity || 0) * unitPrice;
  }

  if (supplier !== undefined) {
    const supplierExists = await User.findById(supplier);
    if (!supplierExists) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found'
      });
    }
    item.supplier = supplier;
  }

  if (location !== undefined) item.location = location;
  if (minStockLevel !== undefined) item.minStockLevel = minStockLevel;
  if (status !== undefined) item.status = status;

  const updatedItem = await item.save();

  // Emit real-time notification if stock is low
  if (updatedItem.quantity < updatedItem.minStockLevel) {
    const io = req.app.get('io');
    if (io) {
      io.emit('low_stock_alert', {
        itemId: updatedItem._id,
        name: updatedItem.name,
        currentQuantity: updatedItem.quantity,
        minLevel: updatedItem.minStockLevel,
        branchId: updatedItem.branchId
      });
    }
  }

  res.json({
    success: true,
    message: 'Inventory item updated successfully',
    data: updatedItem
  });
}));

// @desc    Delete inventory item
// @route   DELETE /api/inventory/:id
// @access  Private/Admin
router.delete('/:id', protect, checkRole('admin'), asyncHandler(async (req, res) => {
  const item = await Inventory.findById(req.params.id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'Inventory item not found'
    });
  }

  await item.remove();

  res.json({
    success: true,
    message: 'Inventory item deleted successfully'
  });
}));

// @desc    Get low stock items
// @route   GET /api/inventory/low-stock
// @access  Private
router.get('/low-stock', protect, asyncHandler(async (req, res) => {
  const { branchId, page = 1, limit = 10 } = req.query;

  let query = {
    $expr: { $lt: [{ $toInt: "$quantity" }, { $toInt: "$minStockLevel" }] }
  };

  if (branchId) query.branchId = branchId;

  const lowStockItems = await Inventory.find(query)
    .populate('branchId', 'name')
    .populate('supplier', 'firstName lastName')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ quantity: 1 });

  const total = await Inventory.countDocuments(query);

  res.json({
    success: true,
    data: {
      lowStockItems,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        totalDocs: total
      }
    }
  });
}));

// @desc    Update inventory stock
// @route   POST /api/inventory/:id/stock-update
// @access  Private/Admin/Accountant
router.post('/:id/stock-update', protect, checkRole('admin', 'accountant'), asyncHandler(async (req, res) => {
  const { quantityChange, reason } = req.body;

  if (quantityChange === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Please provide quantity change value'
    });
  }

  const item = await Inventory.findById(req.params.id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'Inventory item not found'
    });
  }

  // Update quantity
  const newQuantity = Math.max(0, item.quantity + quantityChange); // Ensure quantity doesn't go below 0
  item.quantity = newQuantity;
  item.totalValue = newQuantity * (item.unitPrice || 0);

  // Update status based on quantity
  if (newQuantity === 0) {
    item.status = 'damaged'; // or 'out-of-stock' if we want a separate status
  } else if (newQuantity < item.minStockLevel) {
    item.status = 'available'; // still needs restocking
  } else {
    item.status = 'available';
  }

  const updatedItem = await item.save();

  // Emit real-time notification if stock is low
  if (updatedItem.quantity < updatedItem.minStockLevel) {
    const io = req.app.get('io');
    if (io) {
      io.emit('low_stock_alert', {
        itemId: updatedItem._id,
        name: updatedItem.name,
        currentQuantity: updatedItem.quantity,
        minLevel: updatedItem.minStockLevel,
        branchId: updatedItem.branchId
      });
    }
  }

  res.json({
    success: true,
    message: `Inventory stock ${quantityChange >= 0 ? 'increased' : 'decreased'} successfully`,
    data: updatedItem
  });
}));

// @desc    Get inventory summary by category
// @route   GET /api/inventory/summary
// @access  Private
router.get('/summary', protect, asyncHandler(async (req, res) => {
  const { branchId } = req.query;

  let query = {};
  if (branchId) query.branchId = branchId;

  const inventoryItems = await Inventory.find(query);

  // Group by category and calculate totals
  const summaryByCategory = {};
  let totalValue = 0;
  let totalItems = 0;

  inventoryItems.forEach(item => {
    if (!summaryByCategory[item.category]) {
      summaryByCategory[item.category] = {
        category: item.category,
        totalItems: 0,
        totalQuantity: 0,
        totalValue: 0,
        items: []
      };
    }

    summaryByCategory[item.category].totalItems += 1;
    summaryByCategory[item.category].totalQuantity += item.quantity || 0;
    summaryByCategory[item.category].totalValue += item.totalValue || 0;
    summaryByCategory[item.category].items.push({
      name: item.name,
      quantity: item.quantity,
      value: item.totalValue
    });

    totalValue += item.totalValue || 0;
    totalItems += 1;
  });

  res.json({
    success: true,
    data: {
      summaryByCategory,
      overall: {
        totalCategories: Object.keys(summaryByCategory).length,
        totalItems,
        totalValue
      }
    }
  });
}));

module.exports = router;