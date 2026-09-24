import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, ChevronUp, ImagePlus, Trash2 } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { farmApi, uploadApi } from '../../../api/endpoints.js';
import { Button, Card, Field, FormError, Notice, cx } from '../../../components/ui/index.jsx';
import ObservationResult from './ObservationResult.jsx';
import { useInvalidateFarm } from './shared.jsx';

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const GEAR = ['GOOD', 'LOOSE', 'BROKEN', 'MISSING'];
const STEPS = ['condition', 'whitening', 'breakage', 'unusualGrowth', 'details', 'photo', 'review'];

const EMPTY = {
  cropCondition: null, whitening: null, breakage: null, unusualGrowth: null,
  epiphytes: false, diseaseSymptoms: false, percentAffected: null,
  waterAppearance: '', lineCondition: '', anchorCondition: '', confidence: 'MEDIUM', notes: '',
};

/** Build the API body from wizard state — only send optional fields the farmer actually set. */
export function buildObservationBody(form, imageFileId) {
  const body = {
    cropCondition: form.cropCondition,
    whitening: !!form.whitening,
    breakage: !!form.breakage,
    unusualGrowth: !!form.unusualGrowth,
    epiphytes: !!form.epiphytes,
    diseaseSymptoms: !!form.diseaseSymptoms,
    confidence: form.confidence || 'MEDIUM',
  };
  if (form.percentAffected != null) body.percentAffected = Number(form.percentAffected);
  if (form.waterAppearance) body.waterAppearance = form.waterAppearance;
  if (form.lineCondition) body.lineCondition = form.lineCondition;
  if (form.anchorCondition) body.anchorCondition = form.anchorCondition;
  if (form.notes.trim()) body.notes = form.notes.trim();
  if (imageFileId) body.imageFileId = imageFileId;
  return body;
}

function BigChoice({ children, onClick, selected, tone = 'ocean', icon }) {
  const tones = {
    green: 'border-seaweed-500 bg-seaweed-50 text-seaweed-700',
    amber: 'border-amber-500 bg-amber-50 text-amber-800',
    red: 'border-red-600 bg-red-50 text-red-800',
    ocean: 'border-ocean-500 bg-ocean-50 text-ocean-900',
    slate: 'border-slate-400 bg-slate-50 text-slate-800',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cx('flex min-h-20 w-full items-center justify-center gap-3 rounded-2xl border-2 px-4 py-4 text-xl font-bold shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ocean-200',
        tones[tone], selected ? 'ring-4 ring-ocean-300' : 'hover:brightness-95')}
    >
      {icon && <span aria-hidden className="text-2xl">{icon}</span>}
      {children}
    </button>
  );
}

