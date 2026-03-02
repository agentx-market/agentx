/**
 * 404 Not Found middleware
 * Catch-all route for undefined endpoints
 */
module.exports = (req, res) => {
  res.status(404).json({
    error: {
      message: `Cannot ${req.method} ${req.path}`,
      code: 'NOT_FOUND',
      status: 404,
    },
  });
};
