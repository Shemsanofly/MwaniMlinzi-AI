import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n/I18nProvider.jsx';
import { RiskBadge, SourceBadge, ErrorState } from './index.jsx';
import { NextActionCard } from '../risk/RiskComponents.jsx';
import { MemoryRouter } from 'react-router-dom';

const wrap = (ui) => render(<MemoryRouter><I18nProvider>{ui}</I18nProvider></MemoryRouter>);

describe('shared UI', () => {
  beforeEach(() => localStorage.setItem('mwanimlinzi.lang', 'sw'));

  test('RiskBadge shows the Kiswahili level', () => {
    wrap(<RiskBadge level="HIGH" />);
    expect(screen.getByText('Hatari kubwa')).toBeInTheDocument();
  });

  test('SourceBadge labels demo data honestly', () => {
    localStorage.setItem('mwanimlinzi.lang', 'en');
    wrap(<SourceBadge source="DEMO" />);
    expect(screen.getByText('Demo environmental data')).toBeInTheDocument();
  });

  test('ErrorState maps network errors to a friendly message', () => {
    localStorage.setItem('mwanimlinzi.lang', 'en');
    wrap(<ErrorState error={{ status: 0 }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  test('NextActionCard renders the approved action and pending-validation badge', () => {
    const nextAction = {
      riskType: 'HEAT_ICE_ICE',
      riskLevel: 'HIGH',
      reasons: [{ code: 'SST_ANOMALY', label: 'SST is elevated', labelSw: 'Joto la bahari limeongezeka' }],
      recommendation: { id: 'r1', status: 'PENDING', actionItem: { action: 'Inspect lines within 24 hours', actionSw: 'Kagua mistari ndani ya saa 24', explanation: 'x', explanationSw: 'y', urgency: 'URGENT', validated: false, source: 'demo' } },
    };
    wrap(<NextActionCard nextAction={nextAction} />);
    expect(screen.getByText('Kagua mistari ndani ya saa 24')).toBeInTheDocument();
    expect(screen.getByText('Joto la bahari limeongezeka')).toBeInTheDocument();
    expect(screen.getByText(/Inasubiri uthibitisho/)).toBeInTheDocument();
  });
});
