const express = require('express');
const { body, validationResult, param } = require('express-validator');
const UserTag = require('../models/UserTag');
const { protect } = require('../middleware/auth');

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

// Validation rules for creating/updating tags
const tagValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Tag name must be between 1 and 30 characters')
    .matches(/^[a-zA-Z0-9\s\-_]+$/)
    .withMessage('Tag name can only contain letters, numbers, spaces, hyphens, and underscores'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Color must be a valid hex color code (e.g., #8B5CF6)')
];

// GET /api/tags - Get user's tags
router.get('/', protect, async (req, res) => {
  try {
    const {
      search,
      sortBy = 'usageCount',
      sortOrder = 'desc',
      limit = 100
    } = req.query;

    const options = {
      search,
      sortBy: sortBy === 'usageCount' ? { usageCount: sortOrder === 'desc' ? -1 : 1 } : { name: sortOrder === 'desc' ? -1 : 1 },
      limit: parseInt(limit)
    };

    const tags = await UserTag.getUserTags(req.user._id, options);

    res.json({
      success: true,
      data: tags,
      count: tags.length
    });

  } catch (error) {
    console.error('Error fetching user tags:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tags',
      error: error.message
    });
  }
});

// GET /api/tags/suggestions - Get tag suggestions based on search
router.get('/suggestions', protect, async (req, res) => {
  try {
    const { q = '', limit = 10 } = req.query;

    const tags = await UserTag.find({
      userId: req.user._id,
      name: new RegExp(q, 'i')
    })
    .sort({ usageCount: -1, name: 1 })
    .limit(parseInt(limit))
    .select('name color usageCount');

    res.json({
      success: true,
      data: tags
    });

  } catch (error) {
    console.error('Error fetching tag suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tag suggestions',
      error: error.message
    });
  }
});

// POST /api/tags - Create new tag
router.post('/',
  protect,
  tagValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, color = '#8B5CF6' } = req.body;
      
      const tag = new UserTag({
        name: name.toLowerCase().trim(),
        color,
        userId: req.user._id
      });
      
      const savedTag = await tag.save();
      
      res.status(201).json({
        success: true,
        data: savedTag,
        message: 'Tag created successfully'
      });

    } catch (error) {
      console.error('Error creating tag:', error);
      
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Tag with this name already exists'
        });
      }
      
      res.status(400).json({
        success: false,
        message: 'Failed to create tag',
        error: error.message
      });
    }
  }
);

// PUT /api/tags/:id - Update tag
router.put('/:id',
  protect,
  param('id').isMongoId().withMessage('Invalid tag ID'),
  tagValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { name, color } = req.body;
      
      const tag = await UserTag.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!tag) {
        return res.status(404).json({
          success: false,
          message: 'Tag not found'
        });
      }

      // Don't allow updating default tags' names
      if (tag.isDefault && name && name.toLowerCase() !== tag.name) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change the name of default tags'
        });
      }

      if (name) tag.name = name.toLowerCase().trim();
      if (color) tag.color = color;

      const updatedTag = await tag.save();

      res.json({
        success: true,
        data: updatedTag,
        message: 'Tag updated successfully'
      });

    } catch (error) {
      console.error('Error updating tag:', error);
      
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'Tag with this name already exists'
        });
      }
      
      res.status(400).json({
        success: false,
        message: 'Failed to update tag',
        error: error.message
      });
    }
  }
);

// DELETE /api/tags/:id - Delete tag
router.delete('/:id',
  protect,
  param('id').isMongoId().withMessage('Invalid tag ID'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const tag = await UserTag.findOne({
        _id: req.params.id,
        userId: req.user._id
      });

      if (!tag) {
        return res.status(404).json({
          success: false,
          message: 'Tag not found'
        });
      }

      // Don't allow deleting default tags
      if (tag.isDefault) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete default tags'
        });
      }

      await UserTag.deleteOne({ _id: req.params.id });

      res.json({
        success: true,
        message: 'Tag deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting tag:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete tag',
        error: error.message
      });
    }
  }
);

// POST /api/tags/bulk-create - Create multiple tags
router.post('/bulk-create',
  protect,
  body('tags').isArray().withMessage('Tags must be an array'),
  body('tags.*.name').trim().isLength({ min: 1, max: 30 }).withMessage('Each tag name must be between 1 and 30 characters'),
  body('tags.*.color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Color must be a valid hex color code'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { tags } = req.body;
      
      const tagsToCreate = tags.map(tag => ({
        name: tag.name.toLowerCase().trim(),
        color: tag.color || '#8B5CF6',
        userId: req.user._id
      }));

      const createdTags = [];
      const errors = [];

      for (const tagData of tagsToCreate) {
        try {
          const tag = new UserTag(tagData);
          const savedTag = await tag.save();
          createdTags.push(savedTag);
        } catch (error) {
          if (error.code === 11000) {
            errors.push(`Tag "${tagData.name}" already exists`);
          } else {
            errors.push(`Failed to create tag "${tagData.name}": ${error.message}`);
          }
        }
      }

      res.status(201).json({
        success: true,
        data: createdTags,
        message: `Created ${createdTags.length} tags successfully`,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error('Error bulk creating tags:', error);
      res.status(400).json({
        success: false,
        message: 'Failed to create tags',
        error: error.message
      });
    }
  }
);

module.exports = router;
