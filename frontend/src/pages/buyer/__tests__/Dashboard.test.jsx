import { cloneElement } from 'react';
import { screen, within } from '@testing-library/react';
import { renderPage } from '../../extension/__tests__/testUtils.jsx';
import BuyerDashboard from '../Dashboard.jsx';
import { buyerApi } from '../../../api/endpoints.js';

vi.mock('../../../api/endpoints.js', () => ({ buyerApi: { forecast: vi.fn() } }));
vi.mock('../../../stores/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'b', buyerId: 'buyer1', roles: ['BUYER'] }, hasRole: () => true }) }));
vi.mock('recharts', async (orig) => {
  const m = await orig();
  return { ...m, ResponsiveContainer: ({ children }) => <div style={{ width: 800, height: 300 }}>{cloneElement(children, { width: 800, height: 300 })}</div> };
});

const h = (ra, low, high, farms = 5) => ({ farms, expectedKg: ra * 1.2, riskAdjustedKg: ra, lowKg: low, highKg: high, avgConfidence: 0.82 });
const data = {
  summary: {
    unit: 'kg (dried seaweed)',
    horizons: { next7Days: h(1463.8, 1166.5, 1744.1), next14Days: h(3338.8, 2653.2, 3974.6), next30Days: h(2400, 1900, 2800), all: h(5976, 4741, 7064) },
    byCooperative: [{ key: 'Paje Demo Seaweed Cooperative', ...h(2204, 1745, 2590) }],
    byDistrict: [{ key: 'Kusini', ...h(4000, 3200, 4800) }],
    byWeek: [{ key: '2026-09-27', ...h(1463.8, 1166.5, 1744.1) }],
    uncertaintyNote: 'Forecasts are estimates, not guarantees.',
  },
  supply: [{ id: 's1', cooperative: { id: 'c1', name: 'Paje' }, district: 'Kusini', expectedHarvestDate: '2026-10-01T00:00:00Z', expectedQuantityKg: 84, riskAdjustedQuantityKg: 3200, lowQuantityKg: 3050, highQuantityKg: 3600, confidence: 0.8, expectedGrade: 'A', species: 'Cottonii', isDemo: true }],
  filters: { cooperatives: [], districts: [] },
  demand: [{ id: 'd1', quantityKg: 3000, pricePerKg: 1200, neededBy: '2026-10-14T00:00:00Z', minimumGrade: 'A', status: 'OPEN', species: { commonName: 'Cottonii' } }],
  qualityHistory: [{ grade: 'A', harvests: 69, kg: 10049 }, { grade: 'B', harvests: 24, kg: 3296 }],
};

describe('Buyer dashboard', () => {
  beforeEach(() => buyerApi.forecast.mockResolvedValue(data));

  it('shows expected supply in tonnes with the uncertainty range', async () => {
    renderPage(<BuyerDashboard />);
    const card30 = await screen.findByTestId('horizon-30');
    expect(within(card30).getByText('2.4 tonnes')).toBeInTheDocument();
    expect(within(card30).getByText('Range: 1.9–2.8 tonnes')).toBeInTheDocument();
    expect(within(screen.getByTestId('horizon-7')).getByText('1.5 tonnes')).toBeInTheDocument();
    expect(screen.getByText('How certain is this?')).toBeInTheDocument();
    expect(screen.getByText('Forecasts are estimates, not guarantees.')).toBeInTheDocument();
  });

  it('compares posted demand with forecast supply and never shows farmer identity', async () => {
    renderPage(<BuyerDashboard />);
    expect(await screen.findByText('Likely covered')).toBeInTheDocument();
    expect(screen.getByText('Supply by cooperative')).toBeInTheDocument();
    expect(screen.getByText(/individual farmers are never identified/)).toBeInTheDocument();
    expect(screen.queryByText(/FARM0/)).not.toBeInTheDocument();
  });
});
