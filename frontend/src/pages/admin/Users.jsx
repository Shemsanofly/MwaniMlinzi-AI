import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, KeyRound, Pencil, Plus, Search, Users as UsersIcon } from 'lucide-react';
import { adminApi, cooperativeApi } from '../../api/endpoints.js';
import { useAuth } from '../../stores/AuthContext.jsx';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import {
  Badge, Button, Card, CardHeader, DemoBadge, EmptyState, ErrorState, Field, FormError, Modal, Notice, PageHeader, PageLoader, Table, Toggle, cx,
} from '../../components/ui/index.jsx';
import { date, timeAgo } from '../../utils/format.js';
import { Pagination, Tabs } from './components/shared.jsx';

const ROLES = ['FARMER', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'BUYER', 'ADMIN'];
const PAGE_SIZE = 20;

function RoleBadges({ roles }) {
  const { t } = useI18n();
  return <span className="flex flex-wrap gap-1">{roles.map((r) => <Badge key={r} className={r === 'ADMIN' ? 'bg-ocean-50 text-ocean-800 ring-ocean-200' : undefined}>{t(`roles.${r}`)}</Badge>)}</span>;
}

function RolePicker({ value, onChange, idPrefix }) {
  const { t } = useI18n();
  const toggle = (r) => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('admin.users.roles')}>
      {ROLES.map((r) => (
        <label key={r} htmlFor={`${idPrefix}-${r}`} className={cx('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm', value.includes(r) ? 'border-ocean-500 bg-ocean-50 text-ocean-900' : 'border-slate-200 text-slate-700')}>
          <input id={`${idPrefix}-${r}`} type="checkbox" className="accent-ocean-700" checked={value.includes(r)} onChange={() => toggle(r)} />
          {t(`roles.${r}`)}
        </label>
      ))}
    </div>
  );
}

function CoopSelect({ id, value, onChange }) {
  const { t } = useI18n();
  const coops = useQuery({ queryKey: ['cooperatives'], queryFn: cooperativeApi.list });
  return (
    <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value || null)} disabled={coops.isLoading}>
      <option value="">{coops.isLoading ? t('actions.loading') : t('common.none')}</option>
      {coops.data?.cooperatives?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
    </select>
  );
}

