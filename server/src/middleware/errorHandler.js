function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not found" });
}

// Centralized error handler — AppError carries a statusCode, Zod errors are
// flattened, everything else becomes a 500 with no internal detail leaked.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.name === "ZodError") {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  const status = err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal server error" });
}

module.exports = { notFoundHandler, errorHandler };
