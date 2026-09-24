import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, MessageSquare, RefreshCw, Send } from 'lucide-react';
import { channelApi } from '../../api/endpoints.js';
import { useAuth } from '../../stores/AuthContext.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, ErrorState, Field, FormError, PageHeader, Spinner, cx } from '../../components/ui/index.jsx';
import { dateTime } from '../../utils/format.js';
import { defaultPhone, isFarmerOnly, PHONE_RE } from './components/phone.js';

const CHIPS = ['RISK FARM001', 'USHAURI FARM001', 'RIPOTI FARM001 WEUPE 20%', 'MAVUNO FARM002 120', 'MSAADA'];
const COMMANDS = ['RISK', 'USHAURI', 'RIPOTI', 'MAVUNO', 'MSAADA'];

export default function Sms() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [phone, setPhone] = useState(defaultPhone(user));
  const [active, setActive] = useState(defaultPhone(user));
  const [message, setMessage] = useState('');
  const [last, setLast] = useState(null);
  const bottom = useRef(null);

  // Load the conversation for a phone number once it is valid (debounced while typing).
  useEffect(() => {
    const p = phone.trim();
    if (!PHONE_RE.test(p)) return undefined;
    const id = setTimeout(() => setActive(p), 400);
    return () => clearTimeout(id);
  }, [phone]);

  const history = useQuery({ queryKey: ['smsMessages', active], queryFn: () => channelApi.smsMessages(active), enabled: PHONE_RE.test(active) });
  const send = useMutation({
    mutationFn: (text) => channelApi.sms(active, text),
    onSuccess: (data) => {
      setLast(data);
      setMessage('');
      qc.invalidateQueries({ queryKey: ['smsMessages', active] });
      // Reports and harvests sent by SMS change farm records.
      qc.invalidateQueries({ queryKey: ['risks'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  useEffect(() => { const el = bottom.current; if (el) el.scrollTop = el.scrollHeight; }, [history.data, send.isPending]);

  const submit = (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || send.isPending) return;
    send.mutate(text);
  };
  const messages = history.data?.messages || [];
  const phoneValid = PHONE_RE.test(phone.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('demo.sms.title')}
        subtitle={t('demo.sms.subtitle')}
        badge={<Badge className="bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-300">{last?.provider ? `${t('demo.simulated')} · ${last.provider}` : t('demo.sms.simulatedSms')}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {/* Phone */}
        <div className="mx-auto w-full max-w-[26rem]">
          <div className="overflow-hidden rounded-[2rem] border-[6px] border-slate-800 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 bg-ocean-800 px-4 py-3 text-white">
              <div className="min-w-0">
                <p className="font-semibold">MwaniMlinzi</p>
                <p className="truncate text-xs text-ocean-200">{t('demo.sms.from')}: {active}</p>
              </div>
              <button type="button" onClick={() => history.refetch()} className="rounded-lg p-1.5 hover:bg-ocean-700" aria-label={t('actions.refresh')}>
                <RefreshCw className={cx('h-4 w-4', history.isFetching && 'animate-spin')} />
              </button>
            </div>
            <div ref={bottom} className="h-[26rem] space-y-2 overflow-y-auto bg-sand-100 p-3" role="log" aria-live="polite" aria-label={t('demo.sms.conversation')}>
              {history.isLoading && <div className="flex justify-center py-8"><Spinner /></div>}
              {history.error && <ErrorState error={history.error} onRetry={history.refetch} compact />}
              {!history.isLoading && !history.error && !messages.length && <p className="py-8 text-center text-sm text-slate-500">{t('demo.sms.empty')}</p>}
              {messages.map((m) => {
                const inbound = m.direction === 'INBOUND';
                const alert = m.command === 'ALERT';
                return (
                  <div key={m.id} className={cx('flex', inbound ? 'justify-end' : 'justify-start')}>
                    <div className={cx('max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm', inbound ? 'rounded-br-sm bg-ocean-700 text-white' : alert ? 'rounded-bl-sm border border-orange-200 bg-orange-50 text-slate-900' : 'rounded-bl-sm bg-white text-slate-900')}>
                      {alert && <p className="mb-0.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-orange-700"><BellRing className="h-3 w-3" aria-hidden />{t('demo.sms.alert')}</p>}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={cx('mt-1 text-right text-[10px]', inbound ? 'text-ocean-200' : 'text-slate-400')}>
                        {dateTime(m.createdAt, lang)}{m.simulated && ` · ${t('demo.simulated')}`}
                      </p>
                    </div>
                  </div>
                );
              })}
              {send.isPending && (
                <div className="flex justify-end"><div className="rounded-2xl rounded-br-sm bg-ocean-700/70 px-3 py-2 text-sm text-white">{send.variables}</div></div>
              )}
            </div>
            <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-200 p-2">
              <label htmlFor="sms-text" className="sr-only">{t('demo.sms.message')}</label>
              <input
                id="sms-text"
                className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-sm focus:border-ocean-500 focus:outline-none focus:ring-2 focus:ring-ocean-200"
                placeholder={t('demo.sms.placeholder')}
                value={message}
                maxLength={320}
                onChange={(e) => setMessage(e.target.value)}
                disabled={!PHONE_RE.test(active)}
              />
              <button type="submit" disabled={!message.trim() || send.isPending} className="rounded-full bg-seaweed-600 p-2.5 text-white hover:bg-seaweed-700 disabled:opacity-50" aria-label={t('demo.sms.send')}>
                {send.isPending ? <Spinner className="h-5 w-5 text-white" /> : <Send className="h-5 w-5" />}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={MessageSquare} title={t('demo.sms.setupTitle')} />
            <div className="space-y-4 p-4 sm:p-5">
              <Field label={t('demo.phoneLabel')} htmlFor="sms-phone" required hint={isFarmerOnly(user) ? t('demo.farmerOwnNumber') : t('demo.staffNumber')} error={!phoneValid ? t('demo.badPhone') : null}>
                <input id="sms-phone" type="tel" className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <div>
                <p className="label">{t('demo.sms.quick')}</p>
                <div className="flex flex-wrap gap-2">
                  {CHIPS.map((c) => (
                    <button key={c} type="button" onClick={() => setMessage(c)} className="rounded-full bg-ocean-50 px-3 py-1.5 font-mono text-xs font-semibold text-ocean-800 ring-1 ring-ocean-200 hover:bg-ocean-100">
                      {c}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">{t('demo.sms.chipHint')}</p>
              </div>
              <FormError error={send.error} />
              {last && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('demo.sms.lastReply')} · {last.command}</p>
                  <p className="mt-1 text-slate-800">{last.reply}</p>
                  <p className="mt-1 text-xs text-slate-500">{t('demo.sms.provider')}: <span className="font-mono">{last.provider}</span>{last.simulated && ` · ${t('demo.simulated')}`}</p>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title={t('demo.sms.commandsTitle')} subtitle={t('demo.sms.commandsSubtitle')} />
            <ul className="divide-y divide-slate-100">
              {COMMANDS.map((c) => (
                <li key={c} className="px-4 py-2.5 text-sm sm:px-5">
                  <p className="font-mono font-semibold text-slate-900">{t(`demo.sms.commands.${c}.syntax`)}</p>
                  <p className="text-slate-600">{t(`demo.sms.commands.${c}.text`)}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">{t('demo.sms.alertsNote')}</p>
          </Card>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => history.refetch()}>{t('demo.sms.reload')}</Button>
        </div>
      </div>
    </div>
  );
}
