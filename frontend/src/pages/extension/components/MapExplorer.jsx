import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { cooperativeApi, farmApi } from '../../../api/endpoints.js';
import FarmMap from '../../../components/map/FarmMap.jsx';
import { Card, DemoBadge, EmptyState, ErrorState, PageHeader, PageLoader, RiskBadge } from '../../../components/ui/index.jsx';
import { RISK_LEVELS, RISK_TYPES, levelRank } from '../../../utils/risk.js';
import { pct } from '../../../utils/format.js';

/** Full-height risk map with filters (level, colour-by risk type, cooperative) and a side list. */
export default function MapExplorer({ base, title, subtitle, showCooperative = false }) {
  const { t } = useI18n();
  const [colorBy, setColorBy] = useState('OVERALL');
  const [level, setLevel] = useState('');
  const [cooperativeId, setCooperativeId] = useState('');
  const params = useMemo(() => ({ cooperativeId }), [cooperativeId]);
  const q = useQuery({ queryKey: ['farms', params], queryFn: () => farmApi.list(params) });
  const coops = useQuery({ queryKey: ['cooperatives'], queryFn: cooperativeApi.list, enabled: showCooperative });

  const levelOf = useMemo(() => (colorBy === 'OVERALL' ? (f) => f.overallRiskLevel : (f) => f.latestRisks?.[colorBy]?.level || null), [colorBy]);
  const farms = useMemo(() => {
    const all = q.data?.farms || [];
    return all
      .filter((f) => !level || levelOf(f) === level)
      .sort((a, b) => levelRank(levelOf(b)) - levelRank(levelOf(a)) || a.farmCode.localeCompare(b.farmCode));
  }, [q.data, level, levelOf]);

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="map-colorby">{t('extension.shared.filters.colorBy')}</label>
          <select id="map-colorby" className="input" value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
            <option value="OVERALL">{t('extension.shared.filters.overall')}</option>
            {RISK_TYPES.map((rt) => <option key={rt} value={rt}>{t(`risk.type.${rt}`)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="map-level">{t('extension.shared.filters.riskLevel')}</label>
          <select id="map-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">{t('extension.shared.filters.allLevels')}</option>
            {RISK_LEVELS.map((l) => <option key={l} value={l}>{t(`risk.levelLong.${l}`)}</option>)}
          </select>
        </div>
        {showCooperative && (
          <div>
            <label className="label" htmlFor="map-coop">{t('common.cooperative')}</label>
            <select id="map-coop" className="input" value={cooperativeId} onChange={(e) => setCooperativeId(e.target.value)}>
              <option value="">{t('extension.shared.filters.allCooperatives')}</option>
              {(coops.data?.cooperatives || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden p-2">
            <FarmMap key={`${cooperativeId}-${level}`} farms={farms} height="min(70vh, 640px)" linkTo={(f) => `${base}/farms/${f.id}`} colorBy={colorBy === 'OVERALL' ? undefined : levelOf} />
            <p className="px-1 pt-1 text-xs text-slate-500">
              {t('extension.shared.map.coloredBy', { what: colorBy === 'OVERALL' ? t('extension.shared.filters.overall') : t(`risk.type.${colorBy}`) })}
            </p>
          </Card>
          <Card className="flex max-h-[min(78vh,720px)] flex-col">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="font-semibold text-slate-900">{t('extension.shared.map.listTitle')}</h2>
              <p className="text-xs text-slate-500">{t('extension.shared.farmsCount', { n: farms.length })}</p>
            </div>
            {farms.length === 0 ? <div className="p-3"><EmptyState icon={MapPin} title={t('extension.shared.noFarms')} /></div> : (
              <ul className="divide-y divide-slate-100 overflow-y-auto">
                {farms.map((f) => {
                  const lvl = levelOf(f);
                  const prob = colorBy === 'OVERALL' ? null : f.latestRisks?.[colorBy]?.probability;
                  return (
                    <li key={f.id}>
                      <Link to={`${base}/farms/${f.id}`} className="flex items-start justify-between gap-2 px-4 py-2.5 hover:bg-ocean-50/60">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{f.farmCode} · {f.name}</p>
                          <p className="truncate text-xs text-slate-500">{f.farmer?.fullName || '—'}{f.location?.locationName ? ` · ${f.location.locationName}` : ''}</p>
                          {f.isDemo && <div className="mt-1"><DemoBadge /></div>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5">
                          <RiskBadge level={lvl} />
                          {prob != null && <span className="text-xs text-slate-500">{pct(prob)}</span>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
