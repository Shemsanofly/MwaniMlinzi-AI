import { useI18n } from '../../i18n/I18nProvider.jsx';
import { FarmListPage } from '../extension/components/FarmsTable.jsx';

export default function CooperativeFarms() {
  const { t } = useI18n();
  return <FarmListPage base="/cooperative" title={t('coop.farms.title')} subtitle={t('coop.farms.subtitle')} />;
}
