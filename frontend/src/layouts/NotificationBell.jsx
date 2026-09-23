import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { notificationApi } from '../api/endpoints.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { timeAgo } from '../utils/format.js';

export default function NotificationBell() {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => notificationApi.list(), refetchInterval: 60_000 });
  const readAll = useMutation({ mutationFn: notificationApi.readAll, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readOne = useMutation({ mutationFn: notificationApi.read, onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = data?.unread || 0;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`${t('nav.notifications')} (${unread} ${t('common.unread')})`}>
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-[1100] mt-2 w-[min(92vw,380px)] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="font-semibold text-slate-900">{t('nav.notifications')}</p>
            {unread > 0 && <button type="button" className="text-xs font-semibold text-ocean-700" onClick={() => readAll.mutate()}>{t('actions.markAllRead')}</button>}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {(data?.notifications || []).length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">{t('common.noData')}</li>}
            {(data?.notifications || []).map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => !n.readAt && readOne.mutate(n.id)} className={`w-full px-4 py-2.5 text-left hover:bg-slate-50 ${n.readAt ? '' : 'bg-ocean-50/60'}`}>
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-600">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt, lang)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
