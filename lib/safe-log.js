'use strict';

const ERROR_NAMES = new Set([
  'Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'AbortError', 'TimeoutError',
]);
const ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ETIMEDOUT',
  'ERR_ABORTED', 'ERR_INVALID_URL', 'ABORT_ERR', 'UND_ERR_CONNECT_TIMEOUT',
  'ENOENT', 'EACCES', 'EPERM', 'ENOSPC',
  '08006', '22001', '22003', '22P02', '23502', '23503', '23505', '23514',
  '40001', '40P01', '42501', '42703', '42P01', '57014', '57P01',
  'JOB_LEASE_LOST',
]);

/** Provider and database errors can contain request data, credentials and query values. */
function safeError(error) {
  const details = { name: 'Error' };
  if (error === null || typeof error !== 'object') return details;

  try {
    const { name, code, status, statusCode } = error;
    if (ERROR_NAMES.has(name)) details.name = name;
    if (ERROR_CODES.has(code)) details.code = code;
    const httpStatus = status ?? statusCode;
    if (Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599) {
      details.status = httpStatus;
    }
  } catch {
    // Custom error objects can throw from property getters.
  }
  return details;
}

module.exports = { safeError };
