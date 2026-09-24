import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CheckCircle2, MapPin, Pencil, Plus, Sprout } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { farmApi } from '../../api/endpoints.js';
import { Badge, Button, Card, CardHeader, DemoBadge, EmptyState, ErrorState, Field, FormError, Modal, Notice, PageHeader, PageLoader } from '../../components/ui/index.jsx';
import FarmMap from '../../components/map/FarmMap.jsx';
import { date as fmtDate, isoDate, num } from '../../utils/format.js';
import { FarmSwitcher, SectionTitle, numOrNull, useInvalidateFarm } from './components/shared.jsx';
import FarmForm from './components/FarmForm.jsx';

export default function FarmPage() {
  const { t } = useI18n();
  const ff = useFarmerFarm();
  const [adding, setAdding] = useState(false);

  if (ff.isLoading) return <PageLoader />;
  if (ff.error && !ff.farm) return <ErrorState error={ff.error} onRetry={ff.refetch} />;

  if (!ff.farm) {
    return (
      <div>
        <PageHeader title={t('farmer.farm.firstTitle')} subtitle={t('farmer.farm.firstSubtitle')} />
        <Card className="p-4"><CreateFarm ff={ff} /></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('farmer.farm.title')} actions={<Button variant="secondary" icon={Plus} className="min-h-11" onClick={() => setAdding(true)}>{t('farmer.farm.addFarm')}</Button>} />
      <FarmSwitcher ff={ff} />
      <FarmDetails farmId={ff.farmId} />
      <Modal open={adding} onClose={() => setAdding(false)} title={t('farmer.farm.addFarm')} size="lg">
        <CreateFarm ff={ff} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      </Modal>
    </div>
  );
}

function CreateFarm({ ff, onDone, onCancel }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (body) => farmApi.create(body),
    onSuccess: async (data) => {
      await qc.invalidateQueries({ queryKey: ['farms'] });
      ff.selectFarm(data.farm.id);
      onDone?.();
    },
  });
  return <FarmForm onSubmit={(b) => create.mutate(b)} pending={create.isPending} error={create.error} submitLabel={t('farmer.farm.create')} onCancel={onCancel} />;
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-slate-900">{children ?? '—'}</dd>
    </div>
  );
}

function FarmDetails({ farmId }) {
  const { t, lang } = useI18n();
  const invalidate = useInvalidateFarm();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['farm', farmId], queryFn: () => farmApi.get(farmId) });
  const update = useMutation({
    mutationFn: (body) => farmApi.update(farmId, body),
    onSuccess: () => { invalidate(farmId); setEditing(false); },
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const farm = q.data.farm;
  const cycle = farm.currentCycle;
  const past = (farm.plantingCycles || []).filter((c) => c.id !== cycle?.id);
  const species = farm.species ? `${lang === 'sw' ? farm.species.commonNameSw : farm.species.commonName} (${farm.species.scientificName})` : null;

  return (
    <div>
      {update.isSuccess && !editing && <Notice tone="success" icon={CheckCircle2} className="mb-3">{t('farmer.farm.updated')}</Notice>}
      <Card>
        <CardHeader icon={Sprout} title={`${farm.name}`} subtitle={farm.farmCode}
          action={<Button variant="secondary" size="sm" icon={Pencil} className="min-h-11" onClick={() => { update.reset(); setEditing(true); }}>{t('actions.edit')}</Button>} />
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-2 pt-3">
            {farm.isDemo && <DemoBadge label={t('common.demoFarm')} />}
            <Badge className="bg-ocean-50 text-ocean-800 ring-ocean-200">{t(`farmer.enums.farmStatus.${farm.status}`)}</Badge>
          </div>
          <dl className="divide-y divide-slate-100">
            <Row label={t('farmer.farm.f.code')}>{farm.farmCode}</Row>
            <Row label={t('common.cooperative')}>{farm.cooperative ? `${farm.cooperative.name} (${farm.cooperative.code})` : t('common.none')}</Row>
            <Row label={t('farmer.farm.f.species')}>{species}</Row>
            <Row label={t('farmer.farm.f.method')}>{t(`farmer.enums.method.${farm.farmingMethod}`)}</Row>
            <Row label={t('farmer.farm.f.exposure')}>{t(`farmer.enums.exposure.${farm.exposure}`)}</Row>
            <Row label={t('farmer.farm.f.anchoring')}>{t(`farmer.enums.anchoring.${farm.anchoringMethod}`)}</Row>
            <Row label={t('farmer.farm.f.area')}>{farm.areaHectares != null ? `${num(farm.areaHectares, 2)} ha` : null}</Row>
            <Row label={t('farmer.farm.f.lines')}>{farm.lineCount}</Row>
            <Row label={t('farmer.farm.f.locationName')}>{farm.location?.locationName}</Row>
            <Row label={t('common.district')}>{farm.location?.district}</Row>
            <Row label={t('farmer.farm.f.region')}>{farm.location?.region}</Row>
            <Row label={t('farmer.farm.coords')}>{farm.location ? `${num(farm.location.latitude, 5)}, ${num(farm.location.longitude, 5)}` : null}</Row>
            {farm.notes && <Row label={t('common.notes')}>{farm.notes}</Row>}
          </dl>
        </div>
      </Card>

      {farm.location && (
        <>
          <SectionTitle>{t('farmer.farm.map')}</SectionTitle>
          <Card className="overflow-hidden">
            <FarmMap farms={[farm]} height={240} />
            <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" aria-hidden />{farm.location.locationName}{farm.isDemo ? ` · ${t('farmer.farm.demoLocation')}` : ''}</p>
          </Card>
        </>
      )}

      <SectionTitle>{t('farmer.farm.currentCycle')}</SectionTitle>
      {cycle ? (
        <Card className="p-4">
          <dl className="grid grid-cols-2 gap-3">
            <div><dt className="text-xs text-slate-500">{t('common.plantingDate')}</dt><dd className="font-bold text-slate-900">{fmtDate(cycle.plantingDate, lang)}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('common.expectedHarvest')}</dt><dd className="font-bold text-slate-900">{fmtDate(cycle.expectedHarvestDate, lang)}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('farmer.farm.f.linesPlanted')}</dt><dd className="font-bold text-slate-900">{cycle.linesPlanted}</dd></div>
            <div><dt className="text-xs text-slate-500">{t('common.cropAge')}</dt><dd className="font-bold text-slate-900">{cycle.cropAgeDays != null ? t('common.days', { n: cycle.cropAgeDays }) : '—'}</dd></div>
          </dl>
          <Notice tone="info" className="mt-3">
            {t('farmer.farm.cycleActive')} <Link to="/farmer/harvest" className="font-semibold underline">{t('actions.recordHarvest')}</Link>
          </Notice>
        </Card>
      ) : <CycleForm farmId={farmId} />}

      <SectionTitle>{t('farmer.farm.pastCycles')}</SectionTitle>
      {past.length ? (
        <ul className="space-y-2">
          {past.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-semibold text-slate-900">{fmtDate(c.plantingDate, lang)} → {fmtDate(c.expectedHarvestDate, lang)}</p>
                  <p className="text-sm text-slate-600">{t('farmer.farm.linesN', { n: c.linesPlanted })}</p>
                </div>
                <Badge>{t(`farmer.enums.cycleStatus.${c.status}`)}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t('farmer.farm.noPastCycles')} />}

      <Modal open={editing} onClose={() => setEditing(false)} title={t('farmer.farm.editTitle')} size="lg">
        <FarmForm farm={farm} onSubmit={(b) => update.mutate(b)} pending={update.isPending} error={update.error} submitLabel={t('actions.save')} onCancel={() => setEditing(false)} />
      </Modal>
    </div>
  );
}

