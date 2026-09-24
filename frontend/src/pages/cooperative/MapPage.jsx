import { useI18n } from '../../i18n/I18nProvider.jsx';
import MapExplorer from '../extension/components/MapExplorer.jsx';

export default function CooperativeMap() {
  const { t } = useI18n();
  return <MapExplorer base="/cooperative" title={t('coop.map.title')} subtitle={t('coop.map.subtitle')} />;
}
