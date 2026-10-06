import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, Bell, Info } from 'lucide-react';
import { notificationApi } from '../api/endpoints.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { timeAgo } from '../utils/format.js';
import { cx } from './ui/index.jsx';

/** In-app notifications for the current user (shared by the bell, the farmer tab and the notification centre). */
export function useNotifications() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => notificationApi.list(), refetchInterval: 60_000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: notificationApi.readAll, onSuccess: invalidate });
  const readOne = useMutation({ mutationFn: notificationApi.read, onSuccess: invalidate });
  return { ...query, notifications: query.data?.notifications || [], unread: query.data?.unread || 0, readAll, readOne };
}

/** A risk alert carries the alert's severity; other notifications carry their own priority. */
export const notificationPriority = (n) => n.alert?.severity || n.priority || 'INFO';

const PRIORITY = {
  CRITICAL: { icon: AlertOctagon, tone: 'text-red-700', ring: 'border-red-200 bg-red-50/60' },
  HIGH: { icon: AlertTriangle, tone: 'text-orange-700', ring: 'border-orange-200 bg-orange-50/50' },
  WARNING: { icon: AlertTriangle, tone: 'text-amber-700', ring: 'border-amber-200 bg-amber-50/40' },
  MEDIUM: { icon: AlertTriangle, tone: 'text-amber-700', ring: 'border-amber-200 bg-amber-50/40' },
  INFO: { icon: Info, tone: 'text-ocean-700', ring: 'border-slate-200 bg-white' },
  LOW: { icon: Info, tone: 'text-ocean-700', ring: 'border-slate-200 bg-white' },
};
export const priorityStyle = (p) => PRIORITY[p] || PRIORITY.INFO;

/** Title + text in the UI language (alert notifications are bilingual; others were written in the user's language). */
export function useNotificationText() {
  const { tx } = useI18n();
  return (n) => ({ title: n.alert ? tx(n.alert, 'title') : n.title, body: n.alert ? tx(n.alert, 'message') : n.body });
}

/** One notification row: icon + priority in words (never colour alone), title, text, time. */
export function NotificationItem({ n, onRead, compact = false }) {
  const { t, lang } = useI18n();
  const text = useNotificationText()(n);
  const priority = notificationPriority(n);
  const { icon: Icon, tone, ring } = priorityStyle(priority);
  const unread = !n.readAt;
  return (
    <button
      type="button"
      onClick={() => unread && onRead?.(n.id)}
      className={cx('flex w-full items-start gap-3 text-left transition hover:bg-slate-50', compact ? 'px-4 py-2.5' : cx('rounded-xl border p-4', ring))}
      aria-label={unread ? `${text.title}. ${t('notifications.markRead')}` : undefined}
    >
      <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', tone)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cx('text-[11px] font-bold uppercase tracking-wide', tone)}>{t(`notifications.priority.${priority}`)}</span>
          {unread && <span className="rounded-full bg-ocean-700 px-1.5 text-[10px] font-bold uppercase leading-4 text-white">{t('notifications.new')}</span>}
        </span>
        <span className={cx('block text-slate-900', compact ? 'text-sm font-semibold' : 'text-base font-semibold')}>{text.title}</span>
        <span className={cx('block text-slate-600', compact ? 'text-xs' : 'text-sm')}>{text.body}</span>
        <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.createdAt, lang)}</span>
      </span>
    </button>
  );
}

export { Bell as NotificationIcon };
