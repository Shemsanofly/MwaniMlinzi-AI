import { useEffect, useState } from 'react';
import { BellRing, KeyRound, Languages, Phone, Save } from 'lucide-react';
import { authApi } from '../../api/endpoints.js';
import { useAuth } from '../../stores/AuthContext.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Button, Card, CardHeader, Field, FormError, Notice, PageHeader, cx } from '../../components/ui/index.jsx';
import { formatTzPhone, normalizeTzPhone } from '../../utils/phone.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Saved({ show }) {
  const { t } = useI18n();
  return show ? <p role="status" className="text-sm font-medium text-seaweed-700">✓ {t('account.saved')}</p> : null;
}

/** One large, touch-friendly preference row (checkbox + title + explanation). */
function PrefRow({ id, checked, onChange, title, text, disabled }) {
  return (
    <label htmlFor={id} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3', disabled ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60' : 'border-slate-200 hover:border-ocean-300')}>
      <input id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-ocean-700" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-600">{text}</span>
      </span>
    </label>
  );
}

/** Account settings for every role: language, contact details, SMS preferences, password. */
export default function AccountSettings() {
  const { t, lang, setLang } = useI18n();
  const { user, refresh } = useAuth();

  const [contact, setContact] = useState({ phone: '', email: '' });
  const [contactErr, setContactErr] = useState({});
  const [prefs, setPrefs] = useState({ smsEnabled: true, notifyRiskAlerts: true, notifyHarvest: true, notifySystem: true });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState(null);
  const [state, setState] = useState({ section: null, pending: false, saved: null, error: null });

  useEffect(() => {
    if (!user) return;
    setContact({ phone: user.phone ? formatTzPhone(user.phone) : '', email: user.email || '' });
    setPrefs({ smsEnabled: user.smsEnabled !== false, notifyRiskAlerts: user.notifyRiskAlerts !== false, notifyHarvest: user.notifyHarvest !== false, notifySystem: user.notifySystem !== false });
  }, [user]);

  const run = async (section, fn) => {
    setState({ section, pending: true, saved: null, error: null });
    try {
      await fn();
      await refresh();
      setState({ section, pending: false, saved: section, error: null });
    } catch (error) {
      setState({ section, pending: false, saved: null, error });
    }
  };
  const busy = (section) => state.pending && state.section === section;
  const errorFor = (section) => (state.section === section ? state.error : null);

  const chooseLanguage = (next) => run('language', async () => {
    setLang(next);
    await authApi.updateMe({ preferredLanguage: next });
  });

  const saveContact = (e) => {
    e.preventDefault();
    const errs = {};
    const phone = normalizeTzPhone(contact.phone);
    if (!phone) errs.phone = t('public.register.errors.phone');
    if (contact.email.trim() && !EMAIL_RE.test(contact.email.trim())) errs.email = t('public.register.errors.email');
    setContactErr(errs);
    if (Object.keys(errs).length) return;
    run('contact', () => authApi.updateMe({ phone, email: contact.email.trim() || null }));
  };

  const savePrefs = (e) => {
    e.preventDefault();
    run('prefs', () => authApi.updateMe(prefs));
  };

  const savePassword = (e) => {
    e.preventDefault();
    setPwErr(null);
    if (pw.next.length < 8) return setPwErr(t('public.register.errors.passwordLength'));
    if (!/[A-Za-z]/.test(pw.next) || !/[0-9]/.test(pw.next)) return setPwErr(t('public.register.errors.passwordMix'));
    if (pw.next !== pw.confirm) return setPwErr(t('public.register.errors.passwordMatch'));
    return run('password', async () => {
      await authApi.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
    });
  };

  const setPref = (k) => (v) => setPrefs((p) => ({ ...p, [k]: v }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />

      <Card>
        <CardHeader icon={Languages} title={t('account.languageTitle')} subtitle={t('account.languageText')} />
        <div className="space-y-3 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('account.languageTitle')}>
            {['sw', 'en'].map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                lang={l}
                disabled={busy('language')}
                onClick={() => chooseLanguage(l)}
                className={cx('rounded-xl border p-4 text-lg font-bold transition', lang === l ? 'border-ocean-500 bg-ocean-50 text-ocean-900 ring-1 ring-ocean-500' : 'border-slate-200 text-slate-700 hover:border-ocean-300')}
              >
                {l === 'sw' ? 'Kiswahili' : 'English'}
              </button>
            ))}
          </div>
          <Saved show={state.saved === 'language'} />
          <FormError error={errorFor('language')} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={Phone} title={t('account.contactTitle')} subtitle={t('account.contactText')} />
        <form onSubmit={saveContact} className="space-y-4 p-4 sm:p-5" noValidate>
          <Field label={t('public.form.phone')} htmlFor="acc-phone" required hint={t('public.register.phoneHint')} error={contactErr.phone}>
            <input id="acc-phone" type="tel" inputMode="tel" autoComplete="tel" className="input" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
          </Field>
          <Field label={t('public.form.email')} htmlFor="acc-email" hint={t('public.register.emailHint')} error={contactErr.email}>
            <input id="acc-email" type="email" autoComplete="email" className="input" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
          </Field>
          <FormError error={errorFor('contact')} />
          <div className="flex items-center gap-3">
            <Button type="submit" icon={Save} loading={busy('contact')}>{t('actions.save')}</Button>
            <Saved show={state.saved === 'contact'} />
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader icon={BellRing} title={t('account.smsTitle')} subtitle={t('account.smsText')} />
        <form onSubmit={savePrefs} className="space-y-3 p-4 sm:p-5">
          <PrefRow id="pref-sms" checked={prefs.smsEnabled} onChange={setPref('smsEnabled')} title={t('account.prefs.smsEnabled')} text={t('account.prefs.smsEnabledText')} />
          <div className="space-y-3 pl-0 sm:pl-6">
            <PrefRow id="pref-risk" checked={prefs.notifyRiskAlerts} onChange={setPref('notifyRiskAlerts')} disabled={!prefs.smsEnabled} title={t('account.prefs.risk')} text={t('account.prefs.riskText')} />
            <PrefRow id="pref-harvest" checked={prefs.notifyHarvest} onChange={setPref('notifyHarvest')} disabled={!prefs.smsEnabled} title={t('account.prefs.harvest')} text={t('account.prefs.harvestText')} />
            <PrefRow id="pref-system" checked={prefs.notifySystem} onChange={setPref('notifySystem')} disabled={!prefs.smsEnabled} title={t('account.prefs.system')} text={t('account.prefs.systemText')} />
          </div>
          {!user?.phone && <Notice tone="warning">{t('account.noPhone')}</Notice>}
          <FormError error={errorFor('prefs')} />
          <div className="flex items-center gap-3">
            <Button type="submit" icon={Save} loading={busy('prefs')}>{t('actions.save')}</Button>
            <Saved show={state.saved === 'prefs'} />
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader icon={KeyRound} title={t('account.passwordTitle')} />
        <form onSubmit={savePassword} className="space-y-4 p-4 sm:p-5" noValidate>
          <Field label={t('account.currentPassword')} htmlFor="acc-pw-current" required>
            <input id="acc-pw-current" type="password" autoComplete="current-password" className="input" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
          </Field>
          <Field label={t('account.newPassword')} htmlFor="acc-pw-new" required hint={t('public.register.passwordHint')}>
            <input id="acc-pw-new" type="password" autoComplete="new-password" className="input" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
          </Field>
          <Field label={t('public.form.confirmPassword')} htmlFor="acc-pw-confirm" required error={pwErr}>
            <input id="acc-pw-confirm" type="password" autoComplete="new-password" className="input" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
          </Field>
          <FormError error={errorFor('password')} />
          <div className="flex items-center gap-3">
            <Button type="submit" icon={KeyRound} loading={busy('password')} disabled={!pw.current || !pw.next}>{t('account.changePassword')}</Button>
            <Saved show={state.saved === 'password'} />
          </div>
        </form>
      </Card>
    </div>
  );
}
