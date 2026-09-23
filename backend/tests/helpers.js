import request from 'supertest';
import { createApp } from '../src/app.js';
import { TEST_PASSWORD } from './testDb.js';

export const app = createApp();
export const api = () => request(app);
const tokens = {};

export async function login(role) {
  if (tokens[role]) return tokens[role];
  const res = await api().post('/api/auth/login').send({ email: `${role}@demo.mwanimlinzi.local`, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login ${role} failed: ${JSON.stringify(res.body)}`);
  tokens[role] = res.body.data.token;
  return tokens[role];
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export async function farmByCode(token, code) {
  const res = await api().get(`/api/farms?search=${code}`).set(auth(token));
  return res.body.data.farms.find((f) => f.farmCode === code);
}
