import { useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Button, EmptyState, ErrorState, PageHeader, PageLoader, cx } from '../../components/ui/index.jsx';
import { NotificationItem, notificationPriority, useNotifications } from '../../components/notifications.jsx';

const FILTERS = [
  { key: 'all', test: () => true },
  { key: 'important', test: (n) => ['HIGH', 'CRITICAL'].includes(notificationPriority(n)) },
  { key: 'unread', test: (n) => !n.readAt },
];

/** Notification centre: risk alerts, recommendations, reminders and system messages, most important first to see. */
export default function Notifications() {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const { notifications, unread, isLoading, error, refetch, readAll, readOne } = useNotifications();
  const shown = notifications.filter(FILTERS.find((f) => f.key === filter).test);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
        actions={unread > 0 && <Button variant="secondary" size="sm" icon={CheckCheck} loading={readAll.isPending} onClick={() => readAll.mutate()}>{t('actions.markAllRead')}</Button>}
      />
      <div role="tablist" aria-label={t('notifications.filter')} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cx('min-h-11 rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset transition', filter === f.key ? 'bg-ocean-700 text-white ring-ocean-700' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}
          >
            {t(`notifications.filters.${f.key}`)}{f.key === 'unread' && unread > 0 ? ` (${unread})` : ''}
          </button>
        ))}
      </div>
      {isLoading && <PageLoader label={t('notifications.loading')} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {!isLoading && !error && shown.length === 0 && (
        <EmptyState icon={BellOff} title={t(`notifications.emptyTitle.${filter}`)} message={t('notifications.emptyText')} />
      )}
      {shown.length > 0 && (
        <ul className="space-y-2.5">
          {shown.map((n) => <li key={n.id}><NotificationItem n={n} onRead={(id) => readOne.mutate(id)} /></li>)}
        </ul>
      )}
    </div>
  );
}
