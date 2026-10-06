import { Prisma } from '@prisma/client';
import { toErrorResponse, UploadError } from '../../../src/server/http/errors.js';
import { badRequest } from '../../../src/server/utils/errors.js';
import { createContext } from '../../../src/server/http/context.js';

const ctx = createContext(new Request('http://l/api/x'), {});
const body = async (err) => { const r = toErrorResponse(err, ctx); return { status: r.status, json: await r.json() }; };

describe('toErrorResponse', () => {
  test('AppError with details', async () => {
    expect(await body(badRequest('Invalid input', [{ path: 'a', message: 'm' }]))).toEqual({ status: 400, json: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: [{ path: 'a', message: 'm' }] } } });
  });
  test('upload errors', async () => {
    expect(await body(new UploadError('LIMIT_FILE_SIZE'))).toEqual({ status: 400, json: { success: false, error: { code: 'UPLOAD_ERROR', message: 'File is too large' } } });
    expect((await body(new UploadError('LIMIT_FILE_COUNT'))).json.error.message).toBe('Too many files');
  });
  test('prisma P2002 / P2025 / P1001', async () => {
    const known = (code) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '6', meta: { target: 'email' } });
    expect((await body(known('P2002'))).status).toBe(409);
    expect((await body(known('P2025'))).json.error).toEqual({ code: 'NOT_FOUND', message: 'Record not found' });
    expect((await body(known('P1001'))).status).toBe(503);
  });
  test('body parser errors', async () => {
    expect((await body({ type: 'entity.parse.failed' })).json.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Malformed JSON body' });
    expect((await body({ type: 'entity.too.large' })).status).toBe(413);
  });
  test('unknown error → 500 without leaking the message', async () => {
    expect(await body(new Error('SELECT secret'))).toEqual({ status: 500, json: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } } });
  });
});
