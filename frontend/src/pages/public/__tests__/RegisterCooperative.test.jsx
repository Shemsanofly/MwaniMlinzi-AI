import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../../../i18n/I18nProvider.jsx';
import { metaApi } from '../../../api/endpoints.js';
import Register from '../Register.jsx';

vi.mock('../../../api/endpoints.js', () => ({ metaApi: { publicCooperatives: vi.fn() } }));
vi.mock('../../../stores/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({ register: vi.fn() }),
}));

function renderRegister() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/register']}>
        <I18nProvider><Register /></I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Register — cooperative field', () => {
  beforeEach(() => localStorage.setItem('mwanimlinzi.lang', 'en'));

  test('is hidden on a fresh system with no cooperatives', async () => {
    metaApi.publicCooperatives.mockResolvedValue({ cooperatives: [] });
    renderRegister();
    await vi.waitFor(() => expect(metaApi.publicCooperatives).toHaveBeenCalled());
    await vi.waitFor(() => expect(document.getElementById('reg-coop')).toBeNull());
    expect(screen.getByLabelText(/Village/)).toBeInTheDocument();
  });

  test('is shown when cooperatives exist', async () => {
    metaApi.publicCooperatives.mockResolvedValue({ cooperatives: [{ code: 'PAJE', name: 'Paje Cooperative', district: 'Kusini' }] });
    renderRegister();
    expect(await screen.findByRole('option', { name: 'Paje Cooperative (Kusini)' })).toBeInTheDocument();
  });
});
