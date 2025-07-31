const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Airdrop = require('../models/Airdrop');
const { protect } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Validation middleware
const validateTask = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('project')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Project name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('priority')
    .optional()
    .isIn(['Low', 'Medium', 'High'])
    .withMessage('Priority must be Low, Medium, or High'),
  body('category')
    .optional()
    .isIn(['Testnet', 'Mainnet', 'Social', 'DeFi', 'Gaming', 'NFT', 'Bridge', 'Staking'])
    .withMessage('Invalid category'),
  body('difficulty')
    .optional()
    .isIn(['Easy', 'Medium', 'Hard'])
    .withMessage('Difficulty must be Easy, Medium, or Hard'),
  body('estimatedTime')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('Estimated time must be between 1 and 1440 minutes'),
  body('isDaily')
    .optional()
    .isBoolean()
    .withMessage('isDaily must be a boolean'),
  body('completed')
    .optional()
    .isBoolean()
    .withMessage('completed must be a boolean')
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// GET /api/tasks - Get all tasks for the authenticated user
router.get('/', protect, async (req, res) => {
  try {
    const { 
      completed, 
      isDaily, 
      project, 
      category,
      page = 1, 
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const options = {};
    if (completed !== undefined) options.completed = completed === 'true';
    if (isDaily !== undefined) options.isDaily = isDaily === 'true';
    if (project) options.project = project;
    if (category) options.category = category;

    const tasks = await Task.getByUser(req.user.id, options);
    
    // Apply sorting
    const sortDirection = sortOrder === 'asc' ? 1 : -1;
    const sortObj = {};
    sortObj[sortBy] = sortDirection;
    
    const sortedTasks = await Task.find({ user: req.user.id, ...options })
      .populate('airdrop', 'name logoUrl')
      .sort(sortObj)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Task.countDocuments({ user: req.user.id, ...options });

    res.json({
      tasks: sortedTasks,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalTasks: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /api/tasks/today - Get today's tasks
router.get('/today', protect, async (req, res) => {
  try {
    const tasks = await Task.getTodaysTasks(req.user.id);
    
    // Separate daily and other tasks
    const dailyTasks = tasks.filter(task => task.isDaily);
    const otherTasks = tasks.filter(task => !task.isDaily);
    
    // Calculate statistics
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.completed).length;
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.json({
      tasks,
      dailyTasks,
      otherTasks,
      statistics: {
        total: totalTasks,
        completed: completedTasks,
        pending: totalTasks - completedTasks,
        completionPercentage
      }
    });
  } catch (error) {
    console.error('Get today tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s tasks' });
  }
});

// GET /api/tasks/daily - Get daily tasks
router.get('/daily', protect, async (req, res) => {
  try {
    const tasks = await Task.getDailyTasks(req.user.id);
    res.json({ tasks });
  } catch (error) {
    console.error('Get daily tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch daily tasks' });
  }
});

// GET /api/tasks/stats - Get task statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get various counts
    const totalTasks = await Task.countDocuments({ user: userId });
    const completedTasks = await Task.countDocuments({ user: userId, completed: true });
    const pendingTasks = await Task.countDocuments({ user: userId, completed: false });
    const dailyTasks = await Task.countDocuments({ user: userId, isDaily: true });
    const todayCompleted = await Task.countDocuments({ 
      user: userId, 
      completed: true,
      completedAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0))
      }
    });

    // Get tasks by category
    const tasksByCategory = await Task.aggregate([
      { $match: { user: userId } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    // Get tasks by project
    const tasksByProject = await Task.aggregate([
      { $match: { user: userId } },
      { $group: { _id: '$project', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.json({
      total: totalTasks,
      completed: completedTasks,
      pending: pendingTasks,
      daily: dailyTasks,
      todayCompleted,
      completionPercentage,
      tasksByCategory,
      tasksByProject
    });
  } catch (error) {
    console.error('Get task stats error:', error);
    res.status(500).json({ error: 'Failed to fetch task statistics' });
  }
});

// GET /api/tasks/:id - Get a specific task
router.get('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findOne({ 
      _id: req.params.id, 
      user: req.user.id 
    }).populate('airdrop', 'name logoUrl officialLink');

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /api/tasks - Create a new task
router.post('/', protect, validateTask, handleValidationErrors, async (req, res) => {
  try {
    const taskData = {
      ...req.body,
      user: req.user.id
    };

    // If airdrop ID is provided, validate it exists and belongs to user
    if (req.body.airdrop) {
      const airdrop = await Airdrop.findOne({ 
        _id: req.body.airdrop, 
        user: req.user.id 
      });
      
      if (!airdrop) {
        return res.status(400).json({ error: 'Invalid airdrop reference' });
      }
      
      // Auto-populate project name from airdrop if not provided
      if (!taskData.project) {
        taskData.project = airdrop.name;
      }
    }

    const task = new Task(taskData);
    await task.save();
    
    // Populate the airdrop reference before sending response
    await task.populate('airdrop', 'name logoUrl');

    res.status(201).json({ 
      message: 'Task created successfully', 
      task 
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id - Update a task
router.put('/:id', protect, validateTask, handleValidationErrors, async (req, res) => {
  try {
    const task = await Task.findOne({ 
      _id: req.params.id, 
      user: req.user.id 
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // If airdrop ID is being updated, validate it
    if (req.body.airdrop && req.body.airdrop !== task.airdrop?.toString()) {
      const airdrop = await Airdrop.findOne({ 
        _id: req.body.airdrop, 
        user: req.user.id 
      });
      
      if (!airdrop) {
        return res.status(400).json({ error: 'Invalid airdrop reference' });
      }
    }

    // Update task fields
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        task[key] = req.body[key];
      }
    });

    await task.save();
    await task.populate('airdrop', 'name logoUrl');

    res.json({ 
      message: 'Task updated successfully', 
      task 
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// PATCH /api/tasks/:id/toggle - Toggle task completion status
router.patch('/:id/toggle', protect, async (req, res) => {
  try {
    const task = await Task.findOne({ 
      _id: req.params.id, 
      user: req.user.id 
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.completed) {
      await task.markPending();
    } else {
      await task.markCompleted();
    }

    await task.populate('airdrop', 'name logoUrl');

    res.json({ 
      message: `Task marked as ${task.completed ? 'completed' : 'pending'}`, 
      task 
    });
  } catch (error) {
    console.error('Toggle task error:', error);
    res.status(500).json({ error: 'Failed to toggle task status' });
  }
});

// DELETE /api/tasks/:id - Delete a task
router.delete('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ 
      _id: req.params.id, 
      user: req.user.id 
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// POST /api/tasks/bulk - Create multiple tasks
router.post('/bulk', protect, async (req, res) => {
  try {
    const { tasks } = req.body;
    
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Tasks array is required' });
    }

    // Validate each task and add user ID
    const tasksToCreate = tasks.map(task => ({
      ...task,
      user: req.user.id
    }));

    // Validate airdrop references if provided
    for (let taskData of tasksToCreate) {
      if (taskData.airdrop) {
        const airdrop = await Airdrop.findOne({ 
          _id: taskData.airdrop, 
          user: req.user.id 
        });
        
        if (!airdrop) {
          return res.status(400).json({ 
            error: `Invalid airdrop reference: ${taskData.airdrop}` 
          });
        }
      }
    }

    const createdTasks = await Task.insertMany(tasksToCreate);
    
    // Populate airdrop references
    const populatedTasks = await Task.find({ 
      _id: { $in: createdTasks.map(t => t._id) } 
    }).populate('airdrop', 'name logoUrl');

    res.status(201).json({ 
      message: `${createdTasks.length} tasks created successfully`, 
      tasks: populatedTasks 
    });
  } catch (error) {
    console.error('Bulk create tasks error:', error);
    res.status(500).json({ error: 'Failed to create tasks' });
  }
});

module.exports = router;
