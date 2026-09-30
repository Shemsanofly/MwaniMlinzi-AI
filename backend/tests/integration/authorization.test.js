import { api, auth, login, farmByCode } from '../helpers.js';
import prisma from '../../src/config/prisma.js';

afterAll(() => prisma.$disconnect());

describe('role-based access control', () => {
  let farmer; let admin;
  beforeAll(async () => {
    [farmer, admin] = await Promise.all(['farmer', 'admin'].map(login));
  });

  test('farmer only sees own farms', async () => {
    const res = await api().get('/api/farms').set(auth(farmer));
    expect(res.status).toBe(200);
    const codes = res.body.data.farms.map((f) => f.farmCode);
    expect(codes).toEqual(expect.arrayContaining(['FARM001', 'FARM002']));
    expect(codes).not.toContain('FARM003');
    expect(new Set(res.body.data.farms.map((f) => f.farmer.farmerCode))).toEqual(new Set(['FMR-0001']));
  });

  test('farmer cannot read or write another farmer’s farm', async () => {
    const other = await farmByCode(admin, 'FARM003');
    expect((await api().get(`/api/farms/${other.id}`).set(auth(farmer))).status).toBe(403);
    expect((await api().post(`/api/farms/${other.id}/observations`).set(auth(farmer)).send({ cropCondition: 'GOOD' })).status).toBe(403);
  });

  test('buyer endpoints are not part of the active product', async () => {
    expect((await api().get('/api/buyers').set(auth(admin))).status).toBe(404);
    expect((await api().get('/api/buyers/forecast').set(auth(admin))).status).toBe(404);
    expect((await api().post('/api/buyers/demand').set(auth(admin)).send({ quantityKg: 100, neededBy: new Date().toISOString() })).status).toBe(404);
  });

  test('admin endpoints require ADMIN', async () => {
    expect((await api().get('/api/admin/users').set(auth(farmer))).status).toBe(403);
    expect((await api().get('/api/admin/users').set(auth(admin))).status).toBe(200);
  });

  test('only admin can validate actions and review observations', async () => {
    const actions = await api().get('/api/actions').set(auth(admin));
    const id = actions.body.data.actions[0].id;
    expect((await api().post(`/api/actions/${id}/validate`).set(auth(farmer)).send({ validated: true })).status).toBe(403);
    const ok = await api().post(`/api/actions/${id}/validate`).set(auth(admin)).send({ validated: true, note: 'Reviewed with local officers' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.action.validated).toBe(true);
  });

  test('admin cannot assign dormant roles', async () => {
    const res = await api().post('/api/admin/users').set(auth(admin)).send({
      email: 'legacy-role@example.com',
      password: 'Passw0rd!x',
      fullName: 'Legacy Role',
      roles: ['BUYER'],
    });
    expect(res.status).toBe(400);
  });

  test('invalid ids return 404 not 500', async () => {
    expect((await api().get('/api/farms/not-a-uuid').set(auth(admin))).status).toBe(404);
    expect((await api().get('/api/farms/00000000-0000-4000-8000-000000000000').set(auth(admin))).status).toBe(404);
  });
});

describe('partial updates', () => {
  test('PATCH only changes the fields that were sent', async () => {
    const admin = await login('admin');
    const farm = await farmByCode(admin, 'FARM004');
    const before = (await api().get(`/api/farms/${farm.id}`).set(auth(admin))).body.data.farm;
    const res = await api().patch(`/api/farms/${farm.id}`).set(auth(admin)).send({ notes: 'updated note' });
    expect(res.status).toBe(200);
    expect(res.body.data.farm.notes).toBe('updated note');
    expect(res.body.data.farm.lineCount).toBe(before.lineCount);
    expect(res.body.data.farm.exposure).toBe(before.exposure);
    const actions = (await api().get('/api/actions').set(auth(admin))).body.data.actions;
    const a = actions.find((x) => x.urgency !== 'ROUTINE');
    const upd = await api().patch(`/api/actions/${a.id}`).set(auth(admin)).send({ enabled: true });
    expect(upd.body.data.action.urgency).toBe(a.urgency);
    expect(upd.body.data.action.urgencyHours).toBe(a.urgencyHours);
  });
});
