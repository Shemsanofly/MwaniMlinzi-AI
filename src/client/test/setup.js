import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

vi.mock('next/navigation', () => import('./nextNavigation.jsx'));
vi.mock('next/link', () => import('./nextLink.jsx'));
vi.mock('next/dynamic', () => import('./nextDynamic.jsx'));

afterEach(async () => {
  (await import('./nextNavigation.jsx')).__reset();
  try { sessionStorage.clear(); } catch { /* ignore */ }
});
