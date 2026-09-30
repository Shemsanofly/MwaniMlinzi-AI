import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { NotificationItem, useNotifications } from '../components/notifications.jsx';

/** Header bell for staff: the five newest notifications plus a link to the full notification centre. */
export default function NotificationBell({ allPath = '/account/notifications' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { notifications, unread, readAll, readOne } = useNotifications();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="relative rounded-xl p-2 text-slate-600 transition hover:bg-slate-900/5 hover:text-slate-900" aria-label={`${t('nav.notifications')} (${unread} ${t('common.unread')})`}>
        <Bell className={`h-5 w-5 ${unread > 0 ? 'origin-top motion-safe:animate-[ring_1.2s_ease-in-out_1]' : ''}`} aria-hidden />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-coral-500 px-1 text-center text-[11px] font-bold leading-[18px] text-white ring-2 ring-sand-50">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-[1100] mt-2 w-[min(92vw,380px)] origin-top-right animate-pop overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-float)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="font-semibold text-slate-900">{t('nav.notifications')}</p>
            {unread > 0 && <button type="button" className="text-xs font-semibold text-ocean-700" onClick={() => readAll.mutate()}>{t('actions.markAllRead')}</button>}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {notifications.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">{t('notifications.empty')}</li>}
            {notifications.slice(0, 5).map((n) => <li key={n.id}><NotificationItem n={n} compact onRead={(id) => readOne.mutate(id)} /></li>)}
          </ul>
          <Link to={allPath} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-ocean-700 hover:bg-ocean-50">{t('notifications.viewAll')}</Link>
        </div>
      )}
    </div>
  );
}
