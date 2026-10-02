import { useState } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { recordsApi } from '../../../api/endpoints.js';
import RecordBookView from '../RecordBookView.jsx';
import SeasonCard from '../SeasonCard.jsx';
import { renderPage } from '../../../pages/farmer/__tests__/fixtures.jsx';

vi.mock('../../../api/endpoints.js', () => ({
  recordsApi: { summary: vi.fn(), list: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));

const cycle = { id: 'c1', plantingDate: '2026-08-01T00:00:00.000Z', expectedHarvestDate: '2026-09-15T00:00:00.000Z', linesPlanted: 100, status: 'HARVESTED' };
const summary = {
  cycleId: 'c1', harvestedKg: 130, soldKg: 120, unsoldKg: 10, incomeTzs: 118000, owedTzs: 18000, costsTzs: 55000,
  costsByCategory: { SEEDLINGS: 35000, ROPE_LINES: 20000 }, profitTzs: 63000, profitPerLine: 630, averagePricePerKg: 983,
  counts: { sales: 2, costs: 3, work: 1, harvests: 1 },
};
const rows = {
  sales: [{ id: 's1', saleDate: '2026-09-20T00:00:00.000Z', quantityKg: 100, pricePerKg: 1000, totalTzs: 100000, buyerName: 'Mwanaidi Traders', paymentStatus: 'PAID', channel: 'USSD' },
    { id: 's2', saleDate: '2026-09-21T00:00:00.000Z', quantityKg: 20, pricePerKg: 900, totalTzs: 18000, buyerName: null, paymentStatus: 'PENDING', channel: 'APP' }],
  costs: [{ id: 'k1', costDate: '2026-08-02T00:00:00.000Z', category: 'SEEDLINGS', amountTzs: 30000, notes: null, channel: 'APP' }],
  work: [{ id: 'w1', workDate: '2026-09-10T00:00:00.000Z', activity: 'CLEANING_LINES', notes: null, channel: 'USSD' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  recordsApi.summary.mockResolvedValue({ cycle, cycles: [cycle], summary });
  recordsApi.list.mockImplementation(async (kind) => ({ [kind]: rows[kind] }));
  recordsApi.create.mockResolvedValue({});
  recordsApi.remove.mockResolvedValue({});
});

describe('Record book', () => {
  it('shows profit for the cycle from the farmer\'s own records', async () => {
    renderPage(<RecordBookView farmId="f1" />);
    const cards = await screen.findByTestId('record-summary');
    expect(cards).toHaveTextContent('Income');
    expect(cards).toHaveTextContent('TSh 118,000');
    expect(cards).toHaveTextContent('TSh 55,000');
    expect(cards).toHaveTextContent('TSh 63,000');
    expect(cards).toHaveTextContent('Owed to you');
    expect(cards).toHaveTextContent('TSh 18,000');
    expect(cards).toHaveTextContent('130 kg');
    expect(screen.getByText('From your records')).toBeInTheDocument();
    expect(await screen.findByText('Mwanaidi Traders')).toBeInTheDocument();
    expect(screen.getByText('Not yet paid')).toBeInTheDocument();
    expect(recordsApi.summary).toHaveBeenCalledWith('f1', { cycleId: undefined });
  });

  it('adds a sale with numbers and rejects a zero price before calling the server', async () => {
    const user = userEvent.setup();
    renderPage(<RecordBookView farmId="f1" />);
    await screen.findByTestId('record-summary');
    await user.click(screen.getByRole('button', { name: 'Add sale' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Kilograms sold/), '50');
    await user.type(within(dialog).getByLabelText(/Price per kg/), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(recordsApi.create).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Enter a number greater than 0.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText(/Price per kg/));
    await user.type(within(dialog).getByLabelText(/Price per kg/), '950');
    await user.type(within(dialog).getByLabelText(/Buyer/), 'Kombo Exporters');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(recordsApi.create).toHaveBeenCalledWith('sales', 'f1', expect.objectContaining({ quantityKg: 50, pricePerKg: 950, buyerName: 'Kombo Exporters', paymentStatus: 'PAID', cycleId: 'c1' })));
  });

  it('adds a cost and records today\'s work', async () => {
    const user = userEvent.setup();
    renderPage(<RecordBookView farmId="f1" />);
    await screen.findByTestId('record-summary');
    await user.click(screen.getByRole('tab', { name: /Costs/ }));
    await user.click(screen.getByRole('button', { name: 'Add cost' }));
    let dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Type of cost/), 'LABOUR');
    await user.type(within(dialog).getByLabelText(/Amount/), '15000');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(recordsApi.create).toHaveBeenCalledWith('costs', 'f1', expect.objectContaining({ category: 'LABOUR', amountTzs: 15000 })));

    await user.click(screen.getByRole('tab', { name: /Work/ }));
    await user.click(screen.getByRole('button', { name: 'Add work' }));
    dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText(/Activity/), 'HARVESTING');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(recordsApi.create).toHaveBeenCalledWith('work', 'f1', expect.objectContaining({ activity: 'HARVESTING' })));
  });

  it('deletes an entry only after a second confirm tap', async () => {
    const user = userEvent.setup();
    renderPage(<RecordBookView farmId="f1" />);
    const row = (await screen.findByText('Mwanaidi Traders')).closest('li');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(recordsApi.remove).not.toHaveBeenCalled();
    await user.click(within(row).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(recordsApi.remove).toHaveBeenCalledWith('sales', 'f1', 's1'));
  });

  it('refuses a decimal price (whole shillings only)', async () => {
    const user = userEvent.setup();
    renderPage(<RecordBookView farmId="f1" />);
    await screen.findByTestId('record-summary');
    await user.click(screen.getByRole('button', { name: 'Add sale' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Kilograms sold/), '10');
    await user.type(within(dialog).getByLabelText(/Price per kg/), '950.5');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(recordsApi.create).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Use whole shillings (no decimals).')).toBeInTheDocument();
  });

  it('switching to another farm forgets the planting picked on the previous farm', async () => {
    const user = userEvent.setup();
    const older = { ...cycle, id: 'c0', plantingDate: '2026-05-01T00:00:00.000Z' };
    recordsApi.summary.mockResolvedValue({ cycle, cycles: [cycle, older], summary });
    function TwoFarms() {
      const [farmId, setFarmId] = useState('f1');
      return <><button type="button" onClick={() => setFarmId('f2')}>switch farm</button><RecordBookView farmId={farmId} /></>;
    }
    renderPage(<TwoFarms />);
    await screen.findByTestId('record-summary');
    await user.selectOptions(screen.getByRole('combobox'), 'c0');
    await waitFor(() => expect(recordsApi.summary).toHaveBeenLastCalledWith('f1', { cycleId: 'c0' }));
    await user.click(screen.getByRole('button', { name: 'switch farm' }));
    await waitFor(() => expect(recordsApi.summary).toHaveBeenLastCalledWith('f2', { cycleId: undefined }));
  });

  it('read-only for admins: no add or delete buttons', async () => {
    renderPage(<RecordBookView farmId="f1" readOnly />);
    await screen.findByText('Mwanaidi Traders');
    expect(screen.queryByRole('button', { name: 'Add sale' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('says so when nothing is recorded yet (no invented numbers)', async () => {
    recordsApi.summary.mockResolvedValue({ cycle: null, cycles: [], summary: { ...summary, harvestedKg: 0, soldKg: 0, unsoldKg: 0, incomeTzs: 0, owedTzs: 0, costsTzs: 0, costsByCategory: {}, profitTzs: 0, profitPerLine: null, averagePricePerKg: null, counts: { sales: 0, costs: 0, work: 0, harvests: 0 } } });
    recordsApi.list.mockResolvedValue({ sales: [], costs: [], work: [] });
    renderPage(<RecordBookView farmId="f1" />);
    expect(await screen.findByText('No sales recorded yet')).toBeInTheDocument();
  });

  it('Kiswahili', async () => {
    renderPage(<RecordBookView farmId="f1" />, { lang: 'sw' });
    const cards = await screen.findByTestId('record-summary');
    expect(cards).toHaveTextContent('Mapato');
    expect(cards).toHaveTextContent('Faida');
  });
});

describe('Dashboard "This season" card', () => {
  it('shows income, costs and profit with a link to the record book', async () => {
    renderPage(<SeasonCard farmId="f1" />);
    const card = await screen.findByTestId('season-card');
    expect(card).toHaveTextContent('TSh 118,000');
    expect(card).toHaveTextContent('TSh 63,000');
    expect(within(card).getByRole('link', { name: /Open record book/ })).toHaveAttribute('href', '/farmer/records');
  });
});
