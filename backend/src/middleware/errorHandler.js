import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` } });
}

 
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof multer.MulterError) {
    status = 400;
    code = 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') { status = 409; code = 'CONFLICT'; message = `A record with this ${err.meta?.target || 'value'} already exists`; }
    else if (err.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; }
    else if (err.code === 'P2003') { status = 400; code = 'VALIDATION_ERROR'; message = 'Related record does not exist'; }
    else if (['P1001', 'P1002', 'P1017'].includes(err.code)) { status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'Database is unavailable. Please try again shortly.'; }
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'Database is unavailable. Check DATABASE_URL and that PostgreSQL is running.';
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid data';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body too large';
  }

  if (status >= 500 && !env.isTest) console.error('[error]', req.method, req.originalUrl, err);

  // Never leak stack traces, SQL or secrets to clients.
  res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
}
