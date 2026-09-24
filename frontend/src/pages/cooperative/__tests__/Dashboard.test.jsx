import { cloneElement } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderPage } from '../../extension/__tests__/testUtils.jsx';
import CooperativeDashboard from '../Dashboard.jsx';
import { cooperativeApi, forecastApi } from '../../../api/endpoints.js';

vi.mock('../../../api/endpoints.js', () => ({
  cooperativeApi: { myDashboard: vi.fn() },
  forecastApi: { generate: vi.fn() },
  alertApi: { update: vi.fn() },
  riskApi: { flag: vi.fn() },
}));
vi.mock('../../../components/map/FarmMap.jsx', () => ({ default: ({ farms }) => <div data-testid="map">{farms.length} farms on map</div> }));
vi.mock('recharts', async (orig) => {
  const m = await orig();
  return { ...m, ResponsiveContainer: ({ children }) => <div style={{ width: 800, height: 300 }}>{cloneElement(children, { width: 800, height: 300 })}</div> };
});

const farm = {
  id: 'f1', farmCode: 'FARM001', name: 'Paje Kusini', status: 'ACTIVE', isDemo: true, farmer: { id: 'u1', fullName: 'Mwanaisha Haji' },
  cropAgeDays: 39, overallRiskLevel: 'CRITICAL', latestRisks: { HEAT_ICE_ICE: { level: 'CRITICAL', probability: 0.96, confidence: 0.9 } },
  forecast: { expectedHarvestDate: '2026-09-29T00:00:00Z', riskAdjustedQuantityKg: 128.6, lowQuantityKg: 105, highQuantityKg: 152, confidence: 0.89 },
  location: { latitude: -6.2, longitude: 39.5 },
};
const data = {
  cooperative: { id: 'c1', name: 'Paje Demo Seaweed Cooperative', district: 'Kusini', isDemo: true },
  members: 10,
  farms: [farm],
  cards: { totalFarmers: 10, activeFarms: 17, highRiskFarms: 6, criticalAlerts: 3, activeAlerts: 10, expectedHarvestKg30d: 1861.7, expectedHarvestRange30d: [1479.4, 2189.1], missingReports: 2 },
  charts: {
    riskDistribution: { overall: [{ level: 'LOW', farms: 11 }, { level: 'MEDIUM', farms: 0 }, { level: 'HIGH', farms: 3 }, { level: 'CRITICAL', farms: 3 }], byType: [{ riskType: 'HEAT_ICE_ICE', LOW: 14, MEDIUM: 0, HIGH: 0, CRITICAL: 3 }] },
    harvestForecast: [{ key: '2026-09-27', farms: 4, expectedKg: 623, riskAdjustedKg: 463, lowKg: 367, highKg: 550 }],
    farmActivity: [{ date: '2026-09-23', count: 1, actions: 1 }],
    losses: [{ cause: 'ICE_ICE', events: 4, avgPercent: 28.5, kg: 155 }],
    alertsByType: [{ type: 'HEAT_CRITICAL', count: 3 }],
    observations: { whitening: 4, breakage: 0, epiphytes: 0, poorCondition: 1, total: 35 },
  },
  forecastSummary: { uncertaintyNote: 'Ranges reflect model uncertainty.' },
  highRiskFarms: [farm],
  recentAlerts: [{ id: 'a1', farmId: 'f1', type: 'HEAT_CRITICAL', severity: 'CRITICAL', status: 'ACTIVE', title: 'CRITICAL heat risk — FARM001', titleSw: 'Hatari muhimu', message: 'm', createdAt: new Date().toISOString(), farm: { farmCode: 'FARM001', name: 'Paje Kusini' } }],
  missingReportFarms: [{ id: 'f9', farmCode: 'FARM009', name: 'Quiet farm', farmer: 'Ali', lastObservation: null }],
  performance: [{ farmId: 'f1', farmCode: 'FARM001', name: 'Paje Kusini', harvests: 4, totalKg: 723, avgLossPercent: 2.6 }],
  outcomes: [{ id: 'o1', farmId: 'f1', outcomeType: 'MINOR_LOSS', lossPercent: 5, outcomeDate: '2026-09-23T00:00:00Z', riskMaterialized: false, farm: { farmCode: 'FARM001' }, prediction: { riskType: 'HEAT_ICE_ICE', riskLevel: 'CRITICAL' } }],
};

describe('Cooperative dashboard', () => {
  beforeEach(() => {
    cooperativeApi.myDashboard.mockResolvedValue(data);
    forecastApi.generate.mockResolvedValue({ generated: 17 });
  });

  it('renders stat cards, charts, map and tables from the dashboard API', async () => {
    renderPage(<CooperativeDashboard />);
    expect(await screen.findByRole('heading', { name: 'Paje Demo Seaweed Cooperative' })).toBeInTheDocument();
    expect(screen.getByText('Total farmers')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('1,862 kg')).toBeInTheDocument();
    expect(screen.getByText('Range: 1,479–2,189 kg (risk-adjusted)')).toBeInTheDocument();
    expect(screen.getByText('Missing reports')).toBeInTheDocument();
    expect(screen.getByText('Farms by overall risk')).toBeInTheDocument();
    expect(screen.getByText('Harvest forecast by week')).toBeInTheDocument();
    expect(screen.getByText('Losses by cause (last 6 months)')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toHaveTextContent('1 farms on map');
    expect(screen.getByText('CRITICAL heat risk — FARM001')).toBeInTheDocument();
    expect(screen.getByText('FARM009 · Quiet farm')).toBeInTheDocument();
    expect(screen.getByText('Farm performance')).toBeInTheDocument();
    expect(screen.getByText('Minor loss')).toBeInTheDocument();
  });

  it('regenerates forecasts and refetches the dashboard', async () => {
    renderPage(<CooperativeDashboard />);
    await userEvent.click(await screen.findByRole('button', { name: /Regenerate forecasts/ }));
    await waitFor(() => expect(forecastApi.generate).toHaveBeenCalled());
    expect(await screen.findByText(/17 harvest forecasts regenerated/)).toBeInTheDocument();
    await waitFor(() => expect(cooperativeApi.myDashboard).toHaveBeenCalledTimes(2));
  });
});