function SmallChoices({ id, label, value, options, onChange, labelFor }) {
  return (
    <fieldset>
      <legend className="label" id={id}>{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(value === o ? '' : o)}
            className={cx('min-h-11 rounded-lg px-3.5 py-2 text-sm font-semibold ring-1 ring-inset transition', value === o ? 'bg-ocean-700 text-white ring-ocean-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
            {labelFor(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function ObservationWizard({ farmId, previousPredictions, onRecordAnother }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const invalidate = useInvalidateFarm();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [showDetails, setShowDetails] = useState(false);
  const [photo, setPhoto] = useState(null); // { file, preview }
  const [photoError, setPhotoError] = useState(null);
  const [result, setResult] = useState(null); // { observation, risk, previous }
  const fileRef = useRef(null);

  // Revoke the local preview URL when it changes or the wizard unmounts.
  useEffect(() => () => { if (photo?.preview) URL.revokeObjectURL(photo.preview); }, [photo]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const choose = (patch) => { set(patch); next(); };

  const submit = useMutation({
    mutationFn: async () => {
      let imageFileId = null;
      if (photo?.file) {
        const up = await uploadApi.image(photo.file);
        imageFileId = up.file.id;
      }
      return farmApi.addObservation(farmId, buildObservationBody(form, imageFileId));
    },
    onSuccess: (data) => {
      setResult({ ...data, previous: previousPredictions || null });
      invalidate(farmId);
    },
  });

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPhotoError(null);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) { setPhotoError(t('farmer.obs.photoType')); return; }
    if (file.size > MAX_BYTES) { setPhotoError(t('farmer.obs.photoSize')); return; }
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };

  const reset = () => {
    setForm(EMPTY); setStep(0); setPhoto(null); setPhotoError(null); setResult(null); setShowDetails(false); submit.reset();
    onRecordAnother?.();
  };

  if (result) {
    return (
      <div className="space-y-4">
        <Notice tone="success" icon={CheckCircle2}>
          <p className="text-base font-bold">{t('farmer.obs.success')}</p>
          <p>{t('farmer.obs.successSub')}</p>
        </Notice>
        <h2 className="text-lg font-bold text-slate-900">{t('farmer.obs.updatedRisk')}</h2>
        <ObservationResult risk={result.risk} previous={result.previous} farmId={farmId} />
        <div className="grid grid-cols-2 gap-2.5">
          <Button size="lg" className="min-h-14" onClick={() => navigate('/farmer/dashboard')}>{t('farmer.obs.done')}</Button>
          <Button size="lg" variant="secondary" className="min-h-14" onClick={reset}>{t('farmer.obs.another')}</Button>
        </div>
      </div>
    );
  }

  const key = STEPS[step];
  const yesNo = (field) => (
    <div className="grid grid-cols-2 gap-3">
      <BigChoice tone="red" selected={form[field] === true} onClick={() => choose({ [field]: true })}>{t('actions.yes')}</BigChoice>
      <BigChoice tone="green" selected={form[field] === false} onClick={() => choose({ [field]: false })}>{t('actions.no')}</BigChoice>
    </div>
  );

  return (
    <Card className="p-4 sm:p-5">
      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
          <span>{t('farmer.obs.stepOf', { n: step + 1, total: STEPS.length })}</span>
          {step > 0 && (
            <button type="button" onClick={back} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-ocean-700 hover:bg-ocean-50">
              <ArrowLeft className="h-4 w-4" aria-hidden />{t('actions.back')}
            </button>
          )}
        </div>
        <div className="mt-1.5 flex gap-1" aria-hidden>
          {STEPS.map((s, i) => <span key={s} className={cx('h-2 flex-1 rounded-full', i <= step ? 'bg-ocean-600' : 'bg-slate-200')} />)}
        </div>
      </div>

      <h2 className="mb-4 text-xl font-bold leading-snug text-slate-900">{t(`farmer.obs.q.${key}`)}</h2>

      {key === 'condition' && (
        <div className="space-y-3">
          <BigChoice tone="green" selected={form.cropCondition === 'GOOD'} onClick={() => choose({ cropCondition: 'GOOD' })}>{t('farmer.enums.cropCondition.GOOD')}</BigChoice>
          <BigChoice tone="amber" selected={form.cropCondition === 'FAIR'} onClick={() => choose({ cropCondition: 'FAIR' })}>{t('farmer.enums.cropCondition.FAIR')}</BigChoice>
          <BigChoice tone="red" selected={form.cropCondition === 'POOR'} onClick={() => choose({ cropCondition: 'POOR' })}>{t('farmer.enums.cropCondition.POOR')}</BigChoice>
        </div>
      )}
      {key === 'whitening' && <><p className="-mt-2 mb-3 text-sm text-slate-500">{t('farmer.obs.hint.whitening')}</p>{yesNo('whitening')}</>}
      {key === 'breakage' && <><p className="-mt-2 mb-3 text-sm text-slate-500">{t('farmer.obs.hint.breakage')}</p>{yesNo('breakage')}</>}
      {key === 'unusualGrowth' && <><p className="-mt-2 mb-3 text-sm text-slate-500">{t('farmer.obs.hint.unusualGrowth')}</p>{yesNo('unusualGrowth')}</>}

      {key === 'details' && (
        <div className="space-y-4">
          <p className="-mt-2 text-sm text-slate-500">{t('farmer.obs.hint.details')}</p>
          <button type="button" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}
            className="flex min-h-12 w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-base font-semibold text-ocean-800 ring-1 ring-slate-200">
            {t('farmer.obs.moreDetails')} {showDetails ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {showDetails && (
            <div className="space-y-4">
              <SmallChoices id="epi" label={t('farmer.obs.f.epiphytes')} value={form.epiphytes ? 'Y' : 'N'} options={['Y', 'N']}
                labelFor={(o) => (o === 'Y' ? t('actions.yes') : t('actions.no'))} onChange={(v) => set({ epiphytes: v === 'Y' })} />
              <SmallChoices id="dis" label={t('farmer.obs.f.disease')} value={form.diseaseSymptoms ? 'Y' : 'N'} options={['Y', 'N']}
                labelFor={(o) => (o === 'Y' ? t('actions.yes') : t('actions.no'))} onChange={(v) => set({ diseaseSymptoms: v === 'Y' })} />
              <Field label={t('farmer.obs.f.percent')} htmlFor="obs-pct" hint={form.percentAffected == null ? t('farmer.obs.f.percentUnset') : null}>
                <div className="flex items-center gap-3">
                  <input id="obs-pct" type="range" min={0} max={100} step={5} value={form.percentAffected ?? 0}
                    onChange={(e) => set({ percentAffected: Number(e.target.value) })} className="h-11 flex-1 accent-ocean-700" />
                  <span className="w-14 text-right text-lg font-bold text-slate-900">{form.percentAffected == null ? '—' : `${form.percentAffected}%`}</span>
                </div>
              </Field>
              <SmallChoices id="water" label={t('farmer.obs.f.water')} value={form.waterAppearance} options={['CLEAR', 'TURBID', 'DISCOLORED']}
                labelFor={(o) => t(`farmer.enums.water.${o}`)} onChange={(v) => set({ waterAppearance: v })} />
              <SmallChoices id="line" label={t('farmer.obs.f.line')} value={form.lineCondition} options={GEAR}
                labelFor={(o) => t(`farmer.enums.gear.${o}`)} onChange={(v) => set({ lineCondition: v })} />
              <SmallChoices id="anchor" label={t('farmer.obs.f.anchor')} value={form.anchorCondition} options={GEAR}
                labelFor={(o) => t(`farmer.enums.gear.${o}`)} onChange={(v) => set({ anchorCondition: v })} />
              <SmallChoices id="conf" label={t('farmer.obs.f.confidence')} value={form.confidence} options={['LOW', 'MEDIUM', 'HIGH']}
                labelFor={(o) => t(`farmer.enums.confidence.${o}`)} onChange={(v) => set({ confidence: v || 'MEDIUM' })} />
              <Field label={t('common.notes')} htmlFor="obs-notes">
                <textarea id="obs-notes" rows={3} maxLength={2000} className="input" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
          )}
          <Button size="lg" className="min-h-14 w-full" onClick={next}>{showDetails ? t('actions.next') : t('farmer.obs.skip')}</Button>
        </div>
      )}

      {key === 'photo' && (
        <div className="space-y-4">
          <p className="-mt-2 text-sm text-slate-500">{t('farmer.obs.hint.photo')}</p>
          <input ref={fileRef} id="obs-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={pickPhoto} aria-label={t('farmer.obs.addPhoto')} />
          {photo ? (
            <div className="space-y-2">
              <img src={photo.preview} alt={t('farmer.obs.photoAlt')} className="max-h-72 w-full rounded-xl object-cover" />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={Camera} className="min-h-11" onClick={() => fileRef.current?.click()}>{t('farmer.obs.changePhoto')}</Button>
                <Button variant="ghost" icon={Trash2} className="min-h-11" onClick={() => setPhoto(null)}>{t('farmer.obs.removePhoto')}</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ocean-300 bg-ocean-50 text-lg font-bold text-ocean-800 hover:bg-ocean-100">
              <ImagePlus className="h-8 w-8" aria-hidden />{t('farmer.obs.addPhoto')}
              <span className="text-xs font-normal text-slate-500">{t('farmer.obs.photoRules')}</span>
            </button>
          )}
          {photoError && <Notice tone="danger">{photoError}</Notice>}
          <Button size="lg" className="min-h-14 w-full" onClick={next}>{photo ? t('actions.next') : t('farmer.obs.skip')}</Button>
        </div>
      )}

      {key === 'review' && (
        <div className="space-y-4">
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-base">
            {[
              [t('farmer.obs.r.condition'), form.cropCondition ? t(`farmer.enums.cropCondition.${form.cropCondition}`) : '—'],
              [t('farmer.obs.r.whitening'), form.whitening ? t('actions.yes') : t('actions.no')],
              [t('farmer.obs.r.breakage'), form.breakage ? t('actions.yes') : t('actions.no')],
              [t('farmer.obs.r.unusualGrowth'), form.unusualGrowth ? t('actions.yes') : t('actions.no')],
              [t('farmer.obs.f.epiphytes'), form.epiphytes ? t('actions.yes') : t('actions.no')],
              [t('farmer.obs.f.disease'), form.diseaseSymptoms ? t('actions.yes') : t('actions.no')],
              ...(form.percentAffected != null ? [[t('farmer.obs.f.percent'), `${form.percentAffected}%`]] : []),
              ...(form.waterAppearance ? [[t('farmer.obs.f.water'), t(`farmer.enums.water.${form.waterAppearance}`)]] : []),
              ...(form.lineCondition ? [[t('farmer.obs.f.line'), t(`farmer.enums.gear.${form.lineCondition}`)]] : []),
              ...(form.anchorCondition ? [[t('farmer.obs.f.anchor'), t(`farmer.enums.gear.${form.anchorCondition}`)]] : []),
              [t('farmer.obs.f.confidence'), t(`farmer.enums.confidence.${form.confidence}`)],
              ...(form.notes.trim() ? [[t('common.notes'), form.notes.trim()]] : []),
              [t('farmer.obs.r.photo'), photo ? t('actions.yes') : t('actions.no')],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3 py-2.5">
                <dt className="text-slate-600">{k}</dt>
                <dd className="text-right font-semibold text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          {photo && <img src={photo.preview} alt={t('farmer.obs.photoAlt')} className="h-24 w-24 rounded-lg object-cover" />}
          {!form.cropCondition && <Notice tone="warning">{t('farmer.obs.needCondition')}</Notice>}
          <FormError error={submit.error} />
          <Button size="lg" variant="success" className="min-h-14 w-full text-lg" loading={submit.isPending} disabled={!form.cropCondition} onClick={() => submit.mutate()}>
            {submit.isPending ? t('farmer.obs.sending') : t('farmer.obs.submit')}
          </Button>
        </div>
      )}
    </Card>
  );
}
