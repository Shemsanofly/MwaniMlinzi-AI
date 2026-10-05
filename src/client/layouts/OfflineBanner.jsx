import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/** Shown while the device has no connection: saved information stays visible, new records wait. */
export default function OfflineBanner() {
  const { t } = useI18n();
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-slate-800 px-3 py-2 text-center text-sm font-medium text-white">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>{t('offline.banner')}</span>
    </div>
  );
}