function CycleForm({ farmId }) {
  const { t } = useI18n();
  const invalidate = useInvalidateFarm();
  const [f, setF] = useState({ plantingDate: isoDate(), expectedHarvestDate: '', linesPlanted: '', seedQuantityKg: '', notes: '' });
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const start = useMutation({
    mutationFn: () => farmApi.startCycle(farmId, {
      plantingDate: f.plantingDate,
      ...(f.expectedHarvestDate ? { expectedHarvestDate: f.expectedHarvestDate } : {}),
      linesPlanted: Number(f.linesPlanted),
      seedQuantityKg: numOrNull(f.seedQuantityKg),
      notes: f.notes.trim() || null,
    }),
    onSuccess: () => invalidate(farmId),
  });
  return (
    <Card>
      <CardHeader icon={CalendarPlus} title={t('farmer.farm.recordPlanting')} subtitle={t('farmer.farm.noCycle')} />
      <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); start.mutate(); }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('common.plantingDate')} htmlFor="c-date" required>
            <input id="c-date" type="date" className="input" required max={isoDate()} value={f.plantingDate} onChange={(e) => set({ plantingDate: e.target.value })} />
          </Field>
          <Field label={t('common.expectedHarvest')} htmlFor="c-exp" hint={t('farmer.farm.expectedHint')}>
            <input id="c-exp" type="date" className="input" min={f.plantingDate || undefined} value={f.expectedHarvestDate} onChange={(e) => set({ expectedHarvestDate: e.target.value })} />
          </Field>
          <Field label={t('farmer.farm.f.linesPlanted')} htmlFor="c-lines" required>
            <input id="c-lines" type="number" inputMode="numeric" min={1} className="input" required value={f.linesPlanted} onChange={(e) => set({ linesPlanted: e.target.value })} />
          </Field>
          <Field label={t('farmer.farm.f.seedKg')} htmlFor="c-seed">
            <input id="c-seed" type="number" inputMode="decimal" min={0} className="input" value={f.seedQuantityKg} onChange={(e) => set({ seedQuantityKg: e.target.value })} />
          </Field>
        </div>
        <Field label={t('common.notes')} htmlFor="c-notes">
          <textarea id="c-notes" rows={2} maxLength={2000} className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <FormError error={start.error} />
        {start.isSuccess && <Notice tone="success" icon={CheckCircle2}>{t('farmer.farm.plantingSaved')}</Notice>}
        <Button type="submit" size="lg" variant="success" className="min-h-14 w-full" loading={start.isPending}>{t('farmer.farm.recordPlanting')}</Button>
      </form>
    </Card>
  );
}
