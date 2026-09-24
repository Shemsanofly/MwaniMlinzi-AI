import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { HOME_FOR_ROLE, useAuth } from '../../stores/AuthContext.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Button, Field, FormError } from '../../components/ui/index.jsx';
import AuthShell from './components/AuthShell.jsx';

/** Only allow in-app redirect targets (no protocol-relative or external URLs). */
function safeFrom(from) {
  const path = typeof from === 'string' ? from : from?.pathname;
  return path && path.startsWith('/') && !path.startsWith('//') && path !== '/login' ? path : null;
}

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(location.state?.email || params.get('email') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError({ message: t('public.login.missing') });
      return;
    }
    setPending(true);
    try {
      const user = await login(email.trim(), password);
      navigate(safeFrom(location.state?.from) || HOME_FOR_ROLE[user?.primaryRole] || '/app', { replace: true });
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  return (
    <AuthShell title={t('public.login.title')} subtitle={t('public.login.subtitle')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('public.form.email')} htmlFor="login-email" required>
          <input id="login-email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label={t('public.form.password')} htmlFor="login-password" required>
          <input id="login-password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <FormError error={error} />
        <Button type="submit" size="lg" className="w-full" loading={pending} icon={LogIn}>
          {pending ? t('public.login.signingIn') : t('actions.login')}
        </Button>
      </form>
      <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
        <p>{t('public.login.noAccount')} <Link to="/register" className="font-semibold text-ocean-700 hover:text-ocean-900">{t('actions.register')}</Link></p>
        <p>{t('public.login.demoHint')} <Link to="/demo" className="font-semibold text-ocean-700 hover:text-ocean-900">{t('public.login.demoLink')}</Link></p>
      </div>
    </AuthShell>
  );
}
