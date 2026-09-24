import { FlaskConical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { metaApi } from '../api/endpoints.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

/** Shown whenever the backend runs with DEMO_MODE=true. */
export default function DemoBanner() {
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ['health'], queryFn: metaApi.health, staleTime: 5 * 60_000, retry: false });
  if (!data?.demoMode) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-violet-700 px-3 py-1.5 text-center text-xs font-medium text-white">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t('demoNotice')}</span>
    </div>
  );
}
