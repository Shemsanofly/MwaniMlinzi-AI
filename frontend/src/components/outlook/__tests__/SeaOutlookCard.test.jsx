import { screen } from '@testing-library/react';
import { farmApi } from '../../../api/endpoints.js';
import SeaOutlookCard from '../SeaOutlookCard.jsx';
import { renderPage } from '../../../pages/farmer/__tests__/fixtures.jsx';

vi.mock('../../../api/endpoints.js', () => ({ farmApi: { outlook: vi.fn() } }));

const today = '2026-09-30';
const outlook = (patch = {}) => ({
  fetchedAt: new Date().toISOString(),
  source: 'LIVE',
  providers: { tide: 'open-meteo-marine', rain: 'open-meteo' },
  note: { en: 'Forecast — tide times may differ by about 30 minutes; check the shore before going out.', sw: 'Utabiri — muda wa maji kupwa unaweza kutofautiana.' },
  tides: [{ type: 'LOW', time: `${today}T12:00`, levelM: -1.21, daylight: true, window: { start: `${today}T10:00`, end: `${today}T13:00` } }],
  today: {
    date: today,
    lowTides: [{ type: 'LOW', time: `${today}T12:00`, levelM: -1.21, daylight: true, window: { start: `${today}T10:00`, end: `${today}T13:00` } }],
    nextWorkWindow: { type: 'LOW', time: `${today}T12:00`, levelM: -1.21, daylight: true, window: { start: `${today}T10:00`, end: `${today}T13:00` } },
    drying: { date: today, maxRainProbability: 16, rainMm: 0.2, verdict: 'GOOD', level: 'LOW' },
    advice: { code: 'DRY_LOW_OK', action: 'Good day for drying. Dry seaweed on raised racks or a clean tarpaulin, not on the ground.', actionSw: 'Siku nzuri ya kukausha.' },
  },
  days: [
    { date: today, maxRainProbability: 16, rainMm: 0.2, verdict: 'GOOD', level: 'LOW' },
    { date: '2026-10-01', maxRainProbability: 72, rainMm: 6, verdict: 'BAD', level: 'HIGH' },
    { date: '2026-10-02', maxRainProbability: 40, rainMm: 1.2, verdict: 'CAUTION', level: 'MEDIUM' },
  ],
  ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe('SeaOutlookCard', () => {
  it('shows the next daylight low tide with its work window, today\'s drying verdict with approved advice, the 3-day strip and the source', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook() });
    renderPage(<SeaOutlookCard farmId="f1" />);
    await screen.findAllByTestId('drying-day'); // wait until the forecast has loaded
    const card = screen.getByTestId('sea-outlook');
    expect(card).toHaveTextContent('Today at sea');
    expect(card).toHaveTextContent('Low tide today 12:00');
    expect(card).toHaveTextContent('Best time to work: 10:00–13:00');
    expect(card).toHaveTextContent('Good day for drying');
    expect(card).toHaveTextContent('rain chance 16%');
    expect(card).toHaveTextContent('not on the ground');
    expect(screen.getAllByTestId('drying-day').map((d) => d.textContent)).toEqual([
      expect.stringMatching(/Good/), expect.stringMatching(/Rain likely/), expect.stringMatching(/Some rain/),
    ]);
    expect(card).toHaveTextContent('Live data');
    expect(card).toHaveTextContent('may differ by about 30 minutes');
    expect(farmApi.outlook).toHaveBeenCalledWith('f1');
  });

  it('labels a stored forecast as cached and says when there is no daylight low tide', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook({ source: 'CACHED', today: { ...outlook().today, nextWorkWindow: null } }) });
    renderPage(<SeaOutlookCard farmId="f1" />);
    await screen.findAllByTestId('drying-day'); // wait until the forecast has loaded
    const card = screen.getByTestId('sea-outlook');
    expect(card).toHaveTextContent('Last saved reading');
    expect(card).toHaveTextContent('No daylight low tide in the forecast');
  });

  it('when only the tide part is missing it says the tide forecast is unavailable (not "no low tide")', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook({ tides: [], today: { ...outlook().today, lowTides: [], nextWorkWindow: null } }) });
    renderPage(<SeaOutlookCard farmId="f1" />);
    await screen.findAllByTestId('drying-day');
    const card = screen.getByTestId('sea-outlook');
    expect(card).toHaveTextContent('Tide forecast not available right now');
    expect(card).not.toHaveTextContent('No daylight low tide');
  });

  it('says honestly when there is no forecast (never shows invented values)', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: null });
    renderPage(<SeaOutlookCard farmId="f1" />);
    expect(await screen.findByText('No sea forecast for this farm yet')).toBeInTheDocument();
    expect(screen.queryByTestId('drying-day')).toBeNull();
  });

  it('speaks Kiswahili', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook() });
    renderPage(<SeaOutlookCard farmId="f1" />, { lang: 'sw' });
    await screen.findAllByTestId('drying-day'); // wait until the forecast has loaded
    const card = screen.getByTestId('sea-outlook');
    expect(card).toHaveTextContent('Leo baharini');
    expect(card).toHaveTextContent('Maji kupwa leo 12:00');
    expect(card).toHaveTextContent('Siku nzuri ya kukausha');
  });
});
