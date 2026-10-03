import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';

/** Render a page with QueryClient, router and English i18n. */
export function renderPage(ui, { route = '/', path = '*' } = {}) {
  try { localStorage.setItem('mwanimlinzi.lang', 'en'); } catch { /* ignore */ }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes><Route path={path} element={ui} /></Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}
