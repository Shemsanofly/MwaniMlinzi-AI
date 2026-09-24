import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { Button } from '../../../components/ui/index.jsx';

export const EMPTY_FILTERS = { cooperativeId: '', district: '', days: '', from: '', to: '', minQuantityKg: '', grade: '' };

/** Filter form for the buyer forecast endpoint. Applies on submit so every change is not a request. */
export default function SupplyFilters({ value, onApply, options, showDates = true }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value, ...(k === 'days' && e.target.value ? { from: '', to: '' } : {}), ...((k === 'from' || k === 'to') && e.target.value ? { days: '' } : {}) }));
  const submit = (e) => {
    e.preventDefault();
    onApply(draft);
  };
  const reset = () => { setDraft(EMPTY_FILTERS); onApply(EMPTY_FILTERS); };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="label" htmlFor="sf-coop">{t('common.cooperative')}</label>
        <select id="sf-coop" className="input" value={draft.cooperativeId} onChange={set('cooperativeId')}>
          <option value="">{t('common.all')}</option>
          {(options?.cooperatives || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sf-district">{t('common.district')}</label>
        <select id="sf-district" className="input" value={draft.district} onChange={set('district')}>
          <option value="">{t('common.all')}</option>
          {(options?.districts || []).map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sf-grade">{t('buyer.filters.grade')}</label>
        <select id="sf-grade" className="input" value={draft.grade} onChange={set('grade')}>
          <option value="">{t('common.all')}</option>
          {['A', 'B', 'C'].map((g) => <option key={g} value={g}>{t('buyer.grade', { g })}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sf-min">{t('buyer.filters.minKg')}</label>
        <input id="sf-min" type="number" min="0" step="10" inputMode="numeric" className="input" value={draft.minQuantityKg} onChange={set('minQuantityKg')} />
      </div>
      {showDates && (
        <>
          <div>
            <label className="label" htmlFor="sf-days">{t('buyer.filters.window')}</label>
            <select id="sf-days" className="input" value={draft.days} onChange={set('days')}>
              <option value="">{t('buyer.filters.anyTime')}</option>
              {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{t('buyer.cards.nextDays', { n })}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sf-from">{t('buyer.filters.from')}</label>
            <input id="sf-from" type="date" className="input" value={draft.from} onChange={set('from')} />
          </div>
          <div>
            <label className="label" htmlFor="sf-to">{t('buyer.filters.to')}</label>
            <input id="sf-to" type="date" className="input" min={draft.from || undefined} value={draft.to} onChange={set('to')} />
          </div>
        </>
      )}
      <div className="flex items-end gap-2">
        <Button type="submit" icon={Filter} className="flex-1">{t('buyer.filters.apply')}</Button>
        <Button variant="ghost" icon={X} onClick={reset} aria-label={t('buyer.filters.reset')}>{t('buyer.filters.reset')}</Button>
      </div>
    </form>
  );
}
