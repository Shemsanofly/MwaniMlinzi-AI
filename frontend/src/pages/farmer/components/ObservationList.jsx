import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, MessageSquareText } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { farmApi, uploadApi } from '../../../api/endpoints.js';
import { Badge, Card, EmptyState, ErrorState, Spinner, cx } from '../../../components/ui/index.jsx';
import { dateTime } from '../../../utils/format.js';

/** Protected image thumbnail — fetched with auth as an object URL and revoked on unmount. */
export function ImageThumb({ id, alt }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl = null;
    uploadApi.imageUrl(id)
      .then((u) => { objectUrl = u; if (alive) setUrl(u); else URL.revokeObjectURL(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  if (failed) return <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100"><ImageOff className="h-5 w-5 text-slate-400" aria-hidden /></div>;
  if (!url) return <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100"><Spinner className="h-4 w-4" /></div>;
  return <img src={url} alt={alt} className="h-16 w-16 shrink-0 rounded-lg object-cover" />;
}

const REVIEW_TONE = {
  PENDING: 'bg-slate-100 text-slate-700 ring-slate-200',
  REVIEWED: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
  FLAGGED: 'bg-amber-50 text-amber-800 ring-amber-300',
};
const COND_TONE = { GOOD: 'text-seaweed-700', FAIR: 'text-amber-700', POOR: 'text-red-700' };

export default function ObservationList({ farmId }) {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['observations', farmId], queryFn: () => farmApi.observations(farmId) });
  if (q.isLoading) return <div className="flex justify-center p-6"><Spinner /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} compact />;
  const list = q.data?.observations || [];
  if (!list.length) return <EmptyState title={t('farmer.obs.noPast')} />;
  return (
    <ul className="space-y-2.5">
      {list.map((o) => {
        const signs = [
          o.whitening && t('farmer.obs.sign.whitening'),
          o.breakage && t('farmer.obs.sign.breakage'),
          o.unusualGrowth && t('farmer.obs.sign.unusualGrowth'),
          o.epiphytes && t('farmer.obs.sign.epiphytes'),
          o.diseaseSymptoms && t('farmer.obs.sign.disease'),
        ].filter(Boolean);
        return (
          <li key={o.id}>
            <Card className="flex gap-3 p-3">
              {o.image?.id && <ImageThumb id={o.image.id} alt={t('farmer.obs.photoAlt')} />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cx('font-semibold', COND_TONE[o.cropCondition])}>{t(`farmer.enums.cropCondition.${o.cropCondition}`)}</p>
                  <Badge className={REVIEW_TONE[o.reviewStatus]}>{t(`farmer.enums.reviewStatus.${o.reviewStatus}`)}</Badge>
                  {o.percentAffected != null && <span className="text-xs text-slate-500">{t('farmer.obs.affected', { n: o.percentAffected })}</span>}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{signs.length ? signs.join(' · ') : t('farmer.obs.noSigns')}</p>
                <p className="mt-0.5 text-xs text-slate-500">{dateTime(o.observedAt, lang)}{o.reporter?.fullName ? ` · ${o.reporter.fullName}` : ''}</p>
                {o.notes && <p className="mt-1 text-sm text-slate-700">{o.notes}</p>}
                {o.reviewNote && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-ocean-50 px-2 py-1.5 text-sm text-ocean-900">
                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span><strong>{o.reviewedBy?.fullName || t('farmer.obs.reviewer')}:</strong> {o.reviewNote}</span>
                  </p>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
