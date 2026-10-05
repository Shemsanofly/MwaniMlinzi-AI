import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from '../../test/router.jsx';
import AppLayout from '../AppLayout.jsx';
import FarmerLayout from '../FarmerLayout.jsx';
import { Table } from '../../components/ui/index.jsx';

vi.mock('../../stores/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { fullName: 'Test farmer', roles: ['ADMIN', 'FARMER'] },
    logout: vi.fn(), isAuthenticated: true, refresh: vi.fn(),
  }),
}));
vi.mock('../../i18n/I18nProvider.jsx', () => ({
  useI18n: () => ({ t: (key) => key, lang: 'en', setLang: vi.fn() }),
}));
vi.mock('../../components/notifications.jsx', () => ({
  useNotifications: () => ({ notifications: [], unread: 0, readAll: { mutate: vi.fn() }, readOne: { mutate: vi.fn() } }),
  NotificationItem: () => null,
}));

let width;
let media;
const matches = (query) => query.includes('min-width') ? width >= 1024 : width < 640;
function resize(next) {
  act(() => {
    width = next;
    for (const m of media.values()) {
      m.matches = matches(m.media);
      for (const listener of m.listeners) listener({ matches: m.matches });
    }
  });
}

beforeEach(() => {
  width = 390;
  media = new Map();
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', (query) => {
    if (!media.has(query)) {
      const listeners = new Set();
      media.set(query, {
        media: query, matches: matches(query), listeners,
        addEventListener: (_event, listener) => listeners.add(listener),
        removeEventListener: (_event, listener) => listeners.delete(listener),
      });
    }
    return media.get(query);
  });
});
afterEach(() => vi.unstubAllGlobals());

test('staff navigation closes and restores scrolling when a phone becomes a desktop', async () => {
  render(<MemoryRouter><AppLayout /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'a11y.openMenu' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  resize(1440);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body.style.overflow).toBe('');
});

test('farmer bottom navigation and More menu remain usable when a phone becomes a desktop', async () => {
  render(<MemoryRouter initialEntries={['/farmer/dashboard']}><FarmerLayout /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: 'nav.more' }));
  expect(screen.getByRole('dialog', { name: 'nav.more' })).toBeInTheDocument();
  expect(document.body.style.overflow).toBe('hidden');
  resize(1440);
  expect(screen.getByRole('navigation', { name: 'a11y.farmerNav' })).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'nav.more' })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('');
});

test('table records stay available when resizing from phone cards to a tablet table', () => {
  render(<Table columns={[{ key: 'name', header: 'Farm' }, { key: 'amount', header: 'Harvest' }]} rows={[{ id: 'farm-1', name: 'Seaweed farm', amount: '250 kg' }]} />);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByText('Seaweed farm')).toBeInTheDocument();
  expect(screen.getByText('250 kg')).toBeInTheDocument();
  resize(768);
  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Seaweed farm' })).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: '250 kg' })).toBeInTheDocument();
  resize(390);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByText('250 kg')).toBeInTheDocument();
});
