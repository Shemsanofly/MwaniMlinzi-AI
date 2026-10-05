import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { authApi } from '../../api/endpoints.js';
import { Button, Field, FormError, Notice, PasswordInput } from '../../components/ui/index.jsx';
import AuthShell from './components/AuthShell.jsx';
import LoginAside from './components/LoginAside.jsx';

const PASSWORD_OK = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/**
 * Forgot password in two short steps on one page:
 *  1. registered email → a 6-digit code is sent by email;
 *  2. code + new password → password changed → log in.
 */
export default function ForgotPassword() {
  const { t } = useI18n();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const run = async (fn) => {
    setError(null);
    setPending(true);
    try { await fn(); } catch (err) { setError(err); } finally { setPending(false); }
  };

  const sendCode = (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 200) { setErrors({ email: t('public.reset.errors.email') }); return; }
    setErrors({});
    run(async () => { await authApi.forgotPassword(email.trim().toLowerCase()); setStep('code'); });
  };

  const reset = (e) => {
    e.preventDefault();
    const next = {};
    if (!/^\d{6}$/.test(code.trim())) next.code = t('public.reset.errors.code');
    if (!PASSWORD_OK(password)) next.password = t('public.reset.errors.password');
    setErrors(next);
    if (Object.keys(next).length) return;
    run(async () => { await authApi.resetPassword({ email: email.trim().toLowerCase(), code: code.trim(), newPassword: password }); setStep('done'); });
  };

  if (step === 'done') {
    return (
      <AuthShell aside={<LoginAside />} title={t('public.reset.doneTitle')}>
        <div className="flex flex-col items-center gap-3 text-center" role="status">
          <CheckCircle2 className="h-12 w-12 text-seaweed-600" aria-hidden />
          <p className="text-slate-700">{t('public.reset.doneText')}</p>
          <Link to="/login" state={{ identifier: email.trim().toLowerCase() }} className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-ocean-700 px-5 py-3 font-semibold text-white hover:bg-ocean-800">{t('actions.login')}</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell aside={<LoginAside />} title={t('public.reset.title')} subtitle={step === 'email' ? t('public.reset.subtitle') : null}>
      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <Field label={t('public.form.email')} htmlFor="reset-email" required error={errors.email} hint={t('public.reset.emailHint')}>
            <input id="reset-email" type="email" inputMode="email" autoComplete="email" maxLength={200} className="input" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
          </Field>
          <FormError error={error} />
          <Button type="submit" size="lg" className="w-full" loading={pending} icon={Mail}>{pending ? t('public.reset.sending') : t('public.reset.sendCode')}</Button>
        </form>
      ) : (
        <form onSubmit={reset} className="space-y-4" noValidate>
          <Notice tone="info" icon={Mail}>{t('public.reset.codeSent', { email: email.trim().toLowerCase() })}</Notice>
          <Field label={t('public.reset.code')} htmlFor="reset-code" required error={errors.code}>
            <input id="reset-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input tracking-[0.3em]" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-invalid={!!errors.code} />
          </Field>
          <Field label={t('public.reset.newPassword')} htmlFor="reset-password" required error={errors.password} hint={t('public.register.passwordHint')}>
            <PasswordInput id="reset-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
          </Field>
          <FormError error={error} />
          <Button type="submit" size="lg" className="w-full" loading={pending} icon={KeyRound}>{pending ? t('public.reset.saving') : t('public.reset.save')}</Button>
          <button type="button" disabled={pending} className="min-h-11 w-full text-sm font-semibold text-ocean-700" onClick={() => { setStep('email'); setCode(''); setErrors({}); setError(null); }}>{t('public.reset.resend')}</button>
        </form>
      )}
      <p className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <Link to="/login" className="font-semibold text-ocean-700 hover:text-ocean-900">← {t('public.reset.backToLogin')}</Link>
      </p>
    </AuthShell>
  );
}
