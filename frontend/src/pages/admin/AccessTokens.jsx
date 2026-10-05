import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Key, Plus, ShieldOff, Trash2 } from 'lucide-react';
import { adminApi, cooperativeApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, FormError, Notice, PageHeader, PageLoader, Table } from '../../components/ui/index.jsx';
import { dateTime } from '../../utils/format.js';

const SCOPES = ['FORECASTS', 'ADOPTION'];
const EXPIRY_CHOICES = [30, 90, 180, 365];

function IssueForm({ cooperatives, onCreated }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ label: '', scope: 'FORECASTS', cooperativeId: '', expiresInDays: 90 });
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => adminApi.issuePublicToken({
      label: form.label.trim(),
      scope: form.scope,
      cooperativeId: form.cooperativeId || null,
      expiresInDays: Number(form.expiresInDays),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'publicTokens'] });
      onCreated(res);
      setForm((f) => ({ ...f, label: '' }));
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (form.label.trim()) mut.mutate(); }} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="sm:col-span-2">
        <label htmlFor="tok-label" className="label">{t('admin.tokens.labelField')}</label>
        <input id="tok-label" className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t('admin.tokens.labelPlaceholder')} required maxLength={120} />
      </div>
      <div>
        <label htmlFor="tok-scope" className="label">{t('admin.tokens.scope')}</label>
        <select id="tok-scope" className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
          {SCOPES.map((s) => <option key={s} value={s}>{t(`admin.tokens.scopes.${s}`)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="tok-coop" className="label">{t('admin.tokens.cooperative')}</label>
        <select id="tok-coop" className="input" value={form.cooperativeId} onChange={(e) => setForm({ ...form, cooperativeId: e.target.value })}>
          <option value="">{t('admin.tokens.allCoops')}</option>
          {(cooperatives || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="tok-exp" className="label">{t('admin.tokens.expiry')}</label>
        <select id="tok-exp" className="input" value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })}>
          {EXPIRY_CHOICES.map((d) => <option key={d} value={d}>{t('admin.tokens.days', { n: d })}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-5">
        <Button type="submit" icon={Plus} loading={mut.isPending} disabled={mut.isPending || !form.label.trim()}>{t('admin.tokens.issue')}</Button>
        <FormError error={mut.error} />
      </div>
    </form>
  );
}

function TokenRevealCard({ reveal, onDismiss }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(reveal.plain); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  };
  return (
    <Notice tone="warning">
      <div className="space-y-2">
        <p className="font-semibold">{t('admin.tokens.revealTitle')}</p>
        <p className="text-sm">{t('admin.tokens.revealBody')}</p>
        <div className="flex items-start gap-2 rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">
          <code className="break-all">{reveal.plain}</code>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={Copy} onClick={copy}>{copied ? t('admin.tokens.copied') : t('admin.tokens.copy')}</Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>{t('admin.tokens.dismiss')}</Button>
        </div>
      </div>
    </Notice>
  );
}

const SCOPE_TONE = {
  FORECASTS: 'bg-sky-50 text-sky-800 ring-sky-300',
  ADOPTION: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
};

function tokenStatus(t, row, now) {
  if (row.revokedAt) return { label: t('admin.tokens.status.revoked'), tone: 'bg-slate-100 text-slate-600 ring-slate-200' };
  if (row.expiresAt && new Date(row.expiresAt) < now) return { label: t('admin.tokens.status.expired'), tone: 'bg-amber-50 text-amber-800 ring-amber-300' };
  return { label: t('admin.tokens.status.active'), tone: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' };
}

export default function AdminAccessTokens() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [reveal, setReveal] = useState(null);
  const tokens = useQuery({ queryKey: ['admin', 'publicTokens'], queryFn: adminApi.publicTokens });
  const coops = useQuery({ queryKey: ['cooperatives'], queryFn: cooperativeApi.list });
  const revoke = useMutation({
    mutationFn: (id) => adminApi.revokePublicToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'publicTokens'] }),
  });

  if (tokens.isLoading) return <PageLoader />;
  if (tokens.error) return <ErrorState error={tokens.error} onRetry={tokens.refetch} />;

  const now = new Date();
  const rows = tokens.data.tokens;

  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.tokens.title')} subtitle={t('admin.tokens.subtitle')} />

      {reveal && <TokenRevealCard reveal={reveal} onDismiss={() => setReveal(null)} />}

      <Card>
        <CardHeader icon={Plus} title={t('admin.tokens.issueTitle')} subtitle={t('admin.tokens.issueSubtitle')} />
        <div className="p-4 sm:p-5">
          <IssueForm cooperatives={coops.data?.cooperatives} onCreated={(res) => setReveal({ plain: res.plain, token: res.token })} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={Key} title={t('admin.tokens.listTitle')} subtitle={t('admin.tokens.listSubtitle', { n: rows.length })} />
        <div className="p-2 sm:p-3">
          <Table
            rows={rows}
            empty={<EmptyState icon={ShieldOff} title={t('admin.tokens.none')} message={t('admin.tokens.noneText')} />}
            columns={[
              { key: 'label', header: t('admin.tokens.labelField'), render: (r) => (
                <div>
                  <p className="font-medium text-slate-900">{r.label}</p>
                  {r.createdBy && <p className="text-xs text-slate-500">{t('admin.tokens.by', { who: r.createdBy })}</p>}
                </div>
              ) },
              { key: 'scope', header: t('admin.tokens.scope'), render: (r) => <Badge className={SCOPE_TONE[r.scope]}>{t(`admin.tokens.scopes.${r.scope}`)}</Badge> },
              { key: 'cooperative', header: t('admin.tokens.cooperative'), render: (r) => r.cooperative?.name || <span className="text-slate-400">{t('admin.tokens.allCoops')}</span> },
              { key: 'status', header: t('common.status'), render: (r) => { const s = tokenStatus(t, r, now); return <Badge className={s.tone}>{s.label}</Badge>; } },
              { key: 'expiresAt', header: t('admin.tokens.expires'), render: (r) => (r.expiresAt ? <span className="whitespace-nowrap text-xs">{dateTime(r.expiresAt, lang)}</span> : '—') },
              { key: 'lastUsedAt', header: t('admin.tokens.lastUsed'), render: (r) => (r.lastUsedAt ? <span className="whitespace-nowrap text-xs">{dateTime(r.lastUsedAt, lang)}</span> : <span className="text-slate-400">—</span>) },
              { key: 'requestCount', header: t('admin.tokens.requests'), render: (r) => <span className="tabular-nums text-sm">{r.requestCount || 0}</span> },
              { key: 'actions', header: '', render: (r) => (
                r.revokedAt ? null : (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    loading={revoke.isPending && revoke.variables === r.id}
                    disabled={revoke.isPending}
                    onClick={() => { if (window.confirm(t('admin.tokens.confirmRevoke', { label: r.label }))) revoke.mutate(r.id); }}
                  >
                    {t('admin.tokens.revoke')}
                  </Button>
                )
              ) },
            ]}
          />
        </div>
      </Card>

      <Notice tone="info">
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{t('admin.tokens.howTitle')}</p>
          <p>{t('admin.tokens.howForecasts')}</p>
          <p>{t('admin.tokens.howAdoption')}</p>
          <p className="font-mono text-xs text-slate-700">GET /api/public/forecasts?token=…</p>
          <p className="font-mono text-xs text-slate-700">GET /api/public/adoption?token=…</p>
        </div>
      </Notice>
    </div>
  );
}
