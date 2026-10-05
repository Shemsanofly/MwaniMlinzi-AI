import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

const UPLOAD_MESSAGES = { LIMIT_FILE_SIZE: 'File is too large', LIMIT_FILE_COUNT: 'Too many files', LIMIT_UNEXPECTED_FILE: 'Unexpected field' };
/** Replaces multer.MulterError: same codes and messages. */
export class UploadError extends Error {
  constructor(code) { super(UPLOAD_MESSAGES[code] || code); this.code = code; }
}

const errorBody = (status, code, message, details) => Response.json({ success: false, error: { code, message, ...(details ? { details } : {}) } }, { status });

export const notFoundResponse = (ctx) => errorBody(404, 'NOT_FOUND', `Route ${ctx.method} ${ctx.originalUrl} not found`);

export function toErrorResponse(err, ctx) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof UploadError) {
    status = 400; code = 'UPLOAD_ERROR'; message = err.message;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') { status = 409; code = 'CONFLICT'; message = `A record with this ${err.meta?.target || 'value'} already exists`; }
    else if (err.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; }
    else if (err.code === 'P2023') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; } // malformed id
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

  if (status >= 500 && !env.isTest) console.error('[error]', ctx?.method, ctx?.originalUrl, err);
  // Never leak stack traces, SQL or secrets to clients.
  return errorBody(status, code, message, details);
}
