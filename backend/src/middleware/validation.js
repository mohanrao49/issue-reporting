const { body, param, query, validationResult } = require('express-validator');

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    console.log('Request body:', req.body);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// User validation rules
const validateUserRegistration = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  
  body('aadhaarNumber')
    .matches(/^[0-9]{12}$/)
    .withMessage('Please provide a valid 12-digit Aadhaar number'),
  
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('mobile')
    .matches(/^[0-9]{10}$/)
    .withMessage('Please provide a valid 10-digit mobile number'),
  
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  body('address')
    .optional()
    .isString()
    .isLength({ max: 300 })
    .withMessage('Address cannot exceed 300 characters'),
  
  handleValidationErrors
];

const validateUserLogin = [
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('mobile')
    .optional()
    .isMobilePhone('en-IN')
    .withMessage('Please provide a valid Indian mobile number'),
  
  body('password')
    .optional()
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

const validateOTPRequest = [
  body('aadhaarNumber')
    .optional()
    .matches(/^[0-9]{12}$/)
    .withMessage('Please provide a valid 12-digit Aadhaar number'),
  
  body('mobile')
    .optional()
    .isMobilePhone('en-IN')
    .withMessage('Please provide a valid Indian mobile number'),
  
  body().custom((body) => {
    if (!body.aadhaarNumber && !body.mobile) {
      throw new Error('Aadhaar number or mobile number is required');
    }
    return true;
  }),
  
  handleValidationErrors
];

const validateOTPVerification = [
  body('aadhaarNumber')
    .optional()
    .matches(/^[0-9]{12}$/)
    .withMessage('Please provide a valid 12-digit Aadhaar number'),
  
  body('mobile')
    .optional()
    .isLength({ min: 10, max: 15 })
    .withMessage('Please provide a valid mobile number'),
  
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email'),
  
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers'),
  
  handleValidationErrors
];

// Issue validation rules
const validateIssueCreation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Issue title is required')
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Issue description is required')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  
  body('category')
    .optional() // Category is auto-detected by ML backend, not required from frontend
    .isIn([
      'Road & Traffic',
      'Water & Drainage',
      'Electricity',
      'Garbage & Sanitation',
      'Street Lighting',
      'Public Safety',
      'Parks & Recreation',
      'Other'
    ])
    .withMessage('Invalid category selected'),
  
  body('location.name')
    .trim()
    .notEmpty()
    .withMessage('Location name is required'),
  
  body('location.coordinates.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude value'),
  
  body('location.coordinates.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude value'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level'),
  
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  
  handleValidationErrors
];

const validateIssueUpdate = [
  body('status')
    .optional()
    .isIn(['reported', 'in-progress', 'resolved', 'closed'])
    .withMessage('Invalid status value'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority value'),
  
  body('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned user ID'),
  
  handleValidationErrors
];

// Comment validation rules
const validateCommentCreation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment must be between 1 and 1000 characters'),
  
  body('isInternal')
    .optional()
    .isBoolean()
    .withMessage('isInternal must be a boolean value'),
  
  handleValidationErrors
];

// Parameter validation
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} ID`),
  
  handleValidationErrors
];

// Query validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

const validateIssueFilters = [
  query('status')
    .optional()
    .isIn(['reported', 'in-progress', 'resolved', 'closed'])
    .withMessage('Invalid status filter'),
  
  query('category')
    .optional()
    .isIn([
      'Road & Traffic',
      'Water & Drainage',
      'Electricity',
      'Garbage & Sanitation',
      'Street Lighting',
      'Public Safety',
      'Parks & Recreation',
      'Other'
    ])
    .withMessage('Invalid category filter'),
  
  query('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority filter'),
  
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'upvotes', 'priority'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  
  handleValidationErrors
];

// File upload validation
const validateFileUpload = [
  body('type')
    .isIn(['image', 'document'])
    .withMessage('File type must be image or document'),
  
  body('caption')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Caption cannot exceed 200 characters'),
  
  handleValidationErrors
];

// Admin validation
const validateAdminAssignment = [
  body('assignedTo')
    .optional()
    .custom((value) => {
      // Allow null/empty values for auto-assignment
      if (value === null || value === '' || value === undefined) {
        return true;
      }
      // For manual assignment, accept either:
      // 1. Employee ID (custom string like "gar", "gar1")
      // 2. MongoDB Object ID (24-character hex string)
      if (typeof value !== 'string') {
        throw new Error('Employee ID must be a string');
      }
      return true;
    }),
  
  body('reason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters'),
  
  handleValidationErrors
];

// Feedback validation
const validateFeedback = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  
  body('comment')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Feedback comment cannot exceed 500 characters'),
  
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateOTPRequest,
  validateOTPVerification,
  validateIssueCreation,
  validateIssueUpdate,
  validateCommentCreation,
  validateObjectId,
  validatePagination,
  validateIssueFilters,
  validateFileUpload,
  validateAdminAssignment,
  validateFeedback
};
