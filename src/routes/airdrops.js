const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Airdrop = require('../models/Airdrop');
const { protect, optionalAuth } = require('../middleware/auth');

const router = express.Router();

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
  body('status')
    .optional()
    .isIn(['upcoming', 'active', 'completed', 'ended'])
    .withMessage('Status must be one of: upcoming, active, completed, ended'),
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
  body('priority')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Priority must be between 1 and 5'),
  body('requirements')
    .optional()
    .isArray()
    .withMessage('Requirements must be an array'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

// GET /api/airdrops - Get all airdrops with filtering and pagination
// Public endpoint - anyone can view airdrops
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      status,
      tokenSymbol,
      priority,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search
    } = req.query;

    // Build query object
    const query = { isActive: true };
    
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
        .limit(limitNum),
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

// GET /api/airdrops/stats - Get airdrop statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await Airdrop.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalAirdrops = await Airdrop.countDocuments({ isActive: true });

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

// GET /api/airdrops/:id - Get single airdrop by ID
router.get('/:id', 
  param('id').isMongoId().withMessage('Invalid airdrop ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const airdrop = await Airdrop.findById(req.params.id);
      
      if (!airdrop || !airdrop.isActive) {
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
        createdBy: req.user._id
      };
      
      const airdrop = new Airdrop(airdropData);
      const savedAirdrop = await airdrop.save();
      
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
      
      if (!existingAirdrop || !existingAirdrop.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Airdrop not found'
        });
      }
      
      // Check if user owns this airdrop
      if (!existingAirdrop.createdBy.equals(req.user._id)) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own airdrops'
        });
      }
      
      const airdrop = await Airdrop.findByIdAndUpdate(
        req.params.id,
        req.body,
        { 
          new: true, 
          runValidators: true,
          context: 'query'
        }
      );

      if (!airdrop || !airdrop.isActive) {
        return res.status(404).json({
          success: false,
          message: 'Airdrop not found'
        });
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

// DELETE /api/airdrops/:id - Soft delete airdrop
router.delete('/:id',
  param('id').isMongoId().withMessage('Invalid airdrop ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const airdrop = await Airdrop.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
      );

      if (!airdrop) {
        return res.status(404).json({
          success: false,
          message: 'Airdrop not found'
        });
      }

      res.json({
        success: true,
        message: 'Airdrop deleted successfully'
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
      
      if (!airdrop || !airdrop.isActive) {
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
