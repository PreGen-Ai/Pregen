export function notFound(req, res) {
  res.status(404).json({ message: "Route not found" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error("❌ Error:", err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Server error",
  });
}
