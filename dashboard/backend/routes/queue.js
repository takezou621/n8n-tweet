/**
 * Content Queue Routes
 * Handles content queue management operations
 */

const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { asyncHandler, createValidationError, createNotFoundError } = require('../middleware/error-handler');
const ContentQueue = require('../models/ContentQueue');

// Validation schemas
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('created_at', 'relevance_score', 'title').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const filtersSchema = Joi.object({
  category: Joi.string().max(100),
  sourceFeed: Joi.string().max(255),
  minRelevanceScore: Joi.number().min(0).max(5),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso().greater(Joi.ref('dateFrom'))
});

const approvalSchema = Joi.object({
  scheduledFor: Joi.date().iso().greater('now').optional()
});

const rejectionSchema = Joi.object({
  reason: Joi.string().required().min(1).max(500)
});

const editSchema = Joi.object({
  tweetContent: Joi.string().required().min(1).max(280)
});

// GET /api/queue/pending - Get pending tweets with pagination and filtering
router.get('/pending', asyncHandler(async (req, res) => {
  // Validate query parameters
  const { error: paginationError, value: pagination } = paginationSchema.validate(req.query);
  if (paginationError) {
    throw createValidationError('Invalid pagination parameters', paginationError.details);
  }

  const { error: filtersError, value: filters } = filtersSchema.validate(req.query);
  if (filtersError) {
    throw createValidationError('Invalid filter parameters', filtersError.details);
  }

  const { page, limit, sortBy, sortOrder } = pagination;
  const offset = (page - 1) * limit;

  // Get pending content with filters
  const content = await ContentQueue.findPending(filters, limit, offset);
  const totalCount = await ContentQueue.countByStatus('pending');
  const totalPages = Math.ceil(totalCount / limit);

  // Get status counts for dashboard summary
  const statusCounts = await ContentQueue.getStatusCounts();

  res.json({
    success: true,
    data: {
      content: content.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        url: item.url,
        sourceFeed: item.sourceFeed,
        category: item.category,
        relevanceScore: item.relevanceScore,
        generatedTweet: item.generatedTweet,
        hashtags: item.hashtags,
        status: item.status,
        createdAt: item.createdAt,
        ageInHours: item.getAgeInHours(),
        isModified: item.isModified(),
        finalTweet: item.getFinalTweet()
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      summary: statusCounts,
      filters: filters
    }
  });
}));

// GET /api/queue/stats - Get queue statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const statusCounts = await ContentQueue.getStatusCounts();
  
  res.json({
    success: true,
    data: {
      statusCounts,
      total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
      pendingPercentage: statusCounts.total > 0 ? 
        Math.round((statusCounts.pending / statusCounts.total) * 100) : 0
    }
  });
}));

// GET /api/queue/:id - Get specific queue item
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid queue item ID');
  }

  const item = await ContentQueue.findById(id);
  
  res.json({
    success: true,
    data: {
      id: item.id,
      title: item.title,
      description: item.description,
      url: item.url,
      sourceFeed: item.sourceFeed,
      category: item.category,
      relevanceScore: item.relevanceScore,
      generatedTweet: item.generatedTweet,
      hashtags: item.hashtags,
      status: item.status,
      rejectionReason: item.rejectionReason,
      editedTweet: item.editedTweet,
      originalTweet: item.originalTweet,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      approvedAt: item.approvedAt,
      approvedBy: item.approvedBy,
      scheduledFor: item.scheduledFor,
      postedAt: item.postedAt,
      tweetId: item.tweetId,
      ageInHours: item.getAgeInHours(),
      isModified: item.isModified(),
      finalTweet: item.getFinalTweet()
    }
  });
}));

