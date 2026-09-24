import { useEffect, useRef, useState } from 'react';
import { Delete, Phone, PhoneOff, Smartphone } from 'lucide-react';
import { channelApi } from '../../api/endpoints.js';
import { useAuth } from '../../stores/AuthContext.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, Field, Notice, PageHeader, cx } from '../../components/ui/index.jsx';
import { defaultPhone, isFarmerOnly, newSessionId, parseUssd, PHONE_RE } from './components/phone.js';

const SERVICE_CODE = '*123#';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const MENU = ['1', '2', '3', '4', '5'];

export default function Ussd() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [phone, setPhone] = useState(defaultPhone(user));
  // idle → dialled code typed; session → waiting for menu input; ended → END message shown
  const [mode, setMode] = useState('idle');
  const [sessionId, setSessionId] = useState(null);
  const [inputs, setInputs] = useState([]);
  const [buffer, setBuffer] = useState('');
  const [screen, setScreen] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);
  const [provider, setProvider] = useState(null);
  const logEnd = useRef(null);
  const seq = useRef(0);
  const nextId = () => { seq.current += 1; return seq.current; };

  useEffect(() => { logEnd.current?.scrollIntoView?.({ block: 'nearest' }); }, [log]);

  const reset = () => {
    setMode('idle'); setSessionId(null); setInputs([]); setBuffer(''); setScreen(''); setError(null);
  };

  const call = async (sid, nextInputs) => {
    const text = nextInputs.join('*');
    setPending(true);
    setError(null);
    setLog((l) => [...l, { id: nextId(), dir: 'out', sid, text }]);
    try {
      const res = await channelApi.ussd(sid, phone.trim(), text);
      const parsed = parseUssd(res.response);
      setProvider({ name: res.provider, simulated: res.simulated });
      setLog((l) => [...l, { id: nextId(), dir: 'in', response: res.response, state: res.state }]);
      setInputs(nextInputs);
      setScreen(parsed.text);
      setMode(res.end || parsed.kind === 'END' ? 'ended' : 'session');
    } catch (e) {
      setError(e);
      setLog((l) => [...l, { id: nextId(), dir: 'err', response: e.message }]);
      setMode('ended');
      setScreen(e.message);
    } finally {
      setPending(false);
      setBuffer('');
    }
  };

  const send = () => {
    if (pending) return;
    if (mode === 'ended') return reset();
    if (mode === 'idle') {
      if (!PHONE_RE.test(phone.trim())) { setError({ message: t('demo.ussd.badPhone') }); return undefined; }
      if (buffer !== SERVICE_CODE) { setScreen(t('demo.ussd.unknownCode')); setMode('ended'); setBuffer(''); return undefined; }
      const sid = newSessionId();
      setSessionId(sid);
      return call(sid, []);
    }
    if (!buffer) return undefined;
    return call(sessionId, [...inputs, buffer]);
  };

  const press = (k) => { if (!pending && mode !== 'ended') setBuffer((b) => (b + k).slice(0, 40)); };
  const cancel = () => { if (!pending) reset(); };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); send(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('demo.ussd.title')}
        subtitle={t('demo.ussd.subtitle')}
        badge={<Badge className="bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-300">{provider ? `${t('demo.simulated')} · ${provider.name}` : t('demo.simulated')}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* Feature phone */}
        <div className="mx-auto w-full max-w-[320px]">
          <div className="rounded-[2.5rem] bg-slate-800 p-4 shadow-xl ring-1 ring-slate-900">
            <div className="mb-3 flex items-center justify-between px-2 text-[11px] text-slate-400"><span>MwaniNet</span><span>{phone}</span></div>
            <div
              className="flex h-64 flex-col rounded-xl bg-[#c9d8b6] p-3 font-mono text-[13px] leading-snug text-slate-900 shadow-inner"
              role="log"
              aria-live="polite"
              aria-label={t('demo.ussd.screen')}
              data-testid="ussd-screen"
            >
              <div className="flex-1 overflow-y-auto whitespace-pre-wrap break-words">
                {pending ? t('demo.ussd.running') : mode === 'idle' ? (buffer ? '' : t('demo.ussd.dialHint')) : screen}
              </div>
              {mode !== 'ended' && (
                <input
                  aria-label={t('demo.ussd.input')}
                  className="mt-2 w-full border-t border-slate-600/40 bg-transparent pt-1 font-mono text-base outline-none"
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value.replace(/[^0-9*#]/g, '').slice(0, 40))}
                  onKeyDown={onKeyDown}
                  disabled={pending}
                  placeholder={mode === 'idle' ? SERVICE_CODE : t('demo.ussd.reply')}
                  inputMode="tel"
                />
              )}
              {mode === 'ended' && <p className="mt-2 border-t border-slate-600/40 pt-1 text-xs text-slate-700">{t('demo.ussd.ended')}</p>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" onClick={send} disabled={pending} className="flex items-center justify-center gap-1 rounded-full bg-seaweed-600 py-2.5 text-sm font-semibold text-white hover:bg-seaweed-700 disabled:opacity-60" aria-label={t('demo.ussd.send')}>
                <Phone className="h-4 w-4" aria-hidden />{mode === 'ended' ? t('demo.ussd.ok') : t('demo.ussd.send')}
              </button>
              <button type="button" onClick={() => setBuffer((b) => b.slice(0, -1))} disabled={pending || mode === 'ended'} className="flex items-center justify-center rounded-full bg-slate-600 py-2.5 text-white hover:bg-slate-500 disabled:opacity-60" aria-label={t('demo.ussd.delete')}>
                <Delete className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={cancel} disabled={pending} className="flex items-center justify-center gap-1 rounded-full bg-red-700 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60" aria-label={t('demo.ussd.cancel')}>
                <PhoneOff className="h-4 w-4" aria-hidden />{t('demo.ussd.cancel')}
              </button>
              {KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => press(k)}
                  disabled={pending || mode === 'ended'}
                  className="rounded-2xl bg-slate-700 py-3 text-lg font-semibold text-white shadow hover:bg-slate-600 active:bg-slate-500 disabled:opacity-60"
                  aria-label={`${t('demo.ussd.key')} ${k}`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={Smartphone} title={t('demo.ussd.setupTitle')} />
            <div className="space-y-3 p-4 sm:p-5">
              <Field label={t('demo.phoneLabel')} htmlFor="ussd-phone" required hint={isFarmerOnly(user) ? t('demo.farmerOwnNumber') : t('demo.staffNumber')}>
                <input id="ussd-phone" type="tel" className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={mode !== 'idle'} />
              </Field>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>{t('demo.ussd.how1')}</li>
                <li>{t('demo.ussd.how2')}</li>
                <li>{t('demo.ussd.how3')}</li>
              </ol>
              {error && mode === 'idle' && <Notice tone="danger">{error.message}</Notice>}
              {sessionId && <p className="text-xs text-slate-500">{t('demo.ussd.session')}: <span className="font-mono">{sessionId}</span> · text=&quot;<span className="font-mono">{inputs.join('*')}</span>&quot;</p>}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('demo.ussd.menuTitle')} subtitle={t('demo.ussd.menuSubtitle')} />
            <ul className="divide-y divide-slate-100">
              {MENU.map((k) => (
                <li key={k} className="flex gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-ocean-100 font-mono font-bold text-ocean-800">{k}</span>
                  <div><p className="font-semibold text-slate-900">{t(`demo.ussd.menu.${k}.label`)}</p><p className="text-slate-600">{t(`demo.ussd.menu.${k}.text`)}</p></div>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">{t('demo.ussd.multiFarm')}</p>
          </Card>

          <Card>
            <CardHeader title={t('demo.ussd.logTitle')} subtitle={t('demo.ussd.logSubtitle')} action={log.length > 0 && <Button size="sm" variant="ghost" onClick={() => setLog([])}>{t('demo.clear')}</Button>} />
            <div className="max-h-80 space-y-2 overflow-y-auto p-4 font-mono text-xs sm:p-5">
              {!log.length && <p className="font-sans text-sm text-slate-500">{t('demo.ussd.logEmpty')}</p>}
              {log.map((e) => (
                <div key={e.id} className={cx('rounded-lg p-2', e.dir === 'out' ? 'bg-ocean-50 text-ocean-900' : e.dir === 'err' ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-800')}>
                  {e.dir === 'out'
                    ? <>→ POST /api/ussd/simulate {'{'} sessionId: &quot;{e.sid}&quot;, text: &quot;{e.text}&quot; {'}'}</>
                    : <><span className="font-semibold">← {e.state || 'ERROR'}</span><pre className="mt-1 whitespace-pre-wrap">{e.response}</pre></>}
                </div>
              ))}
              <div ref={logEnd} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
