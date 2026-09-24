import { useI18n } from '../../i18n/I18nProvider.jsx';
import { FarmListPage } from './components/FarmsTable.jsx';

export default function ExtensionFarms() {
  const { t } = useI18n();
  return <FarmListPage base="/extension" showCooperative title={t('extension.farms.title')} subtitle={t('extension.farms.subtitle')} />;
}
