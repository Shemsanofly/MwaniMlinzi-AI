import fs from 'node:fs';
import path from 'node:path';

const appDir = path.join(process.cwd(), 'app');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'api' ? [] : walk(path.join(d, e.name))) : e.name === 'page.jsx' ? [path.join(d, e.name)] : []));
const toUrl = (file) => `/${path.relative(appDir, path.dirname(file)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join('/')}`.replace(/\[(\w+)\]/g, ':$1').replace(/\/$/, '') || '/';

const EXPECTED = [
  '/', '/about', '/how-it-works', '/login', '/register', '/forgot-password', '/reset-password', '/partner', '/app',
  '/farmer', '/farmer/dashboard', '/farmer/farm', '/farmer/risk', '/farmer/observations', '/farmer/harvest', '/farmer/history',
  '/farmer/records', '/farmer/assistant', '/farmer/alerts', '/farmer/settings',
  '/admin', '/admin/dashboard', '/admin/users', '/admin/field', '/admin/farms', '/admin/farms/:id', '/admin/risk-map', '/admin/reviews',
  '/admin/alerts', '/admin/forecast', '/admin/actions', '/admin/models', '/admin/settings', '/admin/audit', '/admin/tokens', '/admin/tma',
  '/admin/impact', '/tools/scenarios', '/account/settings', '/account/notifications',
];

test('App Router pages cover exactly the former React Router paths', () => {
  expect(walk(appDir).map(toUrl).sort()).toEqual([...EXPECTED].sort());
  expect(fs.existsSync(path.join(appDir, 'not-found.jsx'))).toBe(true);
});
