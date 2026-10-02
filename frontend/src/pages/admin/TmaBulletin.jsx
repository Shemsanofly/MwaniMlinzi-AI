import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Cloud, FileText, FileUp, Upload } from 'lucide-react';
import { adminApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, ErrorState, FormError, Notice, PageHeader, PageLoader } from '../../components/ui/index.jsx';
import { dateTime } from '../../utils/format.js';

const TEMPLATE = (now = new Date()) => ({
  issuedAt: now.toISOString(),
  regions: {
    Unguja: { temperatureC: 29, rainfallMm: 2, windSpeedKmh: 18, windDirectionDeg: 120, humidityPct: 78, condition: 'Partly cloudy' },
    Pemba: { temperatureC: 28, rainfallMm: 4, windSpeedKmh: 20, windDirectionDeg: 135, humidityPct: 82, condition: 'Showers' },
    default: { temperatureC: 29, rainfallMm: 3, windSpeedKmh: 17, windDirectionDeg: 120, humidityPct: 80, condition: 'Partly cloudy' },
  },
});

function parseBulletin(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { error: 'empty' };
  try {
    const value = JSON.parse(trimmed);
    if (!value || typeof value !== 'object') return { error: 'not-object' };
    if (!value.issuedAt || Number.isNaN(+new Date(value.issuedAt))) return { error: 'bad-issued' };
    if (!value.regions || typeof value.regions !== 'object' || !Object.keys(value.regions).length) return { error: 'no-regions' };
    return { value };
  } catch (err) {
    return { error: 'bad-json', message: err.message };
  }
}

function StatusPanel({ status }) {
  const { t, lang } = useI18n();
  if (!status.configured) {
    return (
      <Notice tone="warning">
        <p className="font-semibold">{t('admin.tma.notConfigured')}</p>
        <p className="text-sm">{t('admin.tma.notConfiguredHint')}</p>
      </Notice>
    );
  }
  if (!status.payload) {
    return (
      <Notice tone="info">
        <p className="font-semibold">{t('admin.tma.noFileYet')}</p>
        <p className="text-sm">{t('admin.tma.pathLabel')}: <code className="font-mono text-xs">{status.path}</code></p>
      </Notice>
    );
  }
  const stale = !status.fresh;
  return (
    <Card>
      <CardHeader
        icon={Cloud}
        title={t('admin.tma.currentTitle')}
        subtitle={<span className="font-mono text-xs">{status.path}</span>}
        action={<Badge className={stale ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30'}>{stale ? t('admin.tma.stale') : t('admin.tma.fresh')}</Badge>}
      />
      <div className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('admin.tma.issuedAt')}</p>
          <p className="font-medium text-slate-900">{dateTime(status.issuedAt, lang)}</p>
          {status.ageHours != null && <p className="text-xs text-slate-500">{t('admin.tma.ageHours', { h: status.ageHours })}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('admin.tma.maxAge')}</p>
          <p className="font-medium text-slate-900">{t('admin.tma.ageHours', { h: status.maxAgeHours })}</p>
          <p className="text-xs text-slate-500">{t('admin.tma.maxAgeHint')}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('admin.tma.regions')}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {status.regions.map((r) => <Badge key={r}>{r}</Badge>)}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function AdminTmaBulletin() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState(null);

  const status = useQuery({ queryKey: ['admin', 'tmaBulletin'], queryFn: adminApi.tmaBulletin });

  useEffect(() => {
    if (status.data?.payload && !text) {
      setText(JSON.stringify(status.data.payload, null, 2));
    }
  }, [status.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => parseBulletin(text), [text]);

  const save = useMutation({
    mutationFn: () => {
      if (parsed.error) throw new Error(t(`admin.tma.err.${parsed.error}`, { message: parsed.message || '' }));
      return adminApi.saveTmaBulletin(parsed.value);
    },
    onSuccess: (res) => {
      setNotice({ tone: 'success', msg: t('admin.tma.saved', { n: res.regions.length }) });
      qc.invalidateQueries({ queryKey: ['admin', 'tmaBulletin'] });
    },
    onError: () => setNotice(null),
  });

  const useTemplate = () => {
    setText(JSON.stringify(TEMPLATE(), null, 2));
    setNotice(null);
  };

  const readFile = async (file) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
  };

  if (status.isLoading) return <PageLoader />;
  if (status.error) return <ErrorState error={status.error} onRetry={status.refetch} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.tma.title')} subtitle={t('admin.tma.subtitle')} />

      <StatusPanel status={status.data} />

      {notice && (
        <Notice tone={notice.tone === 'success' ? 'success' : 'info'}>
          <p className="text-sm">{notice.msg}</p>
        </Notice>
      )}

      <Card>
        <CardHeader icon={FileUp} title={t('admin.tma.editTitle')} subtitle={t('admin.tma.editSubtitle')} />
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Upload className="h-4 w-4" aria-hidden />
              <span>{t('admin.tma.chooseFile')}</span>
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
            </label>
            <Button variant="ghost" icon={FileText} onClick={useTemplate}>{t('admin.tma.useTemplate')}</Button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            spellCheck="false"
            className="input w-full font-mono text-xs"
            placeholder={t('admin.tma.placeholder')}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs">
              {parsed.error === 'empty' && <span className="text-slate-500">{t('admin.tma.pasteOrUpload')}</span>}
              {parsed.error === 'not-object' && <span className="text-red-700">{t('admin.tma.err.not-object')}</span>}
              {parsed.error === 'bad-issued' && <span className="text-red-700">{t('admin.tma.err.bad-issued')}</span>}
              {parsed.error === 'no-regions' && <span className="text-red-700">{t('admin.tma.err.no-regions')}</span>}
              {parsed.error === 'bad-json' && <span className="text-red-700">{t('admin.tma.err.bad-json', { message: parsed.message })}</span>}
              {!parsed.error && parsed.value && (
                <span className="inline-flex items-center gap-1.5 text-seaweed-700">
                  <Check className="h-4 w-4" aria-hidden />
                  {t('admin.tma.readyToSave', { n: Object.keys(parsed.value.regions).length, when: new Date(parsed.value.issuedAt).toLocaleString() })}
                </span>
              )}
            </div>
            <Button icon={Upload} loading={save.isPending} disabled={!!parsed.error || save.isPending} onClick={() => save.mutate()}>
              {t('admin.tma.save')}
            </Button>
          </div>
          <FormError error={save.error} />
        </div>
      </Card>

      <Notice tone="info">
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{t('admin.tma.note')}</p>
          </div>
        </div>
      </Notice>
    </div>
  );
}