/** Create (user == null) or edit a user. */
function UserModal({ open, user, onClose }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const isEdit = !!user;
  const blank = { email: '', password: '', fullName: '', phone: '', roles: ['FARMER'], cooperativeId: null, preferredLanguage: 'sw', isActive: true };
  const [f, setF] = useState(blank);
  const [localError, setLocalError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setF(user ? { ...blank, fullName: user.fullName, phone: user.phone || '', roles: user.roles, cooperativeId: user.cooperative?.id || null, isActive: user.isActive } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);
  const m = useMutation({
    mutationFn: (body) => (isEdit ? adminApi.updateUser(user.id, body) : adminApi.createUser(body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      onClose(true);
    },
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    setLocalError(null);
    if (!f.roles.length) return setLocalError({ message: t('admin.users.needRole') });
    if (!isEdit && f.password.length < 8) return setLocalError({ message: t('admin.users.passwordShort') });
    const phone = f.phone.trim() ? f.phone.trim().replace(/\s/g, '') : null;
    const body = isEdit
      ? { fullName: f.fullName.trim(), phone, roles: f.roles, cooperativeId: f.cooperativeId, isActive: f.isActive }
      : { email: f.email.trim(), password: f.password, fullName: f.fullName.trim(), phone, roles: f.roles, cooperativeId: f.cooperativeId, preferredLanguage: f.preferredLanguage };
    return m.mutate(body);
  };
  return (
    <Modal
      open={open}
      onClose={() => onClose(false)}
      size="lg"
      title={isEdit ? t('admin.users.editTitle', { name: user.fullName }) : t('admin.users.createTitle')}
      footer={<>
        <Button variant="secondary" onClick={() => onClose(false)}>{t('actions.cancel')}</Button>
        <Button type="submit" form="user-form" loading={m.isPending}>{isEdit ? t('actions.save') : t('actions.create')}</Button>
      </>}
    >
      <form id="user-form" onSubmit={submit} className="space-y-4" noValidate>
        {isEdit && <p className="text-sm text-slate-500">{user.email}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {!isEdit && (
            <Field label={t('public.form.email')} htmlFor="u-email" required>
              <input id="u-email" type="email" className="input" value={f.email} onChange={set('email')} required />
            </Field>
          )}
          {!isEdit && (
            <Field label={t('public.form.password')} htmlFor="u-pass" required hint={t('admin.users.passwordHint')}>
              <input id="u-pass" type="password" autoComplete="new-password" className="input" value={f.password} onChange={set('password')} required />
            </Field>
          )}
          <Field label={t('public.form.fullName')} htmlFor="u-name" required>
            <input id="u-name" className="input" value={f.fullName} onChange={set('fullName')} required />
          </Field>
          <Field label={t('public.form.phone')} htmlFor="u-phone" hint="+2557…">
            <input id="u-phone" type="tel" className="input" value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label={t('common.cooperative')} htmlFor="u-coop" hint={t('admin.users.coopHint')}>
            <CoopSelect id="u-coop" value={f.cooperativeId} onChange={(v) => setF((x) => ({ ...x, cooperativeId: v }))} />
          </Field>
          {!isEdit ? (
            <Field label={t('public.form.language')} htmlFor="u-lang" required>
              <select id="u-lang" className="input" value={f.preferredLanguage} onChange={set('preferredLanguage')}>
                <option value="sw">Kiswahili</option>
                <option value="en">English</option>
              </select>
            </Field>
          ) : (
            <div className="flex items-end pb-2">
              <Toggle id="u-active" checked={f.isActive} onChange={(v) => setF((x) => ({ ...x, isActive: v }))} label={t('admin.users.active')} />
            </div>
          )}
        </div>
        <div>
          <p className="label">{t('admin.users.roles')}</p>
          <RolePicker idPrefix="u-role" value={f.roles} onChange={(roles) => setF((x) => ({ ...x, roles }))} />
          {isEdit && <p className="mt-1 text-xs text-slate-500">{t('admin.users.rolesNote')}</p>}
        </div>
        <FormError error={localError || m.error} />
      </form>
    </Modal>
  );
}

function UsersTab() {
  const { t, lang } = useI18n();
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState({ open: false, user: null });
  const [flash, setFlash] = useState(null);
  // Debounce the search box.
  useEffect(() => {
    const id = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [search]);
  const params = { search: query, role, page, limit: PAGE_SIZE };
  const users = useQuery({ queryKey: ['admin', 'users', params], queryFn: () => adminApi.users(params), placeholderData: keepPreviousData });

  const columns = [
    {
      key: 'name', header: t('admin.users.user'), render: (u) => (
        <div className="min-w-[12rem]">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">{u.fullName}{u.isDemo && <DemoBadge />}{u.id === me?.id && <Badge>{t('admin.users.you')}</Badge>}</p>
          <p className="text-xs text-slate-500">{u.email}</p>
        </div>
      ),
    },
    { key: 'phone', header: t('public.form.phone'), render: (u) => <span className="whitespace-nowrap font-mono text-xs">{u.phone || '—'}</span> },
    { key: 'roles', header: t('admin.users.roles'), render: (u) => <RoleBadges roles={u.roles} /> },
    { key: 'coop', header: t('common.cooperative'), render: (u) => u.cooperative?.name || '—' },
    { key: 'status', header: t('common.status'), render: (u) => <Badge className={u.isActive ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-red-50 text-red-800 ring-red-300'}>{u.isActive ? t('admin.users.active') : t('admin.users.disabled')}</Badge> },
    { key: 'last', header: t('admin.users.lastLogin'), render: (u) => <span className="whitespace-nowrap text-xs">{u.lastLoginAt ? timeAgo(u.lastLoginAt, lang) : t('admin.users.never')}</span> },
    { key: 'created', header: t('admin.users.created'), render: (u) => <span className="whitespace-nowrap text-xs">{date(u.createdAt, lang)}</span> },
    { key: 'edit', header: '', render: (u) => <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setModal({ open: true, user: u })} aria-label={`${t('actions.edit')} ${u.fullName}`}>{t('actions.edit')}</Button> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="user-search" className="label">{t('actions.search')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="user-search" type="search" className="input pl-9" placeholder={t('admin.users.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="sm:w-56">
          <label htmlFor="user-role" className="label">{t('admin.users.role')}</label>
          <select id="user-role" className="input" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </select>
        </div>
        <Button icon={Plus} onClick={() => setModal({ open: true, user: null })}>{t('admin.users.new')}</Button>
      </div>
      {flash && <Notice tone="success">{flash}</Notice>}
      {users.isLoading ? <PageLoader /> : users.error ? <ErrorState error={users.error} onRetry={users.refetch} /> : (
        <>
          <div className={cx(users.isFetching && 'opacity-60 transition-opacity')}>
            <Table columns={columns} rows={users.data.users} empty={<EmptyState icon={UsersIcon} title={t('admin.users.none')} />} />
          </div>
          <Pagination page={users.data.page} limit={users.data.limit} total={users.data.total} onPage={setPage} />
        </>
      )}
      <UserModal
        open={modal.open}
        user={modal.user}
        onClose={(saved) => {
          if (saved) setFlash(modal.user ? t('admin.users.updated') : t('admin.users.createdMsg'));
          setModal({ open: false, user: null });
        }}
      />
    </div>
  );
}

function RolesTab() {
  const { t } = useI18n();
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: adminApi.roles });
  if (roles.isLoading) return <PageLoader />;
  if (roles.error) return <ErrorState error={roles.error} onRetry={roles.refetch} />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {roles.data.roles.map((r) => (
        <Card key={r.id}>
          <CardHeader icon={KeyRound} title={t(`roles.${r.name}`)} subtitle={r.description} action={<Badge>{t('admin.users.userCount', { n: r.users })}</Badge>} />
          <div className="flex flex-wrap gap-1.5 p-4">
            {r.permissions.length ? r.permissions.map((p) => <code key={p} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{p}</code>) : <span className="text-sm text-slate-500">{t('common.none')}</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function CoopModal({ open, coop, onClose }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const blank = { code: '', name: '', district: '', region: '', description: '' };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (open) setF(coop ? { code: coop.code, name: coop.name, district: coop.district, region: coop.region, description: coop.description || '' } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, coop]);
  const m = useMutation({
    mutationFn: (body) => (coop ? cooperativeApi.update(coop.id, body) : cooperativeApi.create(body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cooperatives'] });
      qc.invalidateQueries({ queryKey: ['publicCooperatives'] });
      onClose(true);
    },
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    m.mutate({ code: f.code.trim().toUpperCase(), name: f.name.trim(), district: f.district.trim(), region: f.region.trim(), description: f.description.trim() || null });
  };
  return (
    <Modal
      open={open}
      onClose={() => onClose(false)}
      title={coop ? t('admin.coops.editTitle') : t('admin.coops.createTitle')}
      footer={<>
        <Button variant="secondary" onClick={() => onClose(false)}>{t('actions.cancel')}</Button>
        <Button type="submit" form="coop-form" loading={m.isPending}>{coop ? t('actions.save') : t('actions.create')}</Button>
      </>}
    >
      <form id="coop-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label={t('admin.coops.code')} htmlFor="c-code" required hint={t('admin.coops.codeHint')}>
          <input id="c-code" className="input font-mono uppercase" value={f.code} onChange={set('code')} />
        </Field>
        <Field label={t('admin.coops.name')} htmlFor="c-name" required>
          <input id="c-name" className="input" value={f.name} onChange={set('name')} />
        </Field>
        <Field label={t('common.district')} htmlFor="c-district" required>
          <input id="c-district" className="input" value={f.district} onChange={set('district')} />
        </Field>
        <Field label={t('admin.coops.region')} htmlFor="c-region" required>
          <input id="c-region" className="input" value={f.region} onChange={set('region')} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('admin.coops.description')} htmlFor="c-desc">
            <textarea id="c-desc" rows={3} className="input" value={f.description} onChange={set('description')} />
          </Field>
        </div>
        <div className="sm:col-span-2"><FormError error={m.error} /></div>
      </form>
    </Modal>
  );
}

function CoopsTab() {
  const { t } = useI18n();
  const [modal, setModal] = useState({ open: false, coop: null });
  const [flash, setFlash] = useState(null);
  const coops = useQuery({ queryKey: ['cooperatives'], queryFn: cooperativeApi.list });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button icon={Plus} onClick={() => setModal({ open: true, coop: null })}>{t('admin.coops.new')}</Button></div>
      {flash && <Notice tone="success">{flash}</Notice>}
      {coops.isLoading ? <PageLoader /> : coops.error ? <ErrorState error={coops.error} onRetry={coops.refetch} /> : (
        <Table
          rows={coops.data.cooperatives}
          empty={<EmptyState icon={Building2} title={t('admin.coops.none')} />}
          columns={[
            { key: 'code', header: t('admin.coops.code'), render: (c) => <span className="font-mono text-xs font-semibold">{c.code}</span> },
            { key: 'name', header: t('admin.coops.name'), render: (c) => <span className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">{c.name}{c.isDemo && <DemoBadge />}</span> },
            { key: 'district', header: t('common.district') },
            { key: 'region', header: t('admin.coops.region') },
            { key: 'members', header: t('admin.coops.members'), render: (c) => c._count?.members ?? '—' },
            { key: 'farms', header: t('admin.dashboard.farms'), render: (c) => c._count?.farms ?? '—' },
            { key: 'edit', header: '', render: (c) => <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setModal({ open: true, coop: c })}>{t('actions.edit')}</Button> },
          ]}
        />
      )}
      <CoopModal
        open={modal.open}
        coop={modal.coop}
        onClose={(saved) => {
          if (saved) setFlash(t('admin.coops.saved'));
          setModal({ open: false, coop: null });
        }}
      />
    </div>
  );
}

export default function AdminUsers() {
  const { t } = useI18n();
  const [tab, setTab] = useState('users');
  return (
    <div>
      <PageHeader title={t('admin.users.title')} subtitle={t('admin.users.subtitle')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'users', label: t('admin.users.tabUsers'), icon: UsersIcon },
          { id: 'roles', label: t('admin.users.tabRoles'), icon: KeyRound },
          { id: 'coops', label: t('admin.users.tabCoops'), icon: Building2 },
        ]}
      />
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'coops' && <CoopsTab />}
    </div>
  );
}
