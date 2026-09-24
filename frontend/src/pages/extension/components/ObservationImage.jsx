import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { uploadApi } from '../../../api/endpoints.js';
import { Modal, Spinner } from '../../../components/ui/index.jsx';

/** Protected observation photo: fetched with the auth header as a blob, shown as a thumbnail that opens larger. */
export default function ObservationImage({ imageId, alt }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['upload', imageId], queryFn: () => uploadApi.imageUrl(imageId), enabled: !!imageId, staleTime: Infinity, gcTime: 10 * 60 * 1000 });
  if (!imageId) return null;
  if (q.isLoading) return <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100"><Spinner /></div>;
  if (q.error) return <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 text-slate-400" title={t('extension.shared.imageError')}><ImageOff className="h-5 w-5" aria-label={t('extension.shared.imageError')} /></div>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400" aria-label={t('extension.shared.viewPhoto')}>
        <img src={q.data} alt={alt} className="h-20 w-20 object-cover" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={alt || t('extension.shared.viewPhoto')} size="lg">
        <img src={q.data} alt={alt} className="mx-auto max-h-[70vh] rounded-lg" />
      </Modal>
    </>
  );
}
