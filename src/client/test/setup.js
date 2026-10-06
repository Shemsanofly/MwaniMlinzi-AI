import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// findBy*/waitFor give up after 1s by default; under CPU load (e.g. alongside the server suite on Windows)
// multi-step flows can need longer. Raising the ceiling only lets slow runs finish — fast runs are unchanged.
configure({ asyncUtilTimeout: 4000 });

vi.mock('next/navigation', () => import('./nextNavigation.jsx'));
vi.mock('next/link', () => import('./nextLink.jsx'));
vi.mock('next/dynamic', () => import('./nextDynamic.jsx'));

afterEach(async () => {
  (await import('./nextNavigation.jsx')).__reset();
  try { sessionStorage.clear(); } catch { /* ignore */ }
});
