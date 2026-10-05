import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { PageHeader } from '../../components/ui/index.jsx';
import RecordBookView from '../../components/records/RecordBookView.jsx';
import { FarmGate, FarmSwitcher } from './components/shared.jsx';

/** Farmer record book: sales, costs, work and profit per planting (deck slide 2: most farmers keep no records). */
export default function RecordBookPage() {
  const { t } = useI18n();
  const ff = useFarmerFarm();
  return (
    <div>
      <PageHeader title={t('records.title')} subtitle={t('records.subtitle')} />
      {ff.farm ? (
        <div>
          <FarmSwitcher ff={ff} />
          <RecordBookView farmId={ff.farmId} />
        </div>
      ) : <FarmGate ff={ff} />}
    </div>
  );
}
