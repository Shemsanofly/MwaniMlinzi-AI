import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { NotebookPen } from 'lucide-react';
import { recordsApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Card, CardHeader } from '../ui/index.jsx';
import { tsh } from './RecordBookView.jsx';

/** Dashboard card: this season's income, costs and profit from the farmer's own records. */
export default function SeasonCard({ farmId }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['records', 'summary', farmId, undefined], queryFn: () => recordsApi.summary(farmId, { cycleId: undefined }), enabled: !!farmId });
  const s = q.data?.summary;
  if (!s) return null;
  const empty = !s.counts.sales && !s.counts.costs;
  return (
    <Card className="mt-4 p-4" data-testid="season-card">
      <CardHeader title={t('records.season.title')} subtitle={t('records.fromRecords')} icon={NotebookPen} />
      {empty ? <p className="mt-2 text-sm text-slate-600">{t('records.season.none')}</p> : (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center [overflow-wrap:anywhere]">
          <div className="min-w-0 rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">{t('records.income')}</p><p className="font-bold tabular-nums">{tsh(s.incomeTzs)}</p></div>
          <div className="min-w-0 rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">{t('records.costs')}</p><p className="font-bold tabular-nums">{tsh(s.costsTzs)}</p></div>
          <div className="min-w-0 rounded-lg bg-slate-50 p-2">
            <p className="text-xs text-slate-500">{s.profitTzs < 0 ? t('records.loss') : t('records.profit')}</p>
            <p className={s.profitTzs < 0 ? 'font-bold tabular-nums text-red-700' : 'font-bold tabular-nums text-seaweed-700'}>{tsh(Math.abs(s.profitTzs))}</p>
          </div>
        </div>
      )}
      <Link to="/farmer/records" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-ocean-800 hover:underline">{t('records.season.open')} →</Link>
    </Card>
  );
}
