import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDot, Copy, MessageSquare, Send, XCircle } from 'lucide-react';
import { adminApi } from '../../../api/endpoints.js';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, ErrorState, Field, FormError, Notice, Spinner } from '../../../components/ui/index.jsx';
import { dateTime } from '../../../utils/format.js';
import { normalizeTzPhone } from '../../../utils/phone.js';

const CONNECTION_STYLE = {
  CONNECTED: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
  NOT_CONFIGURED: 'bg-slate-100 text-slate-700 ring-slate-300',
  ERROR: 'bg-red-50 text-red-800 ring-red-300',
  UNKNOWN: 'bg-amber-50 text-amber-800 ring-amber-300',
};
const SEND_STYLE = { QUEUED: 'text-seaweed-700', SENT: 'text-seaweed-700', DELIVERED: 'text-seaweed-700', FAILED: 'text-red-700', NOT_CONFIGURED: 'text-slate-700', UNKNOWN: 'text-amber-700' };

function Row({ label, children }) {
  return <div className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="text-slate-600">{label}</span><span className="text-right font-medium text-slate-900">{children}</span></div>;
}

function Configured({ ok }) {
  const { t } = useI18n();
  return ok
    ? <span className="inline-flex items-center gap-1 text-seaweed-700"><CheckCircle2 className="h-4 w-4" aria-hidden />{t('admin.at.configured')}</span>
    : <span className="inline-flex items-center gap-1 text-slate-600"><XCircle className="h-4 w-4" aria-hidden />{t('admin.at.notConfigured')}</span>;
}

/** Africa's Talking integration status + a real "Test SMS" (never shows the API key). */
export default function AfricasTalkingCard() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'africastalking'], queryFn: adminApi.africasTalking });
  const [phone, setPhone] = useState('');
  const [phoneErr, setPhoneErr] = useState(null);
  const test = useMutation({
    mutationFn: () => adminApi.testSms(normalizeTzPhone(phone)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'africastalking'] }),
  });
  const send = (e) => {
    e.preventDefault();
    if (!normalizeTzPhone(phone)) { setPhoneErr(t('public.register.errors.phone')); return; }
    setPhoneErr(null);
    test.mutate();
  };

  const d = q.data;
  return (
    <Card className="h-fit" data-testid="at-card">
      <CardHeader icon={MessageSquare} title={t('admin.at.title')} subtitle={t('admin.at.subtitle')} />
      <div className="space-y-4 p-4 sm:p-5">
        {q.isLoading && <div className="flex justify-center"><Spinner /></div>}
        {q.error && <ErrorState error={q.error} onRetry={q.refetch} compact />}
        {d && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={CONNECTION_STYLE[d.connection] || CONNECTION_STYLE.UNKNOWN}><CircleDot className="h-3 w-3" aria-hidden />{t(`admin.at.connection.${d.connection}`)}</Badge>
              <Badge className="bg-slate-50 text-slate-700 ring-slate-200">{t('admin.at.environment')}: {d.environment}</Badge>
            </div>
            <div className="divide-y divide-slate-100">
              <Row label={t('admin.at.username')}>{d.username || '—'}</Row>
              <Row label={t('admin.at.apiKey')}>{d.apiKeySet ? t('admin.at.set') : t('admin.at.notSet')}</Row>
              <Row label="SMS"><Configured ok={d.sms === 'CONFIGURED'} /></Row>
              <Row label="USSD"><Configured ok={d.ussd === 'CONFIGURED'} /></Row>
              <Row label={t('admin.at.serviceCode')}>{d.ussdServiceCode || '—'}</Row>
              <Row label={t('admin.at.senderId')}>{d.senderIdSet ? t('admin.at.set') : t('admin.at.default')}</Row>
              <Row label={t('admin.at.lastSend')}>{d.lastSendAt ? dateTime(d.lastSendAt, lang) : '—'}</Row>
            </div>
            {d.lastError && <Notice tone="danger">{t('admin.at.lastError')}: {d.lastError}</Notice>}
            {Object.keys(d.smsLast7Days || {}).length > 0 && (
              <p className="text-xs text-slate-600">{t('admin.at.last7')}: {Object.entries(d.smsLast7Days).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-ocean-800">{t('admin.at.callbacks')}</summary>
              <p className="mt-2 text-xs text-slate-600">{t('admin.at.callbacksHint')}</p>
              <ul className="mt-2 space-y-2">
                {Object.entries(d.callbackUrls || {}).map(([k, url]) => (
                  <li key={k}>
                    <p className="text-xs font-semibold text-slate-500">{t(`admin.at.callback.${k}`)}</p>
                    <p className="flex items-start gap-1 break-all font-mono text-xs text-slate-800"><Copy className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden />{url}</p>
                  </li>
                ))}
              </ul>
              {!d.callbackSecretSet && <Notice tone="warning" className="mt-2">{t('admin.at.noSecret')}</Notice>}
            </details>

            <form onSubmit={send} className="space-y-2 border-t border-slate-100 pt-3" noValidate>
              <Field label={t('admin.at.testPhone')} htmlFor="at-test-phone" hint={t('admin.at.testHint')} error={phoneErr}>
                <input id="at-test-phone" type="tel" inputMode="tel" className="input" placeholder="0777 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Button type="submit" icon={Send} loading={test.isPending} className="w-full">{t('admin.at.testSend')}</Button>
              {test.data && (
                <p role="status" className={`text-sm font-semibold ${SEND_STYLE[test.data.status] || ''}`}>
                  {t(`admin.at.result.${test.data.status}`, { to: test.data.to })}{test.data.reason ? ` — ${test.data.reason}` : ''}
                </p>
              )}
              <FormError error={test.error} />
            </form>
          </>
        )}
      </div>
    </Card>
  );
}
