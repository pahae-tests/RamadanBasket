class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function isDuplicateError(error) {
  return Boolean(error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062));
}

module.exports = { HttpError, isDuplicateError };
