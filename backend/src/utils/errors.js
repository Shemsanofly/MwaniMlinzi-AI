export class AppError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError('VALIDATION_ERROR', message, 400, details);
export const unauthorized = (message = 'Authentication required') => new AppError('UNAUTHORIZED', message, 401);
export const forbidden = (message = 'You do not have permission to perform this action') => new AppError('FORBIDDEN', message, 403);
export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`, 404);
export const conflict = (message) => new AppError('CONFLICT', message, 409);
