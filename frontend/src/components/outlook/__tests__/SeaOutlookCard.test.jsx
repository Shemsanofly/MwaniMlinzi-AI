import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { farmApi } from '../../../api/endpoints.js';
import SeaOutlookCard from '../SeaOutlookCard.jsx';
import { renderPage } from '../../../pages/farmer/__tests__/fixtures.jsx';

vi.mock('../../../api/endpoints.js', () => ({ farmApi: { outlook: vi.fn() } }));

const today = '2026-09-30';
const outlook = (patch = {}) => ({
  fetchedAt: new Date().toISOString(),
  source: 'LIVE',
  providers: { tide: 'open-meteo-marine', rain: 'open-meteo' },
  note: { en: 'Forecasts can differ from conditions at your farm. Tide times are estimated from hourly sea levels; check the shore before going out.', sw: 'Utabiri unaweza kutofautiana na hali shambani.' },
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
  it('keeps dry current API weather separate from a high rain forecast', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook({ current: { provider: 'open-meteo', observedAt: new Date().toISOString(), precipitationMm: 0, intervalMinutes: 15, temperatureC: 27 }, today: { ...outlook().today, drying: { verdict: 'BAD', maxRainProbability: 86, windowStart: `${today}T13:00`, windowEnd: `${today}T18:00`, rainMm: 0.6 } } }) });
    renderPage(<SeaOutlookCard farmId="f1" />);
    const now = await screen.findByTestId('weather-now');
    expect(now).toHaveTextContent('No rain indicated by the weather model');
    expect(now).toHaveTextContent('0 mm over the preceding 15 minutes');
    expect(now).not.toHaveTextContent('86%');
    expect(screen.getByTestId('sea-outlook')).toHaveTextContent('peak hourly rain chance 86%');
    expect(screen.getByTestId('sea-outlook')).toHaveTextContent('Forecast for 13:00–18:00');
  });

  it('does not reuse a past drying day or invent current weather', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook({ current: null, today: { ...outlook().today, drying: null, advice: null, dryingDayEnded: true } }) });
    renderPage(<SeaOutlookCard farmId="f1" />);
    const now = await screen.findByTestId('weather-now');
    expect(now).toHaveTextContent('Current weather is unavailable');
    expect(screen.getByTestId('sea-outlook')).toHaveTextContent("Today's drying hours have ended");
    expect(within(screen.getByTestId('sea-outlook')).queryByText('Good day for drying.')).toBeNull();
  });
  it('shows the next daylight low tide with its work window, today\'s drying verdict with approved advice, the 3-day strip and the source', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook() });
    renderPage(<SeaOutlookCard farmId="f1" />);
    await screen.findAllByTestId('drying-day'); // wait until the forecast has loaded
    const card = screen.getByTestId('sea-outlook');
    expect(card).toHaveTextContent('Today at sea');
    expect(card).toHaveTextContent('Estimated low tide today 12:00');
    expect(card).toHaveTextContent('Estimated low-water window: 10:00–13:00');
    expect(card).toHaveTextContent('Low forecast rain risk');
    expect(card).toHaveTextContent('peak hourly rain chance 16%');
    expect(card).toHaveTextContent('not on the ground');
    expect(screen.getAllByTestId('drying-day').map((d) => d.textContent)).toEqual([
      expect.stringMatching(/Low rain risk/), expect.stringMatching(/High rain risk/), expect.stringMatching(/Rain possible/),
    ]);
    expect(card).toHaveTextContent('Forecast');
    expect(card).toHaveTextContent('estimated from hourly sea levels');
    expect(farmApi.outlook).toHaveBeenCalledWith('f1');
  });

  it('labels a stored forecast as cached and says when there is no daylight low tide', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook({ source: 'CACHED', today: { ...outlook().today, nextWorkWindow: null } }) });
    renderPage(<SeaOutlookCard farmId="f1" />);
    await screen.findAllByTestId('drying-day'); // wait until the forecast has loaded
    const card = screen.getByTestId('sea-outlook');
    expect(card).toHaveTextContent('Saved forecast');
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

  it('keeps forecast age visible and reveals source information only when requested', async () => {
    const user = userEvent.setup();
    farmApi.outlook.mockResolvedValue({ outlook: outlook({ source: 'CACHED' }) });
    renderPage(<SeaOutlookCard farmId="f1" />);
    const summary = await screen.findByText('Sources and forecast details');
    const details = summary.closest('details');
    expect(screen.getByText('Saved forecast')).toBeVisible();
    expect(screen.getByText(/Updated/)).toBeVisible();
    const source = screen.getByText('Weather: open-meteo / Tides: open-meteo-marine');
    const caveat = screen.getByText(/Rain chance is the highest hourly forecast/);
    expect(details).not.toHaveAttribute('open');
    expect(source).not.toBeVisible();
    expect(caveat).not.toBeVisible();
    await user.click(summary);
    expect(details).toHaveAttribute('open');
    expect(source).toBeVisible();
    expect(caveat).toBeVisible();
    await user.click(summary);
    expect(details).not.toHaveAttribute('open');
  });

  it('speaks Kiswahili', async () => {
    farmApi.outlook.mockResolvedValue({ outlook: outlook() });
    renderPage(<SeaOutlookCard farmId="f1" />, { lang: 'sw' });
    await screen.findAllByTestId('drying-day'); // wait until the forecast has loaded
    const card = screen.getByTestId('sea-outlook');
    expect(card).toHaveTextContent('Leo baharini');
    expect(card).toHaveTextContent('Makadirio ya maji kupwa leo 12:00');
    expect(card).toHaveTextContent('Hatari ndogo ya mvua katika utabiri');
  });
});
