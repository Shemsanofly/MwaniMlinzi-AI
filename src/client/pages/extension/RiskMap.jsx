import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useStaffBase } from './components/common.jsx';
import MapExplorer from './components/MapExplorer.jsx';

export default function ExtensionRiskMap() {
  const { t } = useI18n();
  const base = useStaffBase();
  return <MapExplorer base={base} showCooperative title={t('extension.riskMap.title')} subtitle={t('extension.riskMap.subtitle')} />;
}
