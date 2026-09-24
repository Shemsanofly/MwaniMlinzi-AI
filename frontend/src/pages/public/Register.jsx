import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ShieldCheck, Sprout, UserPlus } from 'lucide-react';
import { metaApi } from '../../api/endpoints.js';
import { HOME_FOR_ROLE, useAuth } from '../../stores/AuthContext.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Button, Field, FormError, cx } from '../../components/ui/index.jsx';
import AuthShell from './components/AuthShell.jsx';
import { normalizeTzPhone } from '../../utils/phone.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side mirror of the backend registerSchema; returns { field: messageKey }. */
export function validateRegistration(f) {
  const e = {};
  if (!f.fullName.trim()) e.fullName = 'required';
  if (!f.phone.trim()) e.phone = 'required';
  else if (!normalizeTzPhone(f.phone)) e.phone = 'phone';
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = 'email';
  if (f.password.length < 8) e.password = 'passwordLength';
  else if (!/[A-Za-z]/.test(f.password) || !/[0-9]/.test(f.password)) e.password = 'passwordMix';
  if (f.confirm !== f.password) e.confirm = 'passwordMatch';
  if (!f.consent) e.consent = 'consent';
  return e;
}

export default function Register() {
  const { t, lang } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', confirm: '', role: 'FARMER', preferredLanguage: lang,
    cooperativeCode: '', companyName: '', village: '', district: '', smsEnabled: true, consent: false,
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [pending, setPending] = useState(false);
  const coops = useQuery({ queryKey: ['publicCooperatives'], queryFn: metaApi.publicCooperatives, staleTime: 10 * 60_000 });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const err = (k) => (errors[k] ? t(`public.register.errors.${errors[k]}`) : null);
  const serverErr = (k) => apiError?.details?.find?.((d) => d.path === k)?.message;

  const submit = async (e) => {
    e.preventDefault();
    setApiError(null);
    const v = validateRegistration(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    const isFarmer = form.role === 'FARMER';
    const body = {
      fullName: form.fullName.trim(),
      phone: normalizeTzPhone(form.phone),
      email: form.email.trim() || null,
      password: form.password,
      role: form.role,
      preferredLanguage: form.preferredLanguage,
      cooperativeCode: isFarmer && form.cooperativeCode ? form.cooperativeCode : null,
      companyName: !isFarmer && form.companyName.trim() ? form.companyName.trim() : null,
      village: isFarmer && form.village.trim() ? form.village.trim() : null,
      district: isFarmer && form.district.trim() ? form.district.trim() : null,
      smsEnabled: form.smsEnabled,
      consent: true,
    };
    setPending(true);
    try {
      const user = await register(body);
      navigate(HOME_FOR_ROLE[user?.primaryRole] || '/app', { replace: true });
    } catch (ex) {
      setApiError(ex);
      setPending(false);
    }
  };

  const roleOption = (value, Icon) => (
    <label key={value} className={cx('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition', form.role === value ? 'border-ocean-500 bg-ocean-50 ring-1 ring-ocean-500' : 'border-slate-200 hover:border-ocean-300')}>
      <input type="radio" name="role" value={value} checked={form.role === value} onChange={set('role')} className="mt-1 accent-ocean-700" />
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ocean-600" aria-hidden />
      <span>
        <span className="block font-semibold text-slate-900">{t(`roles.${value}`)}</span>
        <span className="block text-xs text-slate-500">{t(`public.register.roleHint.${value}`)}</span>
      </span>
    </label>
  );

  const emailField = (
    <Field label={t('public.form.email')} htmlFor="reg-email" hint={t('public.register.emailHint')} error={err('email') || serverErr('email')}>
      <input id="reg-email" type="email" className="input" autoComplete="email" value={form.email} onChange={set('email')} />
    </Field>
  );

  return (
    <AuthShell wide title={t('public.register.title')} subtitle={t('public.register.subtitle')}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <fieldset>
          <legend className="label">{t('public.register.iAm')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {roleOption('FARMER', Sprout)}
            {roleOption('BUYER', Building2)}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('public.form.fullName')} htmlFor="reg-name" required error={err('fullName') || serverErr('fullName')}>
            <input id="reg-name" className="input" autoComplete="name" value={form.fullName} onChange={set('fullName')} />
          </Field>
          <Field label={t('public.form.phone')} htmlFor="reg-phone" required hint={t('public.register.phoneHint')} error={err('phone') || serverErr('phone')}>
            <input id="reg-phone" type="tel" inputMode="tel" className="input" autoComplete="tel" placeholder="0777 123 456" value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label={t('public.form.password')} htmlFor="reg-pass" required hint={t('public.register.passwordHint')} error={err('password') || serverErr('password')}>
            <input id="reg-pass" type="password" className="input" autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <Field label={t('public.form.confirmPassword')} htmlFor="reg-confirm" required error={err('confirm')}>
            <input id="reg-confirm" type="password" className="input" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="label">{t('public.form.language')} <span className="text-red-600" aria-hidden>*</span></legend>
            <div className="grid grid-cols-2 gap-3">
              {['sw', 'en'].map((l) => (
                <label key={l} className={cx('flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-base font-semibold', form.preferredLanguage === l ? 'border-ocean-500 bg-ocean-50 ring-1 ring-ocean-500' : 'border-slate-200')}>
                  <input type="radio" name="preferredLanguage" value={l} checked={form.preferredLanguage === l} onChange={set('preferredLanguage')} className="accent-ocean-700" />
                  <span lang={l}>{l === 'sw' ? 'Kiswahili' : 'English'}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <label htmlFor="reg-sms" className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
          <input id="reg-sms" type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-ocean-700" checked={form.smsEnabled} onChange={set('smsEnabled')} />
          <span className="text-sm text-slate-800"><span className="block font-semibold">{t('public.register.smsOptIn')}</span><span className="block text-xs text-slate-500">{t('public.register.smsOptInHint')}</span></span>
        </label>

        {form.role === 'FARMER' ? (
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-sand-50 p-4 sm:grid-cols-2">
            <p className="text-sm font-semibold text-slate-700 sm:col-span-2">{t('public.register.optionalTitle')}</p>
            <div className="sm:col-span-2">
              <Field label={t('public.form.cooperative')} htmlFor="reg-coop" hint={t('public.register.coopHint')} error={serverErr('cooperativeCode')}>
                <select id="reg-coop" className="input" value={form.cooperativeCode} onChange={set('cooperativeCode')} disabled={coops.isLoading}>
                  <option value="">{coops.isLoading ? t('actions.loading') : t('public.register.noCoop')}</option>
                  {coops.data?.cooperatives?.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.district})</option>)}
                </select>
              </Field>
              {coops.error && <p className="mt-1 text-xs text-red-700">{t('public.register.coopLoadError')}</p>}
            </div>
            <Field label={t('public.form.village')} htmlFor="reg-village">
              <input id="reg-village" className="input" value={form.village} onChange={set('village')} />
            </Field>
            <Field label={t('public.form.district')} htmlFor="reg-district">
              <input id="reg-district" className="input" value={form.district} onChange={set('district')} />
            </Field>
            <div className="sm:col-span-2">{emailField}</div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-sand-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-700">{t('public.register.optionalTitle')}</p>
            <Field label={t('public.form.companyName')} htmlFor="reg-company" error={serverErr('companyName')}>
              <input id="reg-company" className="input" autoComplete="organization" value={form.companyName} onChange={set('companyName')} />
            </Field>
            <div className="mt-4">{emailField}</div>
          </div>
        )}

        <div className={cx('rounded-xl border p-4', errors.consent ? 'border-red-300 bg-red-50' : 'border-ocean-200 bg-ocean-50/60')}>
          <label htmlFor="reg-consent" className="flex cursor-pointer items-start gap-3">
            <input id="reg-consent" type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-ocean-700" checked={form.consent} onChange={set('consent')} aria-describedby="reg-consent-more" />
            <span className="text-sm text-slate-800">
              <span className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4 text-ocean-700" aria-hidden />{t('public.register.consentTitle')}</span>
              <span className="mt-1 block">{t('public.register.consentText')}</span>
            </span>
          </label>
          <p id="reg-consent-more" className="mt-2 pl-8 text-xs text-slate-500">{t('public.register.consentMore')}</p>
          {errors.consent && <p className="mt-1 pl-8 text-xs font-medium text-red-700">{t('public.register.errors.consent')}</p>}
        </div>

        <FormError error={apiError} />
        <Button type="submit" size="lg" className="w-full" loading={pending} icon={UserPlus}>{t('actions.register')}</Button>
      </form>
      <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-600">
        {t('public.register.haveAccount')} <Link to="/login" className="font-semibold text-ocean-700 hover:text-ocean-900">{t('actions.login')}</Link>
      </p>
    </AuthShell>
  );
}
