import { createContext } from './context.js';
import { createResponder, toResponse } from './responder.js';
import { parseBody } from './body.js';
import { toErrorResponse } from './errors.js';
import { applyCors, applySecurityHeaders } from './headers.js';
import { logRequest } from './log.js';

/**
 * Next Route Handler that reproduces the Express pipeline:
 * body parsers → route steps (limiters, authenticate, authorize, validate, upload) → controller(req, res) → error handler.
 */
export function defineRoute(steps, controller) {
  return async function routeHandler(request, context = {}) {
    const started = performance.now();
    const ctx = createContext(request, (await context.params) || {});
    let response;
    try {
      await parseBody(ctx);
      for (const step of steps) {
        const early = await step(ctx);
        if (early instanceof Response) { response = early; break; }
      }
      if (!response) {
        const res = createResponder();
        const returned = await controller(ctx, res);
        response = returned instanceof Response ? returned : await toResponse(res);
      }
    } catch (err) {
      response = toErrorResponse(err, ctx);
    }
    for (const [k, v] of ctx.responseHeaders) if (!response.headers.has(k)) response.headers.set(k, v);
    applyCors(request, response.headers);
    applySecurityHeaders(response.headers);
    logRequest(ctx, response, started);
    return response;
  };
}
