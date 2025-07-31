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
  ecosystem: {
    type: String,
    enum: ['Ethereum', 'Solana', 'Polygon', 'Arbitrum', 'Optimism', 'BSC', 'Avalanche', 'Multi-chain'],
    default: 'Ethereum'
  },
  type: {
    type: String,
    enum: ['Testnet', 'Mainnet', 'Telegram', 'Web3', 'Social'],
    default: 'Mainnet'
  },
  status: {
    type: String,
    default: 'Farming'
  },
  deadline: {
    type: String,
    trim: true,
    default: 'TBA'
  },
  estimatedValue: {
    type: String,
    trim: true
  },
  priority: {
    type: mongoose.Schema.Types.Mixed,
    default: 'Medium'
  },
  officialLink: {
    type: String,
    required: [true, 'Official link is required'],
    trim: true,
    validate: {
      validator: function(url) {
        return /^https?:\/\/.+/.test(url);
      },
      message: 'Official link must be a valid URL starting with http:// or https://'
    }
  },
  referralLink: {
    type: String,
    trim: true,
    validate: {
      validator: function(url) {
        return !url || /^https?:\/\/.+/.test(url);
      },
      message: 'Referral link must be a valid URL starting with http:// or https://'
    }
  },
  logoUrl: {
    type: String,
    trim: true
  },
  bannerUrl: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes cannot be more than 2000 characters']
  },
  isDailyTask: {
    type: Boolean,
    default: false
  },
  dailyTaskNote: {
    type: String,
    trim: true,
    maxlength: [500, 'Daily task note cannot be more than 500 characters']
  },
  tokenSymbol: {
    type: String,
    uppercase: true,
    trim: true,
    maxlength: [10, 'Token symbol cannot be more than 10 characters']
  },
  startDate: {
    type: Date
  },
  socialMedia: {
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
    medium: {
      type: String,
      trim: true,
      validate: {
        validator: function(url) {
          return !url || /^https?:\/\/(www\.)?medium\.com\/.+/.test(url);
        },
        message: 'Medium must be a valid Medium URL'
      }
    },
    github: {
      type: String,
      trim: true,
      validate: {
        validator: function(url) {
          return !url || /^https?:\/\/(www\.)?github\.com\/.+/.test(url);
        },
        message: 'GitHub must be a valid GitHub URL'
      }
    },
    website: {
      type: String,
      trim: true,
      validate: {
        validator: function(url) {
          return !url || /^https?:\/\/.+/.test(url);
        },
        message: 'Website must be a valid URL starting with http:// or https://'
      }
    }
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual field for network (alias for ecosystem)
airdropSchema.virtual('network').get(function() {
  return this.ecosystem;
});

// Virtual field for category (derived from ecosystem)
airdropSchema.virtual('category').get(function() {
  const categoryMap = {
    'Ethereum': 'DeFi',
    'Solana': 'DeFi', 
    'Polygon': 'DeFi',
    'Arbitrum': 'Infrastructure',
    'Optimism': 'Infrastructure',
    'BSC': 'DeFi',
    'Avalanche': 'DeFi',
    'Multi-chain': 'Infrastructure'
  };
  return categoryMap[this.ecosystem] || 'Other';
});

// Virtual field for tasks completed/total (mock data for now)
airdropSchema.virtual('tasksCompleted').get(function() {
  // This would be calculated based on actual task completion
  return Math.floor(Math.random() * 10) + 1;
});

airdropSchema.virtual('totalTasks').get(function() {
  // This would be the total number of tasks for this airdrop
  return Math.floor(Math.random() * 5) + this.tasksCompleted;
});

// Virtual field for last updated (human readable)
airdropSchema.virtual('lastUpdated').get(function() {
  const now = new Date();
  const diffMs = now - this.updatedAt;
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

// Index for better query performance
airdropSchema.index({ status: 1, createdAt: -1 });
airdropSchema.index({ user: 1, createdAt: -1 });
airdropSchema.index({ tokenSymbol: 1 });
airdropSchema.index({ ecosystem: 1 });
airdropSchema.index({ tags: 1 });

// Static method to get airdrops by user
airdropSchema.statics.getByUser = function(userId) {
  return this.find({ user: userId }).sort({ createdAt: -1 });
};

// Static method to get airdrops by status for a user
airdropSchema.statics.getByUserAndStatus = function(userId, status) {
  return this.find({ user: userId, status }).sort({ createdAt: -1 });
};

// Instance method to mark as completed
airdropSchema.methods.markCompleted = function() {
  this.status = 'Completed';
  return this.save();
};

module.exports = mongoose.model('Airdrop', airdropSchema);
