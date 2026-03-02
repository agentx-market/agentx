/**
 * Global error handling middleware for Express
 * Four-parameter middleware: (err, req, res, next)
 */
module.exports = (err, req, res, next) => {
  // Log error with stack trace
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Handle known error types with appropriate status codes
  let statusCode = err.status || err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  let errorMessage = err.message || 'An unexpected error occurred';

  // Validate status code is a valid HTTP status
  if (statusCode < 100 || statusCode > 599) {
    statusCode = 500;
  }

  // Handle validation errors
  if (err.name === 'ValidationError' || (err.message && err.message.includes('validation'))) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errorMessage = 'Invalid input data. Please check your request.';
  }

  // Handle not found errors (already handled by notFound middleware, but as fallback)
  if (statusCode === 404) {
    errorCode = 'NOT_FOUND';
    errorMessage = 'The requested resource was not found.';
  }

  // Handle unauthorized errors
  if (statusCode === 401) {
    errorCode = 'UNAUTHORIZED';
    errorMessage = 'Authentication required. Please log in.';
  }

  // Handle forbidden errors
  if (statusCode === 403) {
    errorCode = 'FORBIDDEN';
    errorMessage = 'You do not have permission to access this resource.';
  }

  // Handle conflict errors
  if (statusCode === 409) {
    errorCode = 'CONFLICT';
    errorMessage = 'The request conflicts with existing data.';
  }

  // Handle too many requests
  if (statusCode === 429) {
    errorCode = 'RATE_LIMITED';
    errorMessage = 'Too many requests. Please try again later.';
  }

  // Production: don't expose error details
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(statusCode).json({
    error: {
      message: isProduction && statusCode === 500 ? 'An internal server error occurred' : errorMessage,
      code: errorCode,
      status: statusCode,
    },
    ...(isProduction === false && statusCode === 500 && {
      debug: {
        stack: err.stack,
        details: err.message,
      },
    }),
  });
};
