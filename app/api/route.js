import { defineRoute } from '../../src/server/http/defineRoute.js';
import { handlersFor } from '../../src/server/http/routeTable.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fallback = handlersFor('/__none__');
/** Former Express `GET /` banner (that origin no longer exists separately; `/` is now the landing page). */
export const GET = defineRoute([], (_req, res) => res.json({ success: true, data: { name: 'MwaniMlinzi AI API', docs: '/api/docs', health: '/api/health' }, message: 'Know the risk. Know the next action.' }));
export const POST = fallback.POST;
export const PUT = fallback.PUT;
export const PATCH = fallback.PATCH;
export const DELETE = fallback.DELETE;
export const OPTIONS = fallback.OPTIONS;
