const mongoose = require('mongoose');

// Airdrop Schema
const airdropSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Airdrop name is required'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  status: {
    type: String,
    enum: {
      values: ['upcoming', 'active', 'completed', 'ended'],
      message: 'Status must be one of: upcoming, active, completed, ended'
    },
    default: 'upcoming'
  },
  startDate: {
    type: Date,
    validate: {
      validator: function(value) {
        // Start date should be in the future or today
        return !value || value >= new Date().setHours(0,0,0,0);
      },
      message: 'Start date cannot be in the past'
    }
  },
  endDate: {
    type: Date,
    validate: {
      validator: function(value) {
        // End date should be after start date
        return !value || !this.startDate || value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  tokenSymbol: {
    type: String,
    uppercase: true,
    trim: true,
    maxlength: [10, 'Token symbol cannot be more than 10 characters']
  },
  totalReward: {
    type: String,
    trim: true
  },
  requirements: [{
    type: String,
    trim: true,
    maxlength: [200, 'Each requirement cannot be more than 200 characters']
  }],
  website: {
    type: String,
    trim: true,
    validate: {
      validator: function(url) {
        return !url || /^https?:\/\/.+/.test(url);
      },
      message: 'Website must be a valid URL starting with http:// or https://'
    }
  },
  twitter: {
    type: String,
    trim: true,
    validate: {
      validator: function(url) {
        return !url || /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+/.test(url);
      },
      message: 'Twitter must be a valid Twitter/X URL'
    }
  },
  discord: {
    type: String,
    trim: true,
    validate: {
      validator: function(url) {
        return !url || /^https?:\/\/(www\.)?discord\.(gg|com)\/.+/.test(url);
      },
      message: 'Discord must be a valid Discord URL'
    }
  },
  telegram: {
    type: String,
    trim: true,
    validate: {
      validator: function(url) {
        return !url || /^https?:\/\/(www\.)?t\.me\/.+/.test(url);
      },
      message: 'Telegram must be a valid Telegram URL'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    min: [1, 'Priority must be at least 1'],
    max: [5, 'Priority cannot be more than 5'],
    default: 3
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }]
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field for days remaining
airdropSchema.virtual('daysRemaining').get(function() {
  if (!this.endDate) return null;
  
  const now = new Date();
  const timeDiff = this.endDate.getTime() - now.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  return daysDiff > 0 ? daysDiff : 0;
});

// Virtual field for duration in days
airdropSchema.virtual('duration').get(function() {
  if (!this.startDate || !this.endDate) return null;
  
  const timeDiff = this.endDate.getTime() - this.startDate.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
});

// Index for better query performance
airdropSchema.index({ status: 1, createdAt: -1 });
airdropSchema.index({ endDate: 1 });
airdropSchema.index({ tokenSymbol: 1 });

// Pre-save middleware to update status based on dates
airdropSchema.pre('save', function(next) {
  const now = new Date();
  
  if (this.startDate && this.endDate) {
    if (now < this.startDate) {
      this.status = 'upcoming';
    } else if (now >= this.startDate && now <= this.endDate) {
      this.status = 'active';
    } else if (now > this.endDate) {
      this.status = 'ended';
    }
  }
  
  next();
});

// Static method to get airdrops by status
airdropSchema.statics.getByStatus = function(status) {
  return this.find({ status, isActive: true }).sort({ createdAt: -1 });
};

// Static method to get active airdrops
airdropSchema.statics.getActive = function() {
  return this.find({ 
    status: 'active', 
    isActive: true 
  }).sort({ priority: -1, createdAt: -1 });
};

// Instance method to mark as completed
airdropSchema.methods.markCompleted = function() {
  this.status = 'completed';
  return this.save();
};

module.exports = mongoose.model('Airdrop', airdropSchema);
