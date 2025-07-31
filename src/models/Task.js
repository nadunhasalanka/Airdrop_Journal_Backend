const mongoose = require('mongoose');

// Task Schema
const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  project: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    maxlength: [100, 'Project name cannot be more than 100 characters']
  },
  completed: {
    type: Boolean,
    default: false
  },
  isDaily: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  dueDate: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot be more than 500 characters']
  },
  airdrop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Airdrop'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  category: {
    type: String,
    enum: ['Testnet', 'Mainnet', 'Social', 'DeFi', 'Gaming', 'NFT', 'Bridge', 'Staking'],
    default: 'Mainnet'
  },
  estimatedTime: {
    type: Number, // in minutes
    default: 15
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Easy'
  },
  reward: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field for status
taskSchema.virtual('status').get(function() {
  if (this.completed) return 'Completed';
  if (this.dueDate && this.dueDate < new Date()) return 'Overdue';
  return 'Pending';
});

// Virtual field for days remaining
taskSchema.virtual('daysRemaining').get(function() {
  if (!this.dueDate || this.completed) return null;
  const now = new Date();
  const diffTime = this.dueDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual field for time since completion
taskSchema.virtual('timeSinceCompletion').get(function() {
  if (!this.completed || !this.completedAt) return null;
  const now = new Date();
  const diffMs = now - this.completedAt;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
});

// Indexes for better query performance
taskSchema.index({ user: 1, completed: 1, createdAt: -1 });
taskSchema.index({ user: 1, isDaily: 1, createdAt: -1 });
taskSchema.index({ project: 1 });
taskSchema.index({ airdrop: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ category: 1 });

// Static method to get tasks by user
taskSchema.statics.getByUser = function(userId, options = {}) {
  const query = { user: userId };
  
  // Add filters based on options
  if (options.completed !== undefined) {
    query.completed = options.completed;
  }
  if (options.isDaily !== undefined) {
    query.isDaily = options.isDaily;
  }
  if (options.project) {
    query.project = options.project;
  }
  if (options.category) {
    query.category = options.category;
  }
  
  return this.find(query)
    .populate('airdrop', 'name logoUrl')
    .sort({ completed: 1, createdAt: -1 });
};

// Static method to get today's tasks
taskSchema.statics.getTodaysTasks = function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.find({
    user: userId,
    $or: [
      { isDaily: true },
      { 
        createdAt: { 
          $gte: today, 
          $lt: tomorrow 
        } 
      }
    ]
  })
  .populate('airdrop', 'name logoUrl')
  .sort({ completed: 1, priority: -1, createdAt: -1 });
};

// Static method to get daily tasks
taskSchema.statics.getDailyTasks = function(userId) {
  return this.find({ 
    user: userId, 
    isDaily: true 
  })
  .populate('airdrop', 'name logoUrl')
  .sort({ completed: 1, createdAt: -1 });
};

// Instance method to mark as completed
taskSchema.methods.markCompleted = function() {
  this.completed = true;
  this.completedAt = new Date();
  return this.save();
};

// Instance method to mark as pending
taskSchema.methods.markPending = function() {
  this.completed = false;
  this.completedAt = null;
  return this.save();
};

// Pre-save middleware to handle completion
taskSchema.pre('save', function(next) {
  if (this.isModified('completed')) {
    if (this.completed && !this.completedAt) {
      this.completedAt = new Date();
    } else if (!this.completed) {
      this.completedAt = null;
    }
  }
  next();
});

module.exports = mongoose.model('Task', taskSchema);
