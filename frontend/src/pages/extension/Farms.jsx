import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useStaffBase } from './components/common.jsx';
import { FarmListPage } from './components/FarmsTable.jsx';

export default function ExtensionFarms() {
  const { t } = useI18n();
  const base = useStaffBase();
  return <FarmListPage base={base} showCooperative title={t('extension.farms.title')} subtitle={t('extension.farms.subtitle')} />;
}
