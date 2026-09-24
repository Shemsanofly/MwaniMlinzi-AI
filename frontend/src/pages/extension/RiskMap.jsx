import { useI18n } from '../../i18n/I18nProvider.jsx';
import MapExplorer from './components/MapExplorer.jsx';

export default function ExtensionRiskMap() {
  const { t } = useI18n();
  return <MapExplorer base="/extension" showCooperative title={t('extension.riskMap.title')} subtitle={t('extension.riskMap.subtitle')} />;
}
