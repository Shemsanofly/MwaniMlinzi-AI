import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LocateFixed } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { useAuth } from '../../../stores/AuthContext.jsx';
import { metaApi } from '../../../api/endpoints.js';
import { Button, Field, FormError, Notice, apiErrorMessage } from '../../../components/ui/index.jsx';
import { isoDate } from '../../../utils/format.js';
import { numOrNull, numOrUndef } from './shared.jsx';

export const FARMING_METHODS = ['OFF_BOTTOM', 'LONG_LINE', 'RAFT', 'FLOATING_LINE'];
export const EXPOSURES = ['SHELTERED', 'MODERATE', 'EXPOSED'];
export const ANCHORING = ['WOODEN_STAKES', 'CONCRETE_BLOCKS', 'SAND_BAGS', 'ROCKS'];
const STATUSES = ['ACTIVE', 'FALLOW', 'INACTIVE'];

const fromFarm = (farm) => ({
  name: farm?.name || '',
  speciesId: farm?.species?.id || '',
  farmingMethod: farm?.farmingMethod || 'OFF_BOTTOM',
  exposure: farm?.exposure || 'MODERATE',
  anchoringMethod: farm?.anchoringMethod || 'WOODEN_STAKES',
  areaHectares: farm?.areaHectares ?? '',
  lineCount: farm?.lineCount ?? '',
  locationName: farm?.location?.locationName || '',
  district: farm?.location?.district || '',
  region: farm?.location?.region || '',
  latitude: farm?.location?.latitude ?? '',
  longitude: farm?.location?.longitude ?? '',
  cooperativeId: farm?.cooperative?.id || '',
  notes: farm?.notes || '',
  status: farm?.status || 'ACTIVE',
  plantingDate: '',
  linesPlanted: '',
});

