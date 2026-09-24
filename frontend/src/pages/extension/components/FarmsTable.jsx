import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Tractor } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { cooperativeApi, farmApi } from '../../../api/endpoints.js';
import { DemoBadge, EmptyState, ErrorState, PageHeader, PageLoader, RiskBadge, Table } from '../../../components/ui/index.jsx';
import { RISK_LEVELS } from '../../../utils/risk.js';
import { date } from '../../../utils/format.js';
import { FarmForecastCell, RiskMiniBadges } from './common.jsx';

const STATUSES = ['ACTIVE', 'FALLOW', 'INACTIVE'];

/** Table of FarmService DTOs; `showCooperative` adds the cooperative column. */
export function FarmsTable({ farms, base, showCooperative = false, empty }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const columns = [
    { key: 'farmCode', header: t('extension.shared.table.code'), render: (f) => <span className="font-mono text-xs font-semibold text-slate-800">{f.farmCode}</span> },
    {
      key: 'name',
      header: t('extension.shared.table.name'),
      render: (f) => (
        <div className="min-w-40">
          <p className="font-medium text-slate-900">{f.name}</p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {f.isDemo && <DemoBadge />}
            {f.status !== 'ACTIVE' && <span className="text-xs text-slate-500">{t(`extension.shared.farmStatus.${f.status}`)}</span>}
          </div>
        </div>
      ),
    },
    { key: 'farmer', header: t('common.farmer'), render: (f) => <span className="whitespace-nowrap">{f.farmer?.fullName || '—'}</span> },
    ...(showCooperative ? [{ key: 'coop', header: t('common.cooperative'), render: (f) => <span className="text-xs">{f.cooperative?.name || t('extension.shared.independent')}</span> }] : []),
    { key: 'age', header: t('common.cropAge'), render: (f) => (f.cropAgeDays != null ? <span className="whitespace-nowrap">{t('common.days', { n: f.cropAgeDays })}</span> : <span className="text-slate-400">—</span>) },
    { key: 'risk', header: t('extension.shared.table.overallRisk'), render: (f) => <RiskBadge level={f.overallRiskLevel} /> },
    { key: 'types', header: t('extension.shared.table.riskByType'), render: (f) => <RiskMiniBadges latestRisks={f.latestRisks} /> },
    { key: 'forecast', header: t('common.expectedHarvest'), render: (f) => <FarmForecastCell farm={f} /> },
    { key: 'lastObs', header: t('extension.shared.table.lastObservation'), render: (f) => <span className="whitespace-nowrap text-xs">{f.lastObservation ? date(f.lastObservation.observedAt, lang) : '—'}</span> },
  ];
  return <Table columns={columns} rows={farms} empty={empty} onRowClick={(f) => navigate(`${base}/farms/${f.id}`)} />;
}

/** Shared farm list page (cooperative scope or all farms for extension officers). */
export function FarmListPage({ base, showCooperative = false, title, subtitle }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [status, setStatus] = useState('');
  const [cooperativeId, setCooperativeId] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const params = useMemo(() => ({ search: deferredSearch, riskLevel, status, cooperativeId }), [deferredSearch, riskLevel, status, cooperativeId]);
  const q = useQuery({ queryKey: ['farms', params], queryFn: () => farmApi.list(params), placeholderData: (prev) => prev });
  const coops = useQuery({ queryKey: ['cooperatives'], queryFn: cooperativeApi.list, enabled: showCooperative });
  const farms = q.data?.farms || [];
  const filtered = !!(deferredSearch || riskLevel || status || cooperativeId);

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <label htmlFor="farm-search" className="sr-only">{t('actions.search')}</label>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden />
          <input id="farm-search" type="search" className="input pl-9" placeholder={t('extension.shared.filters.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="farm-risk" className="sr-only">{t('extension.shared.filters.riskLevel')}</label>
          <select id="farm-risk" className="input" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
            <option value="">{t('extension.shared.filters.allLevels')}</option>
            {RISK_LEVELS.map((l) => <option key={l} value={l}>{t(`risk.levelLong.${l}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="farm-status" className="sr-only">{t('common.status')}</label>
          <select id="farm-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('extension.shared.filters.allStatuses')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`extension.shared.farmStatus.${s}`)}</option>)}
          </select>
        </div>
        {showCooperative && (
          <div>
            <label htmlFor="farm-coop" className="sr-only">{t('common.cooperative')}</label>
            <select id="farm-coop" className="input" value={cooperativeId} onChange={(e) => setCooperativeId(e.target.value)}>
              <option value="">{t('extension.shared.filters.allCooperatives')}</option>
              {(coops.data?.cooperatives || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <p className="mb-2 text-sm text-slate-500" aria-live="polite">{t('extension.shared.farmsCount', { n: farms.length })}{q.isFetching && ' …'}</p>
          <FarmsTable
            farms={farms}
            base={base}
            showCooperative={showCooperative}
            empty={<EmptyState icon={Tractor} title={t('extension.shared.noFarms')} message={filtered ? t('extension.shared.noFarmsFiltered') : null} />}
          />
        </>
      )}
    </div>
  );
}
