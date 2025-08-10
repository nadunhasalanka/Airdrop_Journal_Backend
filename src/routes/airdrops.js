const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Airdrop = require('../models/Airdrop');
const Task = require('../models/Task');
const UserTag = require('../models/UserTag');
const { protect, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Helper function to create daily task for airdrop
const createDailyTaskForAirdrop = async (airdrop, userId) => {
  try {
    // Check if daily task already exists for this airdrop
    const existingTask = await Task.findOne({
      airdrop: airdrop._id,
      user: userId,
      isDaily: true
    });

    if (existingTask) {
      return existingTask; // Don't create duplicate daily tasks
    }

    // Create daily task
    const taskData = {
      title: airdrop.dailyTaskNote || `Daily task for ${airdrop.name}`,
      description: airdrop.description,
      project: airdrop.name,
      airdrop: airdrop._id,
      user: userId,
      isDaily: true,
      category: airdrop.type || 'Mainnet',
      priority: 'Medium',
      estimatedTime: 15,
      difficulty: 'Easy'
    };

    const task = new Task(taskData);
    const savedTask = await task.save();
    return savedTask;
  } catch (error) {
    console.error('Error creating daily task for airdrop:', error);
    throw error;
  }
};

// Helper function to remove all tasks for airdrop
const removeAllTasksForAirdrop = async (airdropId, userId) => {
  try {
    await Task.deleteMany({
      airdrop: airdropId,
      user: userId
    });
  } catch (error) {
    console.error('Error removing tasks for airdrop:', error);
    throw error;
  }
};

// Helper function to remove daily task for airdrop
const removeDailyTaskForAirdrop = async (airdropId, userId) => {
  try {
    await Task.deleteMany({
      airdrop: airdropId,
      user: userId,
      isDaily: true
    });
  } catch (error) {
    console.error('Error removing daily task for airdrop:', error);
    throw error;
  }
};

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Validation rules for creating/updating airdrops
const airdropValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be between 1 and 1000 characters'),
  body('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date'),
  body('tokenSymbol')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Token symbol cannot be more than 10 characters'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
  body('twitter')
    .optional()
    .matches(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+/)
    .withMessage('Twitter must be a valid Twitter/X URL'),
  body('discord')
    .optional()
    .matches(/^https?:\/\/(www\.)?discord\.(gg|com)\/.+/)
    .withMessage('Discord must be a valid Discord URL'),
  body('telegram')
    .optional()
    .matches(/^https?:\/\/(www\.)?t\.me\/.+/)
    .withMessage('Telegram must be a valid Telegram URL'),
  body('requirements')
    .optional()
    .isArray()
    .withMessage('Requirements must be an array'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

// GET /api/airdrops - Get user's airdrops with filtering and pagination
// Protected endpoint - returns only user's airdrops
router.get('/', protect, async (req, res) => {
  try {
    const {
      status,
      tokenSymbol,
      priority,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      tags
    } = req.query;

    // Build query object - only show user's airdrops
    const query = { 
      user: req.user._id 
    };
    
    if (status) {
      query.status = status;
    }
    
    if (tokenSymbol) {
      query.tokenSymbol = new RegExp(tokenSymbol, 'i');
    }
    
    if (priority) {
      query.priority = parseInt(priority);
    }
    
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { tokenSymbol: new RegExp(search, 'i') }
      ];
    }

    // Filter by tags if provided
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query.tags = { $in: tagArray.map(tag => tag.toLowerCase()) };
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const [airdrops, total] = await Promise.all([
      Airdrop.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .populate('user', 'firstName lastName email'),
      Airdrop.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: airdrops,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Error fetching airdrops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch airdrops',
      error: error.message
    });
  }
});

// GET /api/airdrops/stats - Get user's airdrop statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const stats = await Airdrop.aggregate([
      { 
        $match: { 
          user: req.user._id 
        } 
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalAirdrops = await Airdrop.countDocuments({ 
      user: req.user._id 
    });

    const formattedStats = {
      total: totalAirdrops,
      byStatus: {}
    };

    stats.forEach(stat => {
      formattedStats.byStatus[stat._id] = stat.count;
    });

    res.json({
      success: true,
      data: formattedStats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

// GET /api/airdrops/:id - Get single airdrop by ID (user's own airdrop only)
router.get('/:id', 
  protect,
  param('id').isMongoId().withMessage('Invalid airdrop ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const airdrop = await Airdrop.findOne({
        _id: req.params.id,
        user: req.user._id
      }).populate('user', 'firstName lastName email');
      
      if (!airdrop) {
        return res.status(404).json({
          success: false,
          message: 'Airdrop not found'
        });
      }

      res.json({
        success: true,
        data: airdrop
      });

    } catch (error) {
      console.error('Error fetching airdrop:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch airdrop',
        error: error.message
      });
    }
  }
);

