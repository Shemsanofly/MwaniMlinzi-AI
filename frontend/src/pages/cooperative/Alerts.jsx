import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellOff } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { alertApi } from '../../api/endpoints.js';
import { EmptyState, ErrorState, Notice, PageHeader, PageLoader, Toggle } from '../../components/ui/index.jsx';
import { RISK_LEVELS } from '../../utils/risk.js';
import { AlertList, useStaffBase } from '../extension/components/common.jsx';

const STATUSES = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'];
const TYPES = ['HEAT_HIGH', 'HEAT_CRITICAL', 'STORM_HIGH', 'STORM_CRITICAL', 'POOR_GROWTH', 'HARVEST_WINDOW', 'MISSING_REPORT', 'RISK_CHANGE'];

export default function CooperativeAlerts() {
  const { t } = useI18n();
  const base = useStaffBase();
  const [status, setStatus] = useState('ACTIVE,ACKNOWLEDGED');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [includeSim, setIncludeSim] = useState(false);
  const params = useMemo(() => ({ status, severity, type, includeSimulation: includeSim ? 'true' : undefined }), [status, severity, type, includeSim]);
  const q = useQuery({ queryKey: ['alerts', params], queryFn: () => alertApi.list(params), placeholderData: (p) => p });
  const alerts = q.data?.alerts || [];

  return (
    <div>
      <PageHeader title={t('coop.alerts.title')} subtitle={t('coop.alerts.subtitle')} />
      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <div>
          <label className="label" htmlFor="al-status">{t('common.status')}</label>
          <select id="al-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE,ACKNOWLEDGED">{t('coop.alerts.open')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`extension.shared.alertStatus.${s}`)}</option>)}
            <option value="">{t('common.all')}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="al-sev">{t('coop.alerts.severity')}</label>
          <select id="al-sev" className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {RISK_LEVELS.map((l) => <option key={l} value={l}>{t(`risk.level.${l}`)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="al-type">{t('coop.alerts.type')}</label>
          <select id="al-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {TYPES.map((ty) => <option key={ty} value={ty}>{t(`extension.shared.alertType.${ty}`)}</option>)}
          </select>
        </div>
        <div className="pb-2">
          <Toggle id="al-sim" checked={includeSim} onChange={setIncludeSim} label={t('coop.alerts.includeSimulations')} />
        </div>
      </div>
      {includeSim && <Notice tone="demo" className="mb-4">{t('coop.alerts.simulationNote')}</Notice>}
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : alerts.length === 0 ? (
        <EmptyState icon={BellOff} title={t('extension.shared.alerts.empty')} message={t('coop.alerts.emptyHint')} />
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500" aria-live="polite">{t('coop.alerts.count', { n: alerts.length })}</p>
          <AlertList alerts={alerts} base={base} />
        </>
      )}
    </div>
  );
}
