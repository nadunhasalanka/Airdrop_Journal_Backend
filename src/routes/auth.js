const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const UserTag = require('../models/UserTag');
const { 
  protect, 
  loginLimiter, 
  registerLimiter, 
  forgotPasswordLimiter,
  resendVerificationLimiter 
} = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validateSignup = [
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required')
];

const validateForgotPassword = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
];

const validateResetPassword = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
];

// Helper function to send token response
const createSendToken = (user, statusCode, res, message = 'Success') => {
  const token = user.generateAuthToken();
  
  const cookieOptions = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRE || 7) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    message,
    token,
    data: {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        preferences: user.preferences,
        stats: user.stats,
        createdAt: user.createdAt
      }
    }
  });
};

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

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', registerLimiter, validateSignup, handleValidationErrors, async (req, res) => {
  try {
    const { firstName, lastName, email, password, username } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email },
        ...(username ? [{ username }] : [])
      ]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(409).json({
          status: 'fail',
          message: 'User with this email already exists'
        });
      }
      if (existingUser.username === username) {
        return res.status(409).json({
          status: 'fail',
          message: 'Username is already taken'
        });
      }
    }

    // Create new user
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      username,
      password
    });

    // Generate email verification token
    const verifyToken = newUser.createEmailVerificationToken();
    await newUser.save({ validateBeforeSave: false });

    // Create default tags for the new user
    try {
      await UserTag.createDefaultTags(newUser._id);
    } catch (tagError) {
      console.error('Error creating default tags:', tagError);
      // Don't fail user creation if tag creation fails
    }

    // TODO: Send verification email
    // await sendVerificationEmail(newUser.email, verifyToken);

    createSendToken(newUser, 201, res, 'User registered successfully! Please check your email to verify your account.');
  } catch (error) {
    console.error('Signup error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        status: 'fail',
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', loginLimiter, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get user and check if locked
    const result = await User.getAuthenticated(email, password);
    
    if (!result.user) {
      return res.status(401).json({
        status: 'fail',
        message: result.reason
      });
    }

    createSendToken(result.user, 200, res, 'Logged in successfully');
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during login'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset token
// @access  Public
router.post('/forgot-password', forgotPasswordLimiter, validateForgotPassword, handleValidationErrors, async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email, isActive: true });
    if (!user) {
      return res.status(404).json({
        status: 'fail',
        message: 'There is no user with that email address'
      });
    }

    // Generate password reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // TODO: Send password reset email
    // await sendPasswordResetEmail(user.email, resetToken);

    res.status(200).json({
      status: 'success',
      message: 'Password reset token sent to email!'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'There was an error sending the email. Try again later!'
    });
  }
});

// @route   PATCH /api/auth/reset-password/:token
// @desc    Reset password with token
// @access  Public
router.patch('/reset-password/:token', validateResetPassword, handleValidationErrors, async (req, res) => {
  try {
    // Get user based on the token
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpire: { $gt: Date.now() },
      isActive: true
    });

    if (!user) {
      return res.status(400).json({
        status: 'fail',
        message: 'Token is invalid or has expired'
      });
    }

    // Set new password
    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    await user.save();

    createSendToken(user, 200, res, 'Password reset successfully');
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during password reset'
    });
  }
});

// @route   PATCH /api/auth/update-password
// @desc    Update current user password
// @access  Private
router.patch('/update-password', protect, [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
], handleValidationErrors, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');

    // Check if current password is correct
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        status: 'fail',
        message: 'Your current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    createSendToken(user, 200, res, 'Password updated successfully');
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during password update'
    });
  }
});

// @route   POST /api/auth/verify-email/:token
// @desc    Verify email with token
// @access  Public
router.post('/verify-email/:token', async (req, res) => {
  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpire: { $gt: Date.now() },
      isActive: true
    });

    if (!user) {
      return res.status(400).json({
        status: 'fail',
        message: 'Token is invalid or has expired'
      });
    }

    // Verify email
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpire = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully!'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong during email verification'
    });
  }
});

// @route   POST /api/auth/resend-verification
// @desc    Resend email verification
// @access  Private
router.post('/resend-verification', protect, resendVerificationLimiter, async (req, res) => {
  try {
    if (req.user.isEmailVerified) {
      return res.status(400).json({
        status: 'fail',
        message: 'Email is already verified'
      });
    }

    // Generate new verification token
    const verifyToken = req.user.createEmailVerificationToken();
    await req.user.save({ validateBeforeSave: false });

    // TODO: Send verification email
    // await sendVerificationEmail(req.user.email, verifyToken);

    res.status(200).json({
      status: 'success',
      message: 'Verification email sent!'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong sending verification email'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
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
          bio: req.user.bio
        }
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong fetching user data'
    });
  }
});

// @route   GET /api/auth/profile
// @desc    Get current user profile (alias for /me)
// @access  Private
router.get('/profile', protect, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
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
        bio: req.user.bio
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Something went wrong fetching profile data'
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, [
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
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, username, bio, email } = req.body;

    // Check if username is already taken (if provided)
    if (username && username !== req.user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken'
        });
      }
    }

    // Check if email is already taken (if provided)
    if (email && email !== req.user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already registered'
        });
      }
    }

    // Update user fields
    if (firstName !== undefined) req.user.firstName = firstName;
    if (lastName !== undefined) req.user.lastName = lastName;
    if (username !== undefined) req.user.username = username;
    if (bio !== undefined) req.user.bio = bio;
    if (email !== undefined) {
      req.user.email = email;
      req.user.isEmailVerified = false; // Reset verification if email changes
    }

    await req.user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        username: req.user.username,
        avatar: req.user.avatar,
        bio: req.user.bio
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Something went wrong updating profile'
    });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put('/change-password', protect, [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Check current password
    const isCurrentPasswordCorrect = await req.user.matchPassword(currentPassword);
    if (!isCurrentPasswordCorrect) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    req.user.password = newPassword;
    await req.user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Something went wrong changing password'
    });
  }
});

// @route   PUT /api/auth/avatar
// @desc    Update user avatar
// @access  Private
router.put('/avatar', protect, [
  body('avatar')
    .isString()
    .withMessage('Avatar must be a valid base64 string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { avatar } = req.body;

    // Update avatar
    req.user.avatar = avatar;
    await req.user.save();

    res.status(200).json({
      success: true,
      message: 'Avatar updated successfully',
      data: {
        avatar: req.user.avatar
      }
    });
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({
      success: false,
      message: 'Something went wrong updating avatar'
    });
  }
});

module.exports = router;
