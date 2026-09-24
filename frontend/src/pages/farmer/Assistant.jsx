import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ClipboardCheck, Database, Info, SendHorizontal, ShieldCheck, Sprout, Trash2, UserRound } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { aiApi, farmApi } from '../../api/endpoints.js';
import { Badge, Button, FormError, Notice, PageHeader, apiErrorMessage, cx } from '../../components/ui/index.jsx';
import { ValidationBadge } from './components/RecommendationPanel.jsx';
import ObservationResult from './components/ObservationResult.jsx';
import { FarmGate, FarmSwitcher, useInvalidateFarm } from './components/shared.jsx';

const SUGGESTIONS = ['why', 'todo', 'harvest', 'sea', 'white', 'medicine'];
const storeKey = (farmId) => `mwanimlinzi.chat.${farmId}`;
const load = (farmId) => { try { return JSON.parse(sessionStorage.getItem(storeKey(farmId)) || '[]'); } catch { return []; } };
const save = (farmId, msgs) => { try { sessionStorage.setItem(storeKey(farmId), JSON.stringify(msgs.slice(-40))); } catch { /* storage unavailable */ } };
let seq = 0;
const newId = () => `${Date.now()}-${(seq += 1)}`;

export default function AssistantPage() {
  const { t } = useI18n();
  const ff = useFarmerFarm();
  return (
    <div>
      <PageHeader title={t('farmer.assistant.title')} subtitle={t('farmer.assistant.subtitle')} />
      {ff.farm ? <Chat key={ff.farmId} ff={ff} /> : <FarmGate ff={ff} />}
    </div>
  );
}

function Chat({ ff }) {
  const { t, lang } = useI18n();
  const { farmId, farm } = ff;
  const [messages, setMessages] = useState(() => load(farmId));
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => { save(farmId, messages); }, [farmId, messages]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }); }, [messages]);

  const chat = useMutation({
    mutationFn: (message) => aiApi.chat(message, farmId, lang),
    onSuccess: (res) => setMessages((m) => [...m, { id: newId(), role: 'assistant', response: res }]),
    onError: (err) => setMessages((m) => [...m, { id: newId(), role: 'error', error: { status: err?.status, code: err?.code, message: err?.message } }]),
  });

  const send = (msg) => {
    const m = msg.trim();
    if (!m || chat.isPending) return;
    setMessages((prev) => [...prev, { id: newId(), role: 'user', text: m }]);
    setText('');
    chat.mutate(m);
  };

  const patchMessage = (id, patch) => setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <div className="flex flex-col">
      <FarmSwitcher ff={ff} />
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-seaweed-50 text-seaweed-700"><Sprout className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{t('farmer.assistant.helperName')}</p>
            <p className="truncate text-xs text-slate-500">{t('farmer.assistant.grounded', { farm: `${farm.farmCode} — ${farm.name}` })}</p>
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={() => setMessages([])} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100" aria-label={t('farmer.assistant.clear')}>
              <Trash2 className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{t('farmer.assistant.clear')}</span>
            </button>
          )}
        </div>

        <div className="space-y-4 px-3 py-4 sm:px-4" aria-live="polite">
          {messages.length === 0 && <p className="rounded-xl bg-sand-100 p-3 text-sm text-slate-700">{t('farmer.assistant.intro')}</p>}
          {messages.map((m) => (
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end gap-2">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ocean-700 px-4 py-2.5 text-white">{m.text}</p>
                <UserRound className="mt-1 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </div>
            ) : m.role === 'error' ? (
              <Notice key={m.id} tone="danger">{apiErrorMessage(m.error || { message: m.text }, t, lang)}</Notice>
            ) : (
              <AssistantMessage key={m.id} msg={m} farmId={farmId} onPatch={(p) => patchMessage(m.id, p)} />
            )
          ))}
          {chat.isPending && (
            <div className="flex items-center gap-2 text-sm text-slate-500" role="status">
              <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-seaweed-500" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
              {t('farmer.assistant.thinking')}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggested questions */}
        <div className="border-t border-slate-100 px-3 pt-3 sm:px-4">
          <p className="mb-2 text-xs font-semibold text-slate-500">{t('farmer.assistant.suggested')}</p>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
            {SUGGESTIONS.map((k) => (
              <button key={k} type="button" disabled={chat.isPending} onClick={() => send(t(`farmer.assistant.q.${k}`))}
                className="min-h-11 shrink-0 rounded-full bg-seaweed-50 px-3.5 py-2 text-sm font-semibold text-seaweed-700 ring-1 ring-inset ring-seaweed-500/30 hover:bg-seaweed-100 disabled:opacity-60">
                {t(`farmer.assistant.q.${k}`)}
              </button>
            ))}
          </div>
        </div>

        <form className="flex items-end gap-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <label htmlFor="chat-input" className="sr-only">{t('farmer.assistant.inputLabel')}</label>
          <textarea id="chat-input" rows={1} maxLength={1000} className="input min-h-12 resize-none" placeholder={t('farmer.assistant.placeholder')} value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
          <Button type="submit" className="min-h-12 min-w-12" disabled={!text.trim()} loading={chat.isPending} aria-label={t('farmer.assistant.send')}>
            {!chat.isPending && <SendHorizontal className="h-5 w-5" aria-hidden />}
          </Button>
        </form>
      </div>

      <Notice tone="info" icon={Info} className="mt-4">{t('farmer.assistant.footer')}</Notice>
    </div>
  );
}

