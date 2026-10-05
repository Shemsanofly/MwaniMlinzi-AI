import fs from 'node:fs';
import path from 'node:path';
import { ROUTES, matchRoute, patternToDir } from '../../../src/server/http/routeTable.js';

const apiDir = path.join(process.cwd(), 'app', 'api');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === 'route.js' ? [path.join(d, e.name)] : []));
const HAND_WRITTEN = new Set(['', '[...notFound]', 'docs', 'docs/[asset]', 'docs.json']);

describe('route table', () => {
  test('has the 114 Express endpoints', () => { expect(ROUTES).toHaveLength(114); });

  test('no duplicate method+pattern', () => {
    const keys = ROUTES.map((r) => `${r.method} ${r.pattern}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every pattern has exactly one generated route file and vice versa', () => {
    const fromTable = new Set(ROUTES.map((r) => patternToDir(r.pattern)));
    const onDisk = new Set(walk(apiDir).map((f) => path.relative(apiDir, path.dirname(f)).split(path.sep).join('/')).filter((d) => !HAND_WRITTEN.has(d)));
    expect([...onDisk].sort()).toEqual([...fromTable].sort());
    for (const dir of fromTable) {
      const src = fs.readFileSync(path.join(apiDir, dir, 'route.js'), 'utf8');
      const pattern = ROUTES.find((r) => patternToDir(r.pattern) === dir).pattern;
      expect(src).toContain(`handlersFor('${pattern}')`);
    }
  });

  test('static segments win over dynamic ones', () => {
    expect(matchRoute('/api/farms/predictions/abc')).toEqual({ pattern: '/farms/predictions/:predictionId', params: { predictionId: 'abc' } });
    expect(matchRoute('/api/farms/f1')).toEqual({ pattern: '/farms/:id', params: { id: 'f1' } });
    expect(matchRoute('/api/cooperatives/mine/dashboard').pattern).toBe('/cooperatives/mine/dashboard');
    expect(matchRoute('/api/notifications/read-all').pattern).toBe('/notifications/read-all');
    expect(matchRoute('/api/ussd/MwaniMlinzi').pattern).toBe('/ussd/MwaniMlinzi');
    expect(matchRoute('/api/nope/at/all')).toBeNull();
  });
});
