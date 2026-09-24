import { act, render, screen } from '@testing-library/react';
import { I18nProvider, useI18n } from './I18nProvider.jsx';

function Probe() {
  const { lang, setLang, t, tx } = useI18n();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="text">{t('risk.level.CRITICAL')}</span>
      <span data-testid="tx">{tx({ title: 'Hello', titleSw: 'Habari' }, 'title')}</span>
      <button onClick={() => setLang('en')}>en</button>
      <button onClick={() => setLang('sw')}>sw</button>
    </div>
  );
}

describe('I18nProvider language persistence', () => {
  beforeEach(() => localStorage.clear());

  test('defaults to Kiswahili when nothing is stored', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId('lang')).toHaveTextContent('sw');
    expect(screen.getByTestId('text')).toHaveTextContent('Hatari kubwa sana');
    expect(screen.getByTestId('tx')).toHaveTextContent('Habari');
  });

  test('setLang persists to localStorage and sets <html lang>', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    act(() => screen.getByText('en').click());
    expect(localStorage.getItem('mwanimlinzi.lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByTestId('text')).toHaveTextContent('Critical');
    expect(screen.getByTestId('tx')).toHaveTextContent('Hello');
  });

  test('re-mounting the provider restores the stored language', () => {
    const first = render(<I18nProvider><Probe /></I18nProvider>);
    act(() => screen.getByText('en').click());
    first.unmount();
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId('lang')).toHaveTextContent('en');

    act(() => screen.getByText('sw').click());
    expect(localStorage.getItem('mwanimlinzi.lang')).toBe('sw');
  });

  test('picks up a language stored before mount', () => {
    localStorage.setItem('mwanimlinzi.lang', 'en');
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    localStorage.setItem('mwanimlinzi.lang', 'sw');
  });
});