// POST /api/airdrops - Create new airdrop
// Protected endpoint - requires authentication
router.post('/',
  protect,
  airdropValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      // Add creator information to the airdrop
      const airdropData = {
        ...req.body,
        user: req.user._id
      };
      
      const airdrop = new Airdrop(airdropData);
      const savedAirdrop = await airdrop.save();

      // Create daily task if airdrop is marked as daily task
      if (savedAirdrop.isDailyTask) {
        try {
          await createDailyTaskForAirdrop(savedAirdrop, req.user._id);
        } catch (taskError) {
          console.error('Error creating daily task:', taskError);
          // Don't fail the airdrop creation if task creation fails
        }
      }

      // Increment usage count for used tags
      if (savedAirdrop.tags && savedAirdrop.tags.length > 0) {
        try {
          await Promise.all(
            savedAirdrop.tags.map(async (tagName) => {
              const tag = await UserTag.findOne({
                name: tagName.toLowerCase(),
                userId: req.user._id
              });
              if (tag) {
                await tag.incrementUsage();
              }
            })
          );
        } catch (tagError) {
          console.error('Error updating tag usage:', tagError);
          // Don't fail the airdrop creation if tag update fails
        }
      }
      
      res.status(201).json({
        success: true,
        data: savedAirdrop,
        message: 'Airdrop created successfully'
      });

    } catch (error) {
      console.error('Error creating airdrop:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to create airdrop',
        error: error.message
      });
    }
  }
);

// PUT /api/airdrops/:id - Update airdrop
// Protected endpoint - only creator can update
router.put('/:id',
  protect,
  param('id').isMongoId().withMessage('Invalid airdrop ID'),
  airdropValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      // First check if airdrop exists and user owns it
      const existingAirdrop = await Airdrop.findById(req.params.id);
      
      if (!existingAirdrop) {
        return res.status(404).json({
          success: false,
          message: 'Airdrop not found'
        });
      }
      
      // Check if user owns this airdrop
      if (!existingAirdrop.user.equals(req.user._id)) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own airdrops'
        });
      }
      
      // Store the previous isDailyTask state
      const wasDaily = existingAirdrop.isDailyTask;
      
      const airdrop = await Airdrop.findByIdAndUpdate(
        req.params.id,
        req.body,
        { 
          new: true, 
          runValidators: true,
          context: 'query'
        }
      );

      if (!airdrop) {
        return res.status(404).json({
          success: false,
          message: 'Airdrop not found'
        });
      }

      // Handle daily task changes
      if (airdrop.isDailyTask && !wasDaily) {
        // Airdrop was changed to daily task - create daily task
        try {
          await createDailyTaskForAirdrop(airdrop, req.user._id);
        } catch (taskError) {
          console.error('Error creating daily task:', taskError);
        }
      } else if (!airdrop.isDailyTask && wasDaily) {
        // Airdrop was removed from daily task - remove daily task
        try {
          await removeDailyTaskForAirdrop(airdrop._id, req.user._id);
        } catch (taskError) {
          console.error('Error removing daily task:', taskError);
        }
      } else if (airdrop.isDailyTask && wasDaily) {
        // Update existing daily task if the airdrop details changed
        try {
          await Task.updateMany(
            { airdrop: airdrop._id, user: req.user._id, isDaily: true },
            {
              title: airdrop.dailyTaskNote || `Daily task for ${airdrop.name}`,
              description: airdrop.description,
              project: airdrop.name,
              category: airdrop.type || 'Mainnet'
            }
          );
        } catch (taskError) {
          console.error('Error updating daily task:', taskError);
        }
      }

      res.json({
        success: true,
        data: airdrop,
        message: 'Airdrop updated successfully'
      });

    } catch (error) {
      console.error('Error updating airdrop:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to update airdrop',
        error: error.message
      });
    }
  }
);

// DELETE /api/airdrops/:id - Delete airdrop and all related tasks (user's own only)
router.delete('/:id',
  protect,
  param('id').isMongoId().withMessage('Invalid airdrop ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      // First, verify the airdrop exists and belongs to the user
      const airdrop = await Airdrop.findOne(
        { 
          _id: req.params.id, 
          user: req.user._id 
        }
      );

      if (!airdrop) {
        return res.status(404).json({
          success: false,
          message: 'Airdrop not found'
        });
      }

      // Delete all related tasks first
      await removeAllTasksForAirdrop(req.params.id, req.user._id);

      // Then delete the airdrop
      await Airdrop.findOneAndDelete(
        { 
          _id: req.params.id, 
          user: req.user._id 
        }
      );

      res.json({
        success: true,
        message: 'Airdrop and related tasks deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting airdrop:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete airdrop',
        error: error.message
      });
    }
  }
);

// GET /api/airdrops/status/:status - Get airdrops by status
router.get('/status/:status',
  param('status').isIn(['upcoming', 'active', 'completed', 'ended']).withMessage('Invalid status'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { status } = req.params;
      const airdrops = await Airdrop.getByStatus(status);
      
      res.json({
        success: true,
        data: airdrops,
        count: airdrops.length
      });

    } catch (error) {
      console.error('Error fetching airdrops by status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch airdrops by status',
        error: error.message
      });
    }
  }
);

// PATCH /api/airdrops/:id/complete - Mark airdrop as completed
router.patch('/:id/complete',
  param('id').isMongoId().withMessage('Invalid airdrop ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const airdrop = await Airdrop.findById(req.params.id);
      
      if (!airdrop) {
        return res.status(404).json({
          success: false,
          message: 'Airdrop not found'
        });
      }

      await airdrop.markCompleted();

      res.json({
        success: true,
        data: airdrop,
        message: 'Airdrop marked as completed'
      });

    } catch (error) {
      console.error('Error marking airdrop as completed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark airdrop as completed',
        error: error.message
      });
    }
  }
);

module.exports = router;
