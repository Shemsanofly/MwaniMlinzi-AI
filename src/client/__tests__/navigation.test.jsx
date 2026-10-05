import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate, useParams, useSearchParams } from '../test/router.jsx';

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}|{JSON.stringify(l.state)}</p>; }

test('Link navigates and NavLink marks the active route', async () => {
  render(
    <MemoryRouter initialEntries={['/farmer/dashboard']}>
      <NavLink to="/farmer/dashboard" className={({ isActive }) => (isActive ? 'on' : 'off')}>Dash</NavLink>
      <NavLink to="/farmer/risk">Risk</NavLink>
      <Link to="/farmer/risk?tab=2" state={{ from: 'x' }}>Go</Link>
      <Where />
    </MemoryRouter>,
  );
  expect(screen.getByText('Dash')).toHaveClass('on');
  expect(screen.getByText('Dash')).toHaveAttribute('aria-current', 'page');
  await userEvent.click(screen.getByText('Go'));
  expect(screen.getByTestId('where')).toHaveTextContent('/farmer/risk?tab=2|{"from":"x"}');
  expect(screen.getByText('Risk')).toHaveClass('active');
});

test('Navigate with state, useParams via Routes, useSearchParams setter', async () => {
  function Detail() {
    const { id } = useParams();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    return (
      <div>
        <p data-testid="id">{id}:{params.get('tab') || 'none'}</p>
        <button onClick={() => setParams({ tab: 'notes' }, { replace: true })}>tab</button>
        <button onClick={() => navigate('/login', { replace: true, state: { from: '/admin/farms/9' } })}>out</button>
      </div>
    );
  }
  render(
    <MemoryRouter initialEntries={['/admin/farms/9']}>
      <Routes>
        <Route path="/admin/farms/:id" element={<Detail />} />
        <Route path="/login" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('id')).toHaveTextContent('9:none');
  await userEvent.click(screen.getByText('tab'));
  expect(screen.getByTestId('id')).toHaveTextContent('9:notes');
  await userEvent.click(screen.getByText('out'));
  expect(screen.getByTestId('where')).toHaveTextContent('/login|{"from":"/admin/farms/9"}');
});

test('Navigate redirects on mount; object entries carry state', () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/old', state: { identifier: 'a@b.c' } }]}>
      <Routes>
        <Route path="/old" element={<Navigate to="/new" replace state={{ keep: 1 }} />} />
        <Route path="/new" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('where')).toHaveTextContent('/new|{"keep":1}');
});
