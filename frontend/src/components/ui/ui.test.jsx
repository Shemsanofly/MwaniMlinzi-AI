import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n/I18nProvider.jsx';
import { RiskBadge, SourceBadge, ErrorState, FormError } from './index.jsx';
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

  test('RiskBadge shows the agreed Kiswahili wording for CRITICAL', () => {
    wrap(<RiskBadge level="CRITICAL" />);
    expect(screen.getByText('Hatari kubwa sana')).toBeInTheDocument();
  });

  test('ErrorState translates known backend error codes', () => {
    wrap(<ErrorState error={{ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Namba ya simu/barua pepe au nenosiri si sahihi.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Invalid credentials');
  });

  test('ErrorState never shows the English backend message in Kiswahili mode', () => {
    wrap(<ErrorState error={{ status: 418, code: 'SOMETHING_NEW', message: 'Teapot exploded' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Kuna hitilafu. Tafadhali jaribu tena.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Teapot');
  });

  test('ErrorState shows the backend message for unknown codes in English mode', () => {
    localStorage.setItem('mwanimlinzi.lang', 'en');
    wrap(<ErrorState error={{ status: 418, code: 'SOMETHING_NEW', message: 'Teapot exploded' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Teapot exploded');
  });

  test('FormError shows validation details as field + Kiswahili hint', () => {
    const error = { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ path: 'phone', message: 'Invalid phone number' }] };
    wrap(<FormError error={error} />);
    expect(screen.getByText('Baadhi ya taarifa ulizoweka si sahihi.')).toBeInTheDocument();
    expect(screen.getByText('phone: thamani si sahihi')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid phone number/)).not.toBeInTheDocument();
  });

  test('FormError shows validation details as-is in English', () => {
    localStorage.setItem('mwanimlinzi.lang', 'en');
    const error = { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ path: 'phone', message: 'Invalid phone number' }] };
    wrap(<FormError error={error} />);
    expect(screen.getByText('Some of the information you entered is not valid.')).toBeInTheDocument();
    expect(screen.getByText('phone: Invalid phone number')).toBeInTheDocument();
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
