import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ScrollText, Send, ShieldCheck } from 'lucide-react';
import { adminApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, EmptyState, ErrorState, PageHeader, PageLoader, Table, cx } from '../../components/ui/index.jsx';
import { dateTime } from '../../utils/format.js';
import { JsonBlock, Pagination, Tabs } from './components/shared.jsx';

const PAGE_SIZE = 50;
/** Actions and entity types the backend writes (free text is also accepted). */
const ACTIONS = ['LOGIN', 'LOGOUT', 'REGISTER', 'CREATE', 'UPDATE', 'UPDATE_PROFILE', 'UPDATE_SETTING', 'UPDATE_MODEL_STATUS', 'RUN_JOB', 'RUN_RISK', 'SIMULATE_RISK', 'VALIDATE_ACTION', 'UNVALIDATE_ACTION', 'FLAG_PREDICTION', 'AI_CHAT', 'UPLOAD', 'GENERATE_FORECASTS'];
const ENTITIES = ['User', 'Farm', 'Cooperative', 'ActionLibrary', 'SystemSetting', 'MlModel', 'Job', 'RiskPrediction', 'Alert', 'BuyerDemand', 'HarvestForecast', 'UploadedFile', 'Assistant'];

function AuditTab() {
  const { t, lang } = useI18n();
  const [filters, setFilters] = useState({ action: '', entityType: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const params = { ...filters, page, limit: PAGE_SIZE };
  const q = useQuery({ queryKey: ['admin', 'audit', params], queryFn: () => adminApi.audit(params), placeholderData: keepPreviousData });
  const setFilter = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); setOpen(null); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <label htmlFor="audit-action" className="label">{t('admin.audit.action')}</label>
          <input id="audit-action" list="audit-actions" className="input font-mono text-sm" placeholder={t('common.all')} value={filters.action} onChange={setFilter('action')} />
          <datalist id="audit-actions">{ACTIONS.map((a) => <option key={a} value={a} />)}</datalist>
        </div>
        <div className="sm:w-64">
          <label htmlFor="audit-entity" className="label">{t('admin.audit.entity')}</label>
          <select id="audit-entity" className="input" value={filters.entityType} onChange={setFilter('entityType')}>
            <option value="">{t('common.all')}</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{t(`admin.audit.entities.${e}`, { defaultValue: e })}</option>)}
          </select>
        </div>
        {(filters.action || filters.entityType) && <Button variant="ghost" onClick={() => { setFilters({ action: '', entityType: '' }); setPage(1); }}>{t('admin.audit.clear')}</Button>}
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.logs.length === 0 ? (
        <EmptyState icon={ScrollText} title={t('admin.audit.none')} />
      ) : (
        <>
          <div className={cx('overflow-x-auto rounded-xl border border-slate-200 bg-white', q.isFetching && 'opacity-60')}>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['', t('common.date'), t('admin.audit.user'), t('admin.audit.action'), t('admin.audit.entity'), t('admin.audit.ip')].map((h, i) => (
                    <th key={h || i} scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data.logs.map((l) => {
                  const isOpen = open === l.id;
                  return (
                    <Fragment key={l.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="w-10 px-3 py-2">
                          <button type="button" onClick={() => setOpen(isOpen ? null : l.id)} disabled={!l.details} aria-expanded={isOpen} aria-label={t('admin.audit.details')} className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{dateTime(l.createdAt, lang)}</td>
                        <td className="px-3 py-2">{l.user ? <><p className="font-medium text-slate-900">{l.user.fullName}</p><p className="text-xs text-slate-500">{l.user.email}</p></> : <span className="text-slate-400">{t('admin.audit.system')}</span>}</td>
                        <td className="px-3 py-2"><Badge className="bg-ocean-50 font-mono text-ocean-800 ring-ocean-200">{l.action}</Badge></td>
                        <td className="px-3 py-2"><p className="text-slate-800">{l.entityType ? t(`admin.audit.entities.${l.entityType}`, { defaultValue: l.entityType }) : '—'}</p><p className="max-w-[14rem] truncate font-mono text-xs text-slate-500" title={l.entityId || ''}>{l.entityId || '—'}</p></td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{l.ipAddress || '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={6} className="bg-slate-50 px-3 py-3"><JsonBlock value={l.details} /></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={q.data.page} limit={q.data.limit} total={q.data.total} onPage={(p) => { setPage(p); setOpen(null); }} />
        </>
      )}
    </div>
  );
}

const DELIVERY_TONE = {
  SENT: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
  DELIVERED: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
  SIMULATED: 'bg-violet-50 text-violet-800 ring-violet-300',
  FAILED: 'bg-red-50 text-red-800 ring-red-300',
};

function DeliveryTab() {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['admin', 'notificationLogs'], queryFn: adminApi.notificationLogs });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t('admin.audit.deliveryIntro')}</p>
      <Table
        rows={q.data.logs}
        empty={<EmptyState icon={Send} title={t('admin.audit.noDelivery')} />}
        columns={[
          { key: 'createdAt', header: t('common.date'), render: (l) => <span className="whitespace-nowrap text-xs">{dateTime(l.createdAt, lang)}</span> },
          { key: 'channel', header: t('admin.audit.channel'), render: (l) => <Badge>{l.channel}</Badge> },
          { key: 'provider', header: t('admin.audit.provider'), render: (l) => <span className="font-mono text-xs">{l.provider}</span> },
          { key: 'recipient', header: t('admin.audit.recipient'), render: (l) => <span className="font-mono text-xs">{l.recipient}</span> },
          { key: 'status', header: t('common.status'), render: (l) => <Badge className={DELIVERY_TONE[l.status]}>{l.status}</Badge> },
          { key: 'error', header: t('admin.audit.error'), render: (l) => (l.error ? <span className="text-xs text-red-700">{l.error}</span> : '—') },
        ]}
      />
    </div>
  );
}

export default function AdminAudit() {
  const { t } = useI18n();
  const [tab, setTab] = useState('audit');
  return (
    <div>
      <PageHeader title={t('admin.audit.title')} subtitle={t('admin.audit.subtitle')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'audit', label: t('admin.audit.tabAudit'), icon: ShieldCheck },
          { id: 'delivery', label: t('admin.audit.tabDelivery'), icon: Send },
        ]}
      />
      {tab === 'audit' ? <AuditTab /> : <DeliveryTab />}
    </div>
  );
}
