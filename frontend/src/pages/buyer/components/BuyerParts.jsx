import { Info, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { Badge, Card, DemoBadge, Notice, Table } from '../../../components/ui/index.jsx';
import { date, num, pct } from '../../../utils/format.js';
import { tonnesText } from '../../extension/components/Portfolio.jsx';

export const GRADE_RANK = { A: 3, B: 2, C: 1, REJECT: 0 };

/** "2.4 tonnes" */
export function useTonnes() {
  const { t } = useI18n();
  return (kgValue) => t('buyer.tonnes', { v: tonnesText(kgValue) });
}

/** Expected supply for the next 7 / 14 / 30 days, in tonnes with range and confidence. */
export function SupplyHorizonCards({ horizons }) {
  const { t } = useI18n();
  const fmtT = useTonnes();
  const items = [['next7Days', 7], ['next14Days', 14], ['next30Days', 30]];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([k, n]) => {
        const h = horizons?.[k] || {};
        return (
          <Card key={k} className="p-4" data-testid={`horizon-${n}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('buyer.cards.nextDays', { n })}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{fmtT(h.riskAdjustedKg)}</p>
            <p className="text-sm font-medium text-slate-700">{t('buyer.cards.range', { low: tonnesText(h.lowKg), high: tonnesText(h.highKg) })}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <span>{t('risk.confidence')}: <b className="text-slate-700">{h.avgConfidence != null ? pct(h.avgConfidence) : '—'}</b></span>
              <span>{t('buyer.cards.lots', { n: h.farms ?? 0 })}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function UncertaintyNote({ note }) {
  const { t } = useI18n();
  return (
    <Notice tone="warning" icon={Info}>
      <p className="font-semibold">{t('buyer.uncertainty.title')}</p>
      <p>{t('buyer.uncertainty.body')}</p>
      {note && <p className="mt-1 text-xs">{note}</p>}
    </Notice>
  );
}

export function PrivacyNote() {
  const { t } = useI18n();
  return <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-seaweed-600" aria-hidden />{t('buyer.privacy')}</p>;
}

/**
 * Posted demand vs forecast supply: supply lots expected on or before `neededBy`
 * whose expected grade meets the minimum grade (and species, when set).
 */
export function DemandVsSupply({ demand = [], supply = [] }) {
  const { t, lang } = useI18n();
  const fmtT = useTonnes();
  const rows = demand.map((d) => {
    const eligible = supply.filter((s) => new Date(s.expectedHarvestDate) <= new Date(d.neededBy)
      && (!d.minimumGrade || (GRADE_RANK[s.expectedGrade] ?? 0) >= GRADE_RANK[d.minimumGrade])
      && (!d.species?.commonName || !s.species || s.species === d.species.commonName));
    const sum = (k) => eligible.reduce((a, s) => a + (s[k] || 0), 0);
    return { ...d, ra: sum('riskAdjustedQuantityKg'), low: sum('lowQuantityKg'), high: sum('highQuantityKg'), lots: eligible.length };
  });
  const columns = [
    { key: 'need', header: t('buyer.demand.neededBy'), render: (d) => <span className="whitespace-nowrap">{date(d.neededBy, lang)}</span> },
    { key: 'what', header: t('buyer.demand.what'), render: (d) => <span>{d.species?.commonName || t('buyer.demand.anySpecies')}{d.minimumGrade && <Badge className="ml-1">{t('buyer.demand.gradeMin', { g: d.minimumGrade })}</Badge>}</span> },
    { key: 'qty', header: t('buyer.demand.quantity'), className: 'text-right', render: (d) => <b>{fmtT(d.quantityKg)}</b> },
    { key: 'supply', header: t('buyer.demand.forecastSupply'), className: 'text-right', render: (d) => <span className="whitespace-nowrap">{fmtT(d.ra)}<span className="block text-xs text-slate-500">{tonnesText(d.low)}–{tonnesText(d.high)} t · {t('buyer.cards.lots', { n: d.lots })}</span></span> },
    {
      key: 'cover',
      header: t('buyer.demand.coverage'),
      render: (d) => {
        const c = d.quantityKg ? d.ra / d.quantityKg : 0;
        const tone = d.low >= d.quantityKg ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : d.high >= d.quantityKg ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-red-50 text-red-800 ring-red-200';
        const label = d.low >= d.quantityKg ? t('buyer.demand.likely') : d.high >= d.quantityKg ? t('buyer.demand.possible') : t('buyer.demand.short');
        return <div className="min-w-32"><Badge className={tone}>{label}</Badge><div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-ocean-600" style={{ width: `${Math.min(100, c * 100)}%` }} /></div><span className="text-xs text-slate-500">{pct(c)}</span></div>;
      },
    },
    { key: 'price', header: t('buyer.demand.price'), className: 'text-right', render: (d) => (d.pricePerKg != null ? `TZS ${num(d.pricePerKg, 0)}` : '—') },
    { key: 'status', header: t('common.status'), render: (d) => <Badge>{t(`buyer.demand.status.${d.status}`)}</Badge> },
  ];
  return (
    <div className="space-y-2">
      <Table columns={columns} rows={rows} />
      <p className="text-xs text-slate-500">{t('buyer.demand.coverageNote')}</p>
    </div>
  );
}

export function DemoSupplyNote({ supply = [] }) {
  const { t } = useI18n();
  if (!supply.some((s) => s.isDemo)) return null;
  return <Notice tone="demo"><span className="inline-flex flex-wrap items-center gap-2"><DemoBadge />{t('buyer.demoNote')}</span></Notice>;
}
