import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { farmApi } from '../../api/endpoints.js';
import { PageHeader, cx } from '../../components/ui/index.jsx';
import { FarmGate, FarmSwitcher } from './components/shared.jsx';
import ObservationWizard from './components/ObservationWizard.jsx';
import ObservationList from './components/ObservationList.jsx';

export default function ObservationsPage() {
  const { t } = useI18n();
  const ff = useFarmerFarm();
  return (
    <div>
      <PageHeader title={t('farmer.obs.title')} subtitle={t('farmer.obs.subtitle')} />
      {ff.farm ? <ObservationsBody ff={ff} /> : <FarmGate ff={ff} />}
    </div>
  );
}

function ObservationsBody({ ff }) {
  const { t } = useI18n();
  const { farmId } = ff;
  const [tab, setTab] = useState('new');
  const [wizardKey, setWizardKey] = useState(0);
  // Current risk, kept so the result screen can highlight level changes after submission.
  const risksQ = useQuery({ queryKey: ['risks', farmId], queryFn: () => farmApi.risks(farmId) });

  const tabs = [{ id: 'new', label: t('farmer.obs.tabNew') }, { id: 'past', label: t('farmer.obs.tabPast') }];
  return (
    <div>
      <FarmSwitcher ff={ff} />
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {tabs.map((tb) => (
          <button key={tb.id} type="button" role="tab" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)}
            className={cx('min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition', tab === tb.id ? 'bg-white text-ocean-800 shadow-sm' : 'text-slate-600')}>
            {tb.label}
          </button>
        ))}
      </div>
      {tab === 'new'
        ? <ObservationWizard key={`${farmId}-${wizardKey}`} farmId={farmId} previousPredictions={risksQ.data?.predictions} onRecordAnother={() => setWizardKey((k) => k + 1)} />
        : <ObservationList farmId={farmId} />}
    </div>
  );
}
