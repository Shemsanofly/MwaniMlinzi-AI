import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../../i18n/I18nProvider.jsx';
import { Modal } from './index.jsx';

function Example() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open form</button>
    <Modal open={open} title="Farm form" onClose={() => setOpen(false)}>
      <input aria-label="Farm name" />
      <button onClick={() => setNested(true)}>More options</button>
      <Modal open={nested} title="Options" onClose={() => setNested(false)}><button>Last option</button></Modal>
    </Modal>
  </>;
}

beforeEach(() => { localStorage.setItem('mwanimlinzi.lang', 'en'); });

test('dialog traps keyboard focus, handles Escape and restores the opener and scrolling', async () => {
  const user = userEvent.setup();
  render(<I18nProvider><Example /></I18nProvider>);
  const opener = screen.getByRole('button', { name: 'Open form' });
  await user.click(opener);
  const close = screen.getByRole('button', { name: 'Close' });
  expect(close).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  await user.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'More options' })).toHaveFocus();
  await user.tab();
  expect(close).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(document.body.style.overflow).toBe('');
});

test('Escape closes only the top dialog and retains the outer scroll lock', async () => {
  const user = userEvent.setup();
  render(<I18nProvider><Example /></I18nProvider>);
  await user.click(screen.getByRole('button', { name: 'Open form' }));
  const more = screen.getByRole('button', { name: 'More options' });
  await user.click(more);
  expect(screen.getAllByRole('dialog')).toHaveLength(2);
  await user.keyboard('{Escape}');
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(more).toHaveFocus();
  expect(document.body.style.overflow).toBe('hidden');
  await user.keyboard('{Escape}');
  expect(document.body.style.overflow).toBe('');
});