function sourceLabel(generatedBy, t) {
  if (!generatedBy) return null;
  if (generatedBy === 'TEMPLATE') return t('farmer.assistant.gen.template');
  if (generatedBy === 'SAFETY_POLICY') return t('farmer.assistant.gen.safety');
  if (generatedBy.startsWith('LLM')) return t('farmer.assistant.gen.llm', { name: generatedBy.split(':')[1] || 'LLM' });
  return generatedBy;
}

function AssistantMessage({ msg, farmId, onPatch }) {
  const { t } = useI18n();
  const r = msg.response;
  return (
    <div className="flex gap-2">
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-seaweed-50 text-seaweed-700"><Sprout className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 max-w-[92%] flex-1 space-y-2">
        <div className="rounded-2xl rounded-tl-sm bg-sand-100 px-4 py-2.5 text-slate-900">
          <p className="whitespace-pre-wrap">{r.reply}</p>
        </div>
        {r.approvedAction && (
          <div className="rounded-xl border-2 border-seaweed-500/50 bg-seaweed-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-seaweed-700"><ShieldCheck className="h-4 w-4" aria-hidden />{t('farmer.assistant.approvedAction')}</p>
            <p className="mt-1 font-semibold text-slate-900">{r.approvedAction.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ValidationBadge validated={r.approvedAction.validated} source={r.approvedAction.source} />
              {r.approvedAction.riskType && <span className="text-xs text-slate-600">{t(`risk.type.${r.approvedAction.riskType}`)}</span>}
            </div>
            {r.approvedAction.source && <p className="mt-1 text-xs text-slate-500">{t('farmer.assistant.source')}: {r.approvedAction.source}</p>}
          </div>
        )}
        {r.observationDraft && <DraftBox draft={r.observationDraft} farmId={farmId} recorded={msg.recorded} onRecorded={(risk) => onPatch({ recorded: risk })} />}
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Database className="h-3.5 w-3.5" aria-hidden />
          {r.farm ? t('farmer.assistant.fromRecords', { farm: r.farm.farmCode }) : t('farmer.assistant.noFarmRecords')}
          <Badge className={cx(r.generatedBy?.startsWith('LLM') ? 'bg-sky-50 text-sky-800 ring-sky-300' : 'bg-slate-100 text-slate-700 ring-slate-200')}>{sourceLabel(r.generatedBy, t)}</Badge>
        </p>
      </div>
    </div>
  );
}

function DraftBox({ draft, farmId, recorded, onRecorded }) {
  const { t } = useI18n();
  const invalidate = useInvalidateFarm();
  const confirm = useMutation({
    mutationFn: () => farmApi.addObservation(farmId, draft),
    onSuccess: (data) => { invalidate(farmId); onRecorded(data.risk); },
  });
  const yn = (b) => (b ? t('actions.yes') : t('actions.no'));
  const rows = [
    [t('farmer.obs.r.condition'), t(`farmer.enums.cropCondition.${draft.cropCondition}`)],
    [t('farmer.obs.r.whitening'), yn(draft.whitening)],
    [t('farmer.obs.r.breakage'), yn(draft.breakage)],
    [t('farmer.obs.f.epiphytes'), yn(draft.epiphytes)],
    [t('farmer.obs.f.percent'), draft.percentAffected != null ? `${draft.percentAffected}%` : '—'],
  ];
  return (
    <div className="rounded-xl border border-ocean-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ocean-800"><ClipboardCheck className="h-4 w-4" aria-hidden />{t('farmer.assistant.draftTitle')}</p>
      <dl className="mt-2 divide-y divide-slate-100 text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2 py-1.5"><dt className="text-slate-600">{k}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>)}
      </dl>
      {recorded ? (
        <div className="mt-3 space-y-3">
          <Notice tone="success">{t('farmer.obs.success')}</Notice>
          <ObservationResult risk={recorded} farmId={farmId} />
        </div>
      ) : (
        <>
          <FormError error={confirm.error} />
          <Button variant="success" className="mt-3 min-h-12 w-full" loading={confirm.isPending} onClick={() => confirm.mutate()}>{t('farmer.assistant.confirmRecord')}</Button>
        </>
      )}
    </div>
  );
}
