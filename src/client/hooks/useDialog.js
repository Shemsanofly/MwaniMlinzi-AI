import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
const dialogs = [];
let previousOverflow;

/** Keep keyboard focus inside the active dialog and return it to its opener. */
export function useDialog(open, panel, onClose) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !panel.current) return undefined;
    const element = panel.current;
    const opener = document.activeElement;
    if (!dialogs.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    dialogs.push(element);
    const controls = () => [...element.querySelectorAll(FOCUSABLE)].filter((el) => (
      !el.disabled && el.tabIndex >= 0 && !el.closest('[hidden],[inert]')
      && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden'
    ));
    (controls()[0] || element).focus();
    const onKey = (event) => {
      if (dialogs.at(-1) !== element) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current?.();
      }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first) {
        event.preventDefault(); element.focus();
      } else if (!element.contains(document.activeElement)
        || (event.shiftKey && (document.activeElement === first || document.activeElement === element))) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const wasTop = dialogs.at(-1) === element;
      dialogs.splice(dialogs.indexOf(element), 1);
      if (!dialogs.length) document.body.style.overflow = previousOverflow;
      if (wasTop && opener?.isConnected) opener.focus();
    };
  }, [open, panel]);
}
