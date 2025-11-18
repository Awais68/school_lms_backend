const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: String,
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String, // "pcs", "kg", "liters", etc.
    required: true
  },
  unitPrice: {
    type: Number,
    min: 0
  },
  totalValue: {
    type: Number,
    min: 0
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Supplier user
  },
  purchaseDate: Date,
  expiryDate: Date, // for consumables
  location: String, // e.g., "Store Room A", "Lab 1"
  minStockLevel: {
    type: Number,
    default: 0
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  status: {
    type: String,
    default: 'available',
    enum: ['available', 'in-use', 'damaged', 'disposed']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Inventory', inventorySchema);