/** Create (farm = null) or edit a farm. `onSubmit(body)` returns the mutation promise. */
export default function FarmForm({ farm, onSubmit, pending, error, submitLabel, onCancel }) {
  const { t, lang } = useI18n();
  const { memberships = [] } = useAuth();
  const isEdit = !!farm;
  const [f, setF] = useState(() => fromFarm(farm));
  const [geo, setGeo] = useState({ state: 'idle', message: null });
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const speciesQ = useQuery({ queryKey: ['species'], queryFn: () => metaApi.species(), staleTime: 3600000 });

  const locate = () => {
    if (!navigator.geolocation) { setGeo({ state: 'error', message: t('farmer.farm.geoUnsupported') }); return; }
    setGeo({ state: 'loading', message: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({ latitude: pos.coords.latitude.toFixed(5), longitude: pos.coords.longitude.toFixed(5) });
        setGeo({ state: 'ok', message: t('farmer.farm.geoOk') });
      },
      (err) => setGeo({ state: 'error', message: err.code === 1 ? t('farmer.farm.geoDenied') : t('farmer.farm.geoFailed') }),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const submit = (e) => {
    e.preventDefault();
    const body = {
      name: f.name.trim(),
      speciesId: f.speciesId,
      farmingMethod: f.farmingMethod,
      exposure: f.exposure,
      anchoringMethod: f.anchoringMethod,
      areaHectares: numOrNull(f.areaHectares),
      lineCount: numOrUndef(f.lineCount) ?? 0,
      locationName: f.locationName.trim(),
      district: f.district.trim(),
      region: f.region.trim(),
      latitude: Number(f.latitude),
      longitude: Number(f.longitude),
      cooperativeId: f.cooperativeId || null,
      notes: f.notes.trim() || null,
    };
    if (isEdit) body.status = f.status;
    if (!isEdit && f.plantingDate) {
      body.plantingDate = f.plantingDate;
      if (f.linesPlanted !== '') body.linesPlanted = Number(f.linesPlanted);
    }
    onSubmit(body);
  };

  const coopOptions = farm?.cooperative && !memberships.some((m) => m.id === farm.cooperative.id) ? [...memberships, farm.cooperative] : memberships;
  const opt = (group, list) => list.map((v) => <option key={v} value={v}>{t(`farmer.enums.${group}.${v}`)}</option>);

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('farmer.farm.f.name')} htmlFor="ff-name" required>
          <input id="ff-name" className="input" required maxLength={120} value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t('farmer.farm.f.species')} htmlFor="ff-species" required error={speciesQ.error ? apiErrorMessage(speciesQ.error, t, lang) : undefined}>
          <select id="ff-species" className="input" required value={f.speciesId} onChange={(e) => set({ speciesId: e.target.value })} disabled={speciesQ.isLoading}>
            <option value="">{speciesQ.isLoading ? t('actions.loading') : t('farmer.farm.choose')}</option>
            {(speciesQ.data?.species || []).map((s) => <option key={s.id} value={s.id}>{lang === 'sw' ? s.commonNameSw : s.commonName} — {s.scientificName}</option>)}
          </select>
        </Field>
        <Field label={t('farmer.farm.f.method')} htmlFor="ff-method" required>
          <select id="ff-method" className="input" value={f.farmingMethod} onChange={(e) => set({ farmingMethod: e.target.value })}>{opt('method', FARMING_METHODS)}</select>
        </Field>
        <Field label={t('farmer.farm.f.exposure')} htmlFor="ff-exp" required>
          <select id="ff-exp" className="input" value={f.exposure} onChange={(e) => set({ exposure: e.target.value })}>{opt('exposure', EXPOSURES)}</select>
        </Field>
        <Field label={t('farmer.farm.f.anchoring')} htmlFor="ff-anchor" required>
          <select id="ff-anchor" className="input" value={f.anchoringMethod} onChange={(e) => set({ anchoringMethod: e.target.value })}>{opt('anchoring', ANCHORING)}</select>
        </Field>
        <Field label={t('farmer.farm.f.cooperative')} htmlFor="ff-coop">
          <select id="ff-coop" className="input" value={f.cooperativeId} onChange={(e) => set({ cooperativeId: e.target.value })}>
            <option value="">{t('common.none')}</option>
            {coopOptions.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
          </select>
        </Field>
        <Field label={t('farmer.farm.f.area')} htmlFor="ff-area">
          <input id="ff-area" type="number" inputMode="decimal" min={0} step="0.01" className="input" value={f.areaHectares} onChange={(e) => set({ areaHectares: e.target.value })} />
        </Field>
        <Field label={t('farmer.farm.f.lines')} htmlFor="ff-lines">
          <input id="ff-lines" type="number" inputMode="numeric" min={0} step="1" className="input" value={f.lineCount} onChange={(e) => set({ lineCount: e.target.value })} />
        </Field>
        {isEdit && (
          <Field label={t('common.status')} htmlFor="ff-status" required>
            <select id="ff-status" className="input" value={f.status} onChange={(e) => set({ status: e.target.value })}>{opt('farmStatus', STATUSES)}</select>
          </Field>
        )}
      </div>

      <fieldset className="space-y-4 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-sm font-bold text-slate-700">{t('farmer.farm.location')}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('farmer.farm.f.locationName')} htmlFor="ff-loc" required>
            <input id="ff-loc" className="input" required maxLength={120} value={f.locationName} onChange={(e) => set({ locationName: e.target.value })} />
          </Field>
          <Field label={t('common.district')} htmlFor="ff-district" required>
            <input id="ff-district" className="input" required maxLength={80} value={f.district} onChange={(e) => set({ district: e.target.value })} />
          </Field>
          <Field label={t('farmer.farm.f.region')} htmlFor="ff-region" required>
            <input id="ff-region" className="input" required maxLength={80} value={f.region} onChange={(e) => set({ region: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('farmer.farm.f.lat')} htmlFor="ff-lat" required>
            <input id="ff-lat" type="number" inputMode="decimal" step="any" min={-90} max={90} className="input" required value={f.latitude} onChange={(e) => set({ latitude: e.target.value })} />
          </Field>
          <Field label={t('farmer.farm.f.lng')} htmlFor="ff-lng" required>
            <input id="ff-lng" type="number" inputMode="decimal" step="any" min={-180} max={180} className="input" required value={f.longitude} onChange={(e) => set({ longitude: e.target.value })} />
          </Field>
        </div>
        <Button variant="secondary" icon={LocateFixed} className="min-h-11" loading={geo.state === 'loading'} onClick={locate}>{t('farmer.farm.useLocation')}</Button>
        {geo.message && <Notice tone={geo.state === 'ok' ? 'success' : 'warning'}>{geo.message}</Notice>}
      </fieldset>

      {!isEdit && (
        <fieldset className="space-y-4 rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-bold text-slate-700">{t('farmer.farm.plantingOptional')}</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.plantingDate')} htmlFor="ff-pdate">
              <input id="ff-pdate" type="date" className="input" max={isoDate()} value={f.plantingDate} onChange={(e) => set({ plantingDate: e.target.value })} />
            </Field>
            <Field label={t('farmer.farm.f.linesPlanted')} htmlFor="ff-lplanted">
              <input id="ff-lplanted" type="number" inputMode="numeric" min={1} className="input" value={f.linesPlanted} disabled={!f.plantingDate} onChange={(e) => set({ linesPlanted: e.target.value })} />
            </Field>
          </div>
        </fieldset>
      )}

      <Field label={t('common.notes')} htmlFor="ff-notes">
        <textarea id="ff-notes" rows={2} maxLength={2000} className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      <FormError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="ghost" className="min-h-11" onClick={onCancel}>{t('actions.cancel')}</Button>}
        <Button type="submit" size="lg" className="min-h-12" loading={pending}>{submitLabel}</Button>
      </div>
    </form>
  );
}
