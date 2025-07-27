const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('Avatar must be a valid URL'),
  body('preferences.theme')
    .optional()
    .isIn(['light', 'dark', 'system'])
    .withMessage('Theme must be light, dark, or system'),
  body('preferences.defaultCurrency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-letter code'),
  body('preferences.notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notification preference must be a boolean'),
  body('preferences.notifications.airdropReminders')
    .optional()
    .isBoolean()
    .withMessage('Airdrop reminder preference must be a boolean')
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', protect, async (req, res) => {
  try {
    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: req.user._id,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          fullName: req.user.fullName,
          email: req.user.email,
          username: req.user.username,
          avatar: req.user.avatar,
          role: req.user.role,
          isEmailVerified: req.user.isEmailVerified,
          preferences: req.user.preferences,
          stats: req.user.stats,
          lastLoginAt: req.user.lastLoginAt,
          createdAt: req.user.createdAt,
          updatedAt: req.user.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user profile'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, validateProfileUpdate, handleValidationErrors, async (req, res) => {
  try {
    const allowedFields = ['firstName', 'lastName', 'username', 'avatar', 'preferences'];
    const updates = {};

    // Filter out only allowed fields
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        if (key === 'preferences') {
          // Merge preferences instead of replacing
          updates.preferences = { ...req.user.preferences, ...req.body.preferences };
        } else {
          updates[key] = req.body[key];
        }
      }
    });

    // Check if username is already taken (if updating username)
    if (updates.username && updates.username !== req.user.username) {
      const existingUser = await User.findOne({ 
        username: updates.username,
        _id: { $ne: req.user._id }
      });
      
      if (existingUser) {
        return res.status(409).json({
          status: 'fail',
          message: 'Username is already taken'
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      {
        new: true,
        runValidators: true
      }
    );

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedUser._id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          fullName: updatedUser.fullName,
          email: updatedUser.email,
          username: updatedUser.username,
          avatar: updatedUser.avatar,
          role: updatedUser.role,
          preferences: updatedUser.preferences,
          stats: updatedUser.stats,
          updatedAt: updatedUser.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        status: 'fail',
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile'
    });
  }
});

// @route   GET /api/users/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    // Update stats before returning
    await req.user.updateStats();
    
    res.status(200).json({
      status: 'success',
      data: {
        stats: req.user.stats
      }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user statistics'
    });
  }
});

// @route   DELETE /api/users/account
// @desc    Deactivate user account
// @access  Private
router.delete('/account', protect, [
  body('confirmPassword')
    .isLength({ min: 1 })
    .withMessage('Password confirmation is required'),
], handleValidationErrors, async (req, res) => {
  try {
    const { confirmPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Verify password
    if (!(await user.comparePassword(confirmPassword))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Password is incorrect'
      });
    }

    // Deactivate account instead of deleting
    user.isActive = false;
    user.email = `deleted_${Date.now()}_${user.email}`; // Prevent email conflicts
    if (user.username) {
      user.username = `deleted_${Date.now()}_${user.username}`;
    }
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating account:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to deactivate account'
    });
  }
});

// Admin only routes
// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private/Admin
router.get('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const filter = { isActive: true };
    
    // Add search functionality
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { username: searchRegex }
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      results: users.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      data: {
        users
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID (Admin only)
// @access  Private/Admin
router.get('/:id', protect, restrictTo('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user'
    });
  }
});

// @route   PATCH /api/users/:id/role
// @desc    Update user role (Admin only)
// @access  Private/Admin
router.patch('/:id/role', protect, restrictTo('admin'), [
  body('role')
    .isIn(['user', 'admin'])
    .withMessage('Role must be either user or admin')
], handleValidationErrors, async (req, res) => {
  try {
    const { role } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'User role updated successfully',
      data: {
        user
      }
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user role'
    });
  }
});

module.exports = router;