// POST /api/queue/:id/approve - Approve content for posting
router.post('/:id/approve', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid queue item ID');
  }

  // Validate request body
  const { error, value } = approvalSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid approval data', error.details);
  }

  const item = await ContentQueue.findById(id);
  
  if (item.status !== 'pending') {
    throw createValidationError(`Cannot approve item with status: ${item.status}`);
  }

  // Set scheduled time if provided
  if (value.scheduledFor) {
    item.scheduledFor = value.scheduledFor;
  }

  await item.approve(req.user.id);

  res.json({
    success: true,
    message: 'Content approved successfully',
    data: {
      id: item.id,
      status: item.status,
      approvedAt: item.approvedAt,
      approvedBy: item.approvedBy,
      scheduledFor: item.scheduledFor,
      finalTweet: item.getFinalTweet()
    }
  });
}));

// POST /api/queue/:id/reject - Reject content
router.post('/:id/reject', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid queue item ID');
  }

  // Validate request body
  const { error, value } = rejectionSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid rejection data', error.details);
  }

  const item = await ContentQueue.findById(id);
  
  if (item.status !== 'pending') {
    throw createValidationError(`Cannot reject item with status: ${item.status}`);
  }

  await item.reject(value.reason, req.user.id);

  res.json({
    success: true,
    message: 'Content rejected successfully',
    data: {
      id: item.id,
      status: item.status,
      rejectionReason: item.rejectionReason,
      approvedBy: item.approvedBy
    }
  });
}));

// PUT /api/queue/:id/edit - Edit tweet content
router.put('/:id/edit', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid queue item ID');
  }

  // Validate request body
  const { error, value } = editSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid edit data', error.details);
  }

  const item = await ContentQueue.findById(id);
  
  if (item.status !== 'pending') {
    throw createValidationError(`Cannot edit item with status: ${item.status}`);
  }

  await item.edit(value.tweetContent);

  res.json({
    success: true,
    message: 'Tweet content updated successfully',
    data: {
      id: item.id,
      originalTweet: item.originalTweet,
      editedTweet: item.editedTweet,
      finalTweet: item.getFinalTweet(),
      length: item.getFinalTweet().length,
      isModified: item.isModified()
    }
  });
}));

// POST /api/queue/:id/reset - Reset tweet to original content
router.post('/:id/reset', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid queue item ID');
  }

  const item = await ContentQueue.findById(id);
  
  if (item.status !== 'pending') {
    throw createValidationError(`Cannot reset item with status: ${item.status}`);
  }

  if (!item.isModified()) {
    throw createValidationError('Item has not been modified');
  }

  // Reset to original tweet
  item.editedTweet = null;
  item.generatedTweet = item.originalTweet || item.generatedTweet;
  await item.save();

  res.json({
    success: true,
    message: 'Tweet content reset to original',
    data: {
      id: item.id,
      finalTweet: item.getFinalTweet(),
      isModified: item.isModified()
    }
  });
}));

// DELETE /api/queue/:id - Delete queue item
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || id < 1) {
    throw createValidationError('Invalid queue item ID');
  }

  const item = await ContentQueue.findById(id);
  
  if (item.status === 'posted') {
    throw createValidationError('Cannot delete posted content');
  }

  await item.delete();

  res.json({
    success: true,
    message: 'Queue item deleted successfully',
    data: { id }
  });
}));

// POST /api/queue - Add new content to queue (for testing/manual addition)
router.post('/', asyncHandler(async (req, res) => {
  const createSchema = Joi.object({
    title: Joi.string().required().min(1).max(500),
    description: Joi.string().max(2000),
    url: Joi.string().uri(),
    sourceFeed: Joi.string().required().max(255),
    category: Joi.string().required().max(100),
    generatedTweet: Joi.string().required().min(1).max(280),
    hashtags: Joi.array().items(Joi.string()).default([]),
    relevanceScore: Joi.number().min(0).max(5).default(0)
  });

  const { error, value } = createSchema.validate(req.body);
  if (error) {
    throw createValidationError('Invalid content data', error.details);
  }

  const item = await ContentQueue.create(value);

  res.status(201).json({
    success: true,
    message: 'Content added to queue successfully',
    data: {
      id: item.id,
      title: item.title,
      generatedTweet: item.generatedTweet,
      status: item.status,
      createdAt: item.createdAt
    }
  });
}));

module.exports = router;