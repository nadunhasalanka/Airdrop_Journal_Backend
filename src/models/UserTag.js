const mongoose = require('mongoose');

// User Tags Schema
const userTagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tag name is required'],
    trim: true,
    lowercase: true,
    maxlength: [30, 'Tag name cannot be more than 30 characters']
  },
  color: {
    type: String,
    default: '#8B5CF6', // Default violet color
    validate: {
      validator: function(color) {
        return /^#[0-9A-F]{6}$/i.test(color);
      },
      message: 'Color must be a valid hex color code'
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to ensure unique tag names per user
userTagSchema.index({ name: 1, userId: 1 }, { unique: true });

// Index for better query performance
userTagSchema.index({ userId: 1, usageCount: -1 });

// Pre-save middleware to ensure lowercase name
userTagSchema.pre('save', function(next) {
  if (this.name) {
    this.name = this.name.toLowerCase().trim();
  }
  next();
});

// Static method to get user's tags
userTagSchema.statics.getUserTags = function(userId, options = {}) {
  const query = { userId };
  
  if (options.search) {
    query.name = new RegExp(options.search, 'i');
  }
  
  return this.find(query)
    .sort(options.sortBy || { usageCount: -1, name: 1 })
    .limit(options.limit || 100);
};

// Static method to create default tags for a new user
userTagSchema.statics.createDefaultTags = async function(userId) {
  const defaultTags = [
    { name: 'layer 2', color: '#8B5CF6', isDefault: true },
    { name: 'ethereum', color: '#627EEA', isDefault: true },
    { name: 'defi', color: '#FF6B35', isDefault: true },
    { name: 'testnet', color: '#10B981', isDefault: true },
    { name: 'mainnet', color: '#F59E0B', isDefault: true },
    { name: 'telegram', color: '#0088CC', isDefault: true },
    { name: 'gaming', color: '#8B5CF6', isDefault: true },
    { name: 'nft', color: '#EC4899', isDefault: true },
    { name: 'high priority', color: '#EF4444', isDefault: true },
    { name: 'medium priority', color: '#F59E0B', isDefault: true },
    { name: 'low priority', color: '#6B7280', isDefault: true },
    { name: 'daily task', color: '#10B981', isDefault: true }
  ];

  const tagsToCreate = defaultTags.map(tag => ({
    ...tag,
    userId
  }));

  try {
    await this.insertMany(tagsToCreate, { ordered: false });
  } catch (error) {
    // Ignore duplicate key errors (in case some tags already exist)
    if (error.code !== 11000) {
      throw error;
    }
  }
};

// Instance method to increment usage count
userTagSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  return this.save();
};

module.exports = mongoose.model('UserTag', userTagSchema);
