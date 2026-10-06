import { render, screen } from '@testing-library/react';
import FarmMap from '../FarmMap.jsx';
import LocationPicker from '../LocationPicker.jsx';

// Keep the Leaflet bundle out of jsdom: every dynamic map stays in its loading state.
vi.mock('next/dynamic', () => ({ default: (_load, { loading: Loading }) => function StillLoading() { return <Loading />; } }));

const box = () => screen.getByTestId('map-placeholder').parentElement;

describe('map wrappers reserve the height the map will use', () => {
  test.each([
    [240, '240px'],
    [360, '360px'],
    [420, '420px'],
    ['clamp(240px, 60dvh, 640px)', 'clamp(240px, 60dvh, 640px)'],
  ])('FarmMap height=%s', (height, css) => {
    render(<FarmMap farms={[]} height={height} />);
    expect(box().style.minHeight).toBe(css);
  });

  test('FarmMap uses the same default height as FarmMap.client.jsx (480)', () => {
    render(<FarmMap farms={[]} />);
    expect(box().style.minHeight).toBe('480px');
  });

  test('LocationPicker uses its height prop, default 260 as in LocationPicker.client.jsx', () => {
    const { unmount } = render(<LocationPicker onPick={() => {}} />);
    expect(box().style.minHeight).toBe('260px');
    unmount();
    render(<LocationPicker onPick={() => {}} height={320} />);
    expect(box().style.minHeight).toBe('320px');
  });

  test('both wrappers share one placeholder that fills the reserved box', () => {
    render(<><FarmMap farms={[]} height={240} /><LocationPicker onPick={() => {}} /></>);
    const placeholders = screen.getAllByTestId('map-placeholder');
    expect(placeholders).toHaveLength(2);
    placeholders.forEach((p) => {
      expect(p).toHaveAttribute('aria-hidden', 'true');
      expect(p.className).toBe(placeholders[0].className);
      expect(p.className).toContain('flex-1');
    });
  });
});
