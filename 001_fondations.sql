-- =====================================================================
-- MBOOTAAY — 001_fondations.sql
-- Fondations multi-groupes : profils, tarifs et réglages de la plateforme,
-- groupes, membres et rôles, caisse ineffaçable, preuves de paiement,
-- annonces, journal, abonnements des groupes, stockage privé.
--
-- Principes de sécurité :
--   * aucune écriture directe sur les tables : tout passe par des fonctions
--     contrôlées (security definer) qui vérifient l'identité et le rôle ;
--   * lecture filtrée par RLS : un membre ne voit que les groupes dont il est
--     membre actif ;
--   * la caisse ne s'efface jamais : une erreur se corrige par une annulation.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 0. Outils
-- ---------------------------------------------------------------------
create or replace function public.mb_digits(p text) returns text
language sql immutable set search_path = public as $$ select regexp_replace(coalesce(p, ''), '\D', '', 'g') $$;

create or replace function public.mb_try_uuid(p text) returns uuid
language plpgsql immutable set search_path = public as $$
begin
  if p ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return p::uuid; end if;
  return null;
end; $$;

-- Numéro sénégalais à 9 chiffres (70, 71, 75, 76, 77, 78), avec ou sans 221
create or replace function public.mb_phone(p text) returns text
language plpgsql immutable set search_path = public as $$
declare d text := public.mb_digits(p);
begin
  if length(d) = 12 and left(d, 3) = '221' then d := right(d, 9); end if;
  if d !~ '^7[0-8][0-9]{7}$' then return null; end if;
  return '+221' || d;
end; $$;

-- ---------------------------------------------------------------------
-- 1. Profils (un par compte de connexion)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  last_name text not null check (char_length(last_name) between 1 and 60),
  phone text not null unique check (phone ~ '^\+2217[0-8][0-9]{7}$'),
  is_platform_owner boolean not null default false,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Création automatique du profil à l'inscription (prénom, nom, téléphone transmis par l'application)
create or replace function public.mb_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); v_phone text := public.mb_phone(m->>'phone');
begin
  if v_phone is null then raise exception 'Numéro de téléphone invalide'; end if;
  insert into public.profiles (id, first_name, last_name, phone)
  values (new.id, left(trim(coalesce(m->>'first_name', '')), 60), left(trim(coalesce(m->>'last_name', '')), 60), v_phone);
  return new;
end; $$;
create trigger mb_on_signup after insert on auth.users for each row execute function public.mb_on_signup();

create or replace function public.mb_is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_platform_owner and not is_blocked)
$$;

-- ---------------------------------------------------------------------
-- 2. Plateforme : formules (prix fixés par le propriétaire) et réglages
-- ---------------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  name text not null check (char_length(name) between 2 and 40),
  max_members integer not null check (max_members > 0),
  price_month integer not null check (price_month >= 0),
  price_year integer not null check (price_year >= 0),
  position integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.plans (id, name, max_members, price_month, price_year, position) values
  ('petit', 'Petit groupe', 30, 2500, 25000, 1),
  ('groupe', 'Groupe', 100, 5000, 50000, 2),
  ('grand', 'Grand groupe', 300, 10000, 100000, 3);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value, is_public) values
  ('trial_days', '15', true),
  ('readonly_days', '90', true),
  ('referral_months', '1', true),
  ('wave_number', 'null', true),          -- numéro Wave de Mbootaay pour les abonnements
  ('support_whatsapp', 'null', true),
  ('max_groups_per_user', '10', false);

create or replace function public.mb_setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$ select value from public.platform_settings where key = p_key $$;

-- ---------------------------------------------------------------------
-- 3. Groupes, membres et rôles
-- ---------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('tontine', 'amicale', 'dahira', 'chorale', 'association', 'gie', 'groupement_femmes', 'autre')),
  name text not null check (char_length(name) between 3 and 80),
  logo_path text,
  contribution_amount integer check (contribution_amount is null or contribution_amount between 100 and 100000000),
  contribution_period text not null default 'mensuelle' check (contribution_period in ('hebdomadaire', 'mensuelle', 'trimestrielle', 'annuelle', 'libre')),
  wave_number text check (wave_number is null or wave_number ~ '^\+2217[0-8][0-9]{7}$'),
  om_number text check (om_number is null or om_number ~ '^\+2217[0-8][0-9]{7}$'),
  phones_visible boolean not null default true,      -- les membres voient-ils les téléphones des autres ?
  invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{8}$'),
  plan_id text references public.plans(id),
  trial_ends_at timestamptz not null,
  paid_until timestamptz,
  is_suspended boolean not null default false,       -- décision du propriétaire de la plateforme
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'membre' check (role in ('proprietaire', 'president', 'tresorier', 'secretaire', 'membre')),
  status text not null default 'en_attente' check (status in ('en_attente', 'actif', 'refuse', 'retire', 'parti')),
  requested_at timestamptz not null default now(),
  joined_at timestamptz,
  decided_by uuid references public.profiles(id),
  primary key (group_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Rôle actif de l'utilisateur dans un groupe (null s'il n'est pas membre actif)
create or replace function public.mb_role(p_group uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.memberships m join public.profiles p on p.id = m.user_id
   where m.group_id = p_group and m.user_id = auth.uid() and m.status = 'actif' and not p.is_blocked
$$;
create or replace function public.mb_is_member(p_group uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.mb_role(p_group) is not null $$;
create or replace function public.mb_has_role(p_group uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.mb_role(p_group) = any (p_roles), false) $$;

-- État du groupe : essai, actif (payé), lecture seule (expiré), suspendu
create or replace function public.mb_group_state(p_group uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when g.is_suspended then 'suspendu'
    when g.paid_until is not null and g.paid_until > now() then 'actif'
    when g.trial_ends_at > now() then 'essai'
    else 'lecture_seule' end
  from public.groups g where g.id = p_group
$$;
-- Écritures autorisées seulement en essai ou abonnement actif
create or replace function public.mb_assert_writable(p_group uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare s text := public.mb_group_state(p_group);
begin
  if s is null then raise exception 'Groupe introuvable'; end if;
  if s = 'suspendu' then raise exception 'Ce groupe est suspendu. Contacte l''assistance Mbootaay.'; end if;
  if s = 'lecture_seule' then raise exception 'L''abonnement du groupe a expiré : le groupe est en lecture seule jusqu''au renouvellement.'; end if;
end; $$;

-- ---------------------------------------------------------------------
-- 4. Caisse ineffaçable
-- ---------------------------------------------------------------------
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  kind text not null check (kind in ('solde_initial', 'cotisation', 'entree', 'sortie', 'tour', 'aide', 'annulation')),
  sign smallint not null check (sign in (-1, 1)),
  amount bigint not null check (amount between 1 and 100000000000),
  member_id uuid references public.profiles(id),   -- membre concerné (cotisation, tour, aide)
  period text check (period is null or period ~ '^[0-9]{4}(-[0-9]{2}|-S[0-9]{2}|-T[1-4])?$'),
  label text not null check (char_length(label) between 2 and 200),
  proof_path text,
  reverses bigint unique references public.ledger_entries(id),  -- une annulation pointe vers l'opération annulée (une seule fois)
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index ledger_group_idx on public.ledger_entries (group_id, created_at desc);
create index ledger_member_idx on public.ledger_entries (group_id, member_id);

-- Même le propriétaire de la base ne peut pas modifier ou effacer une opération par erreur
create or replace function public.mb_ledger_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Une opération de caisse ne peut être ni modifiée ni supprimée : utilise une annulation.';
end; $$;
create trigger ledger_no_update before update on public.ledger_entries for each row execute function public.mb_ledger_immutable();
create trigger ledger_no_delete before delete on public.ledger_entries for each row
  when (pg_trigger_depth() = 0) execute function public.mb_ledger_immutable();

-- ---------------------------------------------------------------------
-- 5. Preuves de paiement envoyées par les membres
-- ---------------------------------------------------------------------
create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount between 1 and 100000000000),
  method text not null check (method in ('wave', 'orange_money', 'especes', 'autre')),
  period text check (period is null or period ~ '^[0-9]{4}(-[0-9]{2}|-S[0-9]{2}|-T[1-4])?$'),
  proof_path text,
  status text not null default 'en_attente' check (status in ('en_attente', 'valide', 'refuse')),
  note text check (note is null or char_length(note) <= 300),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  ledger_id bigint references public.ledger_entries(id),
  created_at timestamptz not null default now()
);
create index proofs_group_idx on public.payment_proofs (group_id, status, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Annonces et journal
-- ---------------------------------------------------------------------
create table public.announcements (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid references public.profiles(id),
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create index ann_group_idx on public.announcements (group_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  group_id uuid references public.groups(id) on delete cascade,
  actor uuid references public.profiles(id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_group_idx on public.audit_log (group_id, created_at desc);
create trigger audit_no_update before update on public.audit_log for each row execute function public.mb_ledger_immutable();

create or replace function public.mb_log(p_group uuid, p_action text, p_target text, p_details jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (group_id, actor, action, target, details) values (p_group, auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------
-- 7. Abonnements des groupes (payés à Mbootaay)
-- ---------------------------------------------------------------------
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  plan_id text not null references public.plans(id),
  months integer not null check (months in (1, 12)),
  amount integer not null check (amount >= 0),
  proof_path text,
  status text not null default 'en_attente' check (status in ('en_attente', 'valide', 'refuse', 'offert')),
  submitted_by uuid not null references public.profiles(id),
  note text check (note is null or char_length(note) <= 300),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index subpay_status_idx on public.subscription_payments (status, created_at desc);

-- ---------------------------------------------------------------------
-- 8. Lecture : RLS (aucune écriture directe possible)
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.platform_settings enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_log enable row level security;
alter table public.subscription_payments enable row level security;

revoke all on public.profiles, public.plans, public.platform_settings, public.groups, public.memberships,
  public.ledger_entries, public.payment_proofs, public.announcements, public.audit_log, public.subscription_payments
  from anon, authenticated;

grant select on public.plans to anon, authenticated;
grant select on public.profiles, public.groups, public.memberships, public.ledger_entries, public.payment_proofs,
  public.announcements, public.audit_log, public.subscription_payments, public.platform_settings to authenticated;

create policy plans_read on public.plans for select to anon, authenticated using (is_active);
create policy plans_read_owner on public.plans for select to authenticated using (public.mb_is_owner());
create policy settings_read on public.platform_settings for select to authenticated using (is_public or public.mb_is_owner());
-- profil : le sien ; les autres passent par mb_group_members() qui applique la règle des téléphones
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.mb_is_owner());
create policy groups_read on public.groups for select to authenticated using (public.mb_is_member(id) or public.mb_is_owner());
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.mb_is_member(group_id) or public.mb_is_owner());
create policy ledger_read on public.ledger_entries for select to authenticated using (public.mb_is_member(group_id) or public.mb_is_owner());
create policy proofs_read on public.payment_proofs for select to authenticated
  using (user_id = auth.uid() or public.mb_has_role(group_id, array['proprietaire', 'president', 'tresorier']) or public.mb_is_owner());
create policy ann_read on public.announcements for select to authenticated using (public.mb_is_member(group_id) or public.mb_is_owner());
create policy audit_read on public.audit_log for select to authenticated
  using ((group_id is not null and public.mb_has_role(group_id, array['proprietaire', 'president', 'tresorier', 'secretaire'])) or public.mb_is_owner());
create policy subpay_read on public.subscription_payments for select to authenticated
  using (public.mb_has_role(group_id, array['proprietaire', 'president', 'tresorier']) or public.mb_is_owner());

-- ---------------------------------------------------------------------
-- 9. Actions des membres et du bureau
-- ---------------------------------------------------------------------
create or replace function public.mb_new_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..8 loop c := c || substr(a, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1); end loop;
    exit when not exists (select 1 from public.groups where invite_code = c);
  end loop;
  return c;
end; $$;

create or replace function public.mb_require_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Connexion requise'; end if;
  if exists (select 1 from public.profiles where id = v and is_blocked) then raise exception 'Compte bloqué : contacte l''assistance Mbootaay.'; end if;
  if not exists (select 1 from public.profiles where id = v) then raise exception 'Profil introuvable'; end if;
  return v;
end; $$;

-- Créer un groupe : le créateur en devient propriétaire, essai gratuit automatique
create or replace function public.create_group(p_type text, p_name text, p_amount integer, p_period text, p_wave text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user(); v_id uuid; v_wave text;
begin
  if (select count(*) from public.memberships where user_id = v_uid and role = 'proprietaire' and status = 'actif')
     >= coalesce((public.mb_setting('max_groups_per_user'))::text::int, 10) then
    raise exception 'Nombre maximum de groupes atteint pour ce compte.';
  end if;
  if (select count(*) from public.groups where created_by = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Trop de groupes créés aujourd''hui. Réessaie demain.';
  end if;
  v_wave := case when nullif(trim(coalesce(p_wave, '')), '') is null then null else public.mb_phone(p_wave) end;
  if nullif(trim(coalesce(p_wave, '')), '') is not null and v_wave is null then raise exception 'Numéro Wave invalide'; end if;
  insert into public.groups (type, name, contribution_amount, contribution_period, wave_number, invite_code, trial_ends_at, created_by)
  values (p_type, trim(p_name), p_amount, coalesce(p_period, 'mensuelle'), v_wave, public.mb_new_code(),
          now() + make_interval(days => coalesce((public.mb_setting('trial_days'))::text::int, 15)), v_uid)
  returning id into v_id;
  insert into public.memberships (group_id, user_id, role, status, joined_at, decided_by) values (v_id, v_uid, 'proprietaire', 'actif', now(), v_uid);
  perform public.mb_log(v_id, 'groupe_cree', v_id::text, jsonb_build_object('type', p_type, 'nom', p_name));
  return v_id;
end; $$;

-- Demander à rejoindre un groupe avec son code d'invitation
create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user(); v_g public.groups%rowtype; v_status text;
begin
  select * into v_g from public.groups where invite_code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'Code d''invitation introuvable'; end if;
  if (select count(*) from public.memberships where user_id = v_uid and requested_at > now() - interval '1 day' and status = 'en_attente') >= 10 then
    raise exception 'Trop de demandes aujourd''hui. Réessaie demain.';
  end if;
  select status into v_status from public.memberships where group_id = v_g.id and user_id = v_uid;
  if v_status = 'actif' then raise exception 'Tu es déjà membre de ce groupe'; end if;
  if v_status = 'en_attente' then return v_g.id; end if;
  if v_status = 'retire' then raise exception 'Le bureau t''a retiré de ce groupe : contacte-le directement.'; end if;
  insert into public.memberships (group_id, user_id, role, status) values (v_g.id, v_uid, 'membre', 'en_attente')
  on conflict (group_id, user_id) do update set status = 'en_attente', role = 'membre', requested_at = now(), decided_by = null, joined_at = null;
  perform public.mb_log(v_g.id, 'demande_adhesion', v_uid::text, '{}'::jsonb);
  return v_g.id;
end; $$;

-- Valider, refuser ou retirer un membre (propriétaire, président, secrétaire)
create or replace function public.review_member(p_group uuid, p_user uuid, p_decision text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user(); v_m public.memberships%rowtype; v_max int; v_count int;
begin
  if not public.mb_has_role(p_group, array['proprietaire', 'president', 'secretaire']) then raise exception 'Action réservée au bureau du groupe'; end if;
  if p_decision not in ('accepter', 'refuser', 'retirer') then raise exception 'Décision invalide'; end if;
  perform public.mb_assert_writable(p_group);
  select * into v_m from public.memberships where group_id = p_group and user_id = p_user for update;
  if not found then raise exception 'Membre introuvable'; end if;
  if p_user = v_uid then raise exception 'Tu ne peux pas décider pour toi-même'; end if;
  if v_m.role = 'proprietaire' then raise exception 'Le propriétaire du groupe ne peut pas être retiré'; end if;
  if p_decision = 'accepter' then
    if v_m.status <> 'en_attente' then raise exception 'Cette demande a déjà été traitée'; end if;
    select coalesce(p.max_members, 300) into v_max from public.groups g left join public.plans p on p.id = g.plan_id where g.id = p_group;
    select count(*) into v_count from public.memberships where group_id = p_group and status = 'actif';
    if v_count >= coalesce(v_max, 300) then raise exception 'Nombre maximum de membres atteint pour la formule du groupe'; end if;
    update public.memberships set status = 'actif', joined_at = now(), decided_by = v_uid where group_id = p_group and user_id = p_user;
  elsif p_decision = 'refuser' then
    if v_m.status <> 'en_attente' then raise exception 'Cette demande a déjà été traitée'; end if;
    update public.memberships set status = 'refuse', decided_by = v_uid where group_id = p_group and user_id = p_user;
  else
    if v_m.status <> 'actif' then raise exception 'Ce membre n''est pas actif'; end if;
    -- un membre du bureau ne peut être retiré que par le propriétaire
    if v_m.role <> 'membre' and public.mb_role(p_group) <> 'proprietaire' then raise exception 'Seul le propriétaire peut retirer un membre du bureau'; end if;
    update public.memberships set status = 'retire', role = 'membre', decided_by = v_uid where group_id = p_group and user_id = p_user;
  end if;
  perform public.mb_log(p_group, 'membre_' || p_decision, p_user::text, '{}'::jsonb);
end; $$;

-- Changer le rôle d'un membre (propriétaire uniquement) ; transfert de propriété inclus
create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user();
begin
  if public.mb_role(p_group) is distinct from 'proprietaire' then raise exception 'Action réservée au propriétaire du groupe'; end if;
  if p_role not in ('proprietaire', 'president', 'tresorier', 'secretaire', 'membre') then raise exception 'Rôle invalide'; end if;
  if p_user = v_uid then raise exception 'Pour changer ton propre rôle, transfère d''abord la propriété du groupe'; end if;
  if not exists (select 1 from public.memberships where group_id = p_group and user_id = p_user and status = 'actif') then raise exception 'Ce membre n''est pas actif dans le groupe'; end if;
  if p_role = 'proprietaire' then
    update public.memberships set role = 'president' where group_id = p_group and user_id = v_uid;   -- l'ancien propriétaire devient président
  end if;
  update public.memberships set role = p_role where group_id = p_group and user_id = p_user;
  perform public.mb_log(p_group, 'role_change', p_user::text, jsonb_build_object('role', p_role));
end; $$;

-- Quitter un groupe (le propriétaire doit d'abord transférer la propriété)
create or replace function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user();
begin
  if public.mb_role(p_group) is null then raise exception 'Tu n''es pas membre de ce groupe'; end if;
  if public.mb_role(p_group) = 'proprietaire' then raise exception 'Transfère d''abord la propriété du groupe à un autre membre'; end if;
  update public.memberships set status = 'parti', role = 'membre' where group_id = p_group and user_id = v_uid;
  perform public.mb_log(p_group, 'membre_parti', v_uid::text, '{}'::jsonb);
end; $$;

-- Réglages du groupe (propriétaire, président) ; tout changement de numéro de paiement est annoncé à tous
create or replace function public.update_group(p_group uuid, p_name text, p_amount integer, p_period text, p_wave text, p_om text, p_phones_visible boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.groups%rowtype; v_wave text; v_om text;
begin
  perform public.mb_require_user();
  if not public.mb_has_role(p_group, array['proprietaire', 'president']) then raise exception 'Action réservée au propriétaire ou au président'; end if;
  perform public.mb_assert_writable(p_group);
  select * into v_old from public.groups where id = p_group for update;
  v_wave := case when nullif(trim(coalesce(p_wave, '')), '') is null then null else public.mb_phone(p_wave) end;
  v_om := case when nullif(trim(coalesce(p_om, '')), '') is null then null else public.mb_phone(p_om) end;
  if nullif(trim(coalesce(p_wave, '')), '') is not null and v_wave is null then raise exception 'Numéro Wave invalide'; end if;
  if nullif(trim(coalesce(p_om, '')), '') is not null and v_om is null then raise exception 'Numéro Orange Money invalide'; end if;
  update public.groups set name = trim(p_name), contribution_amount = p_amount, contribution_period = coalesce(p_period, contribution_period),
         wave_number = v_wave, om_number = v_om, phones_visible = coalesce(p_phones_visible, phones_visible)
   where id = p_group;
  if v_old.wave_number is distinct from v_wave or v_old.om_number is distinct from v_om then
    insert into public.announcements (group_id, author_id, title, body, is_system)
    values (p_group, auth.uid(), 'Numéro de paiement modifié',
            'Attention : le numéro de paiement du groupe a été changé. Wave : ' || coalesce(v_wave, 'aucun') || ' · Orange Money : ' || coalesce(v_om, 'aucun')
            || '. En cas de doute, vérifie auprès du bureau avant de payer.', true);
    perform public.mb_log(p_group, 'numero_paiement_change', p_group::text,
      jsonb_build_object('wave_avant', v_old.wave_number, 'wave_apres', v_wave, 'om_avant', v_old.om_number, 'om_apres', v_om));
  end if;
  perform public.mb_log(p_group, 'groupe_modifie', p_group::text, '{}'::jsonb);
end; $$;

-- Liste des membres d'un groupe (téléphones visibles selon le réglage du groupe ou pour le bureau)
create or replace function public.group_members(p_group uuid)
returns table (user_id uuid, first_name text, last_name text, phone text, role text, status text, joined_at timestamptz, requested_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_role text := public.mb_role(p_group); v_bureau boolean; v_show boolean;
begin
  if v_role is null and not public.mb_is_owner() then raise exception 'Accès réservé aux membres du groupe'; end if;
  v_bureau := v_role in ('proprietaire', 'president', 'tresorier', 'secretaire') or public.mb_is_owner();
  select phones_visible into v_show from public.groups where id = p_group;
  return query
    select m.user_id, p.first_name, p.last_name,
           case when v_bureau or v_show or m.user_id = auth.uid() then p.phone else null end,
           m.role, m.status, m.joined_at, m.requested_at
      from public.memberships m join public.profiles p on p.id = m.user_id
     where m.group_id = p_group and (m.status = 'actif' or (v_bureau and m.status = 'en_attente'))
     order by case m.role when 'proprietaire' then 0 when 'president' then 1 when 'tresorier' then 2 when 'secretaire' then 3 else 4 end, p.last_name, p.first_name;
end; $$;

-- Mes groupes (avec mon rôle, l'état du groupe et le solde)
create or replace function public.my_groups()
returns table (group_id uuid, name text, type text, role text, status text, state text, balance bigint, members bigint, pending_proofs bigint)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.type, m.role, m.status, public.mb_group_state(g.id),
         case when m.status = 'actif' then (select coalesce(sum(sign * amount), 0) from public.ledger_entries l where l.group_id = g.id) end,
         (select count(*) from public.memberships x where x.group_id = g.id and x.status = 'actif'),
         case when m.status = 'actif' and m.role in ('proprietaire', 'president', 'tresorier')
              then (select count(*) from public.payment_proofs pp where pp.group_id = g.id and pp.status = 'en_attente') else 0 end
    from public.memberships m join public.groups g on g.id = m.group_id
   where m.user_id = auth.uid() and m.status in ('actif', 'en_attente')
   order by m.status, g.name
$$;

-- Le membre envoie la preuve de son paiement
create or replace function public.submit_proof(p_group uuid, p_amount bigint, p_method text, p_period text, p_proof_path text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user(); v_id uuid;
begin
  if not public.mb_is_member(p_group) then raise exception 'Accès réservé aux membres du groupe'; end if;
  perform public.mb_assert_writable(p_group);
  if p_proof_path is not null and (split_part(p_proof_path, '/', 1) <> p_group::text or split_part(p_proof_path, '/', 2) <> v_uid::text) then
    raise exception 'Chemin de la capture invalide';
  end if;
  if (select count(*) from public.payment_proofs where user_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Trop d''envois aujourd''hui. Réessaie demain.';
  end if;
  insert into public.payment_proofs (group_id, user_id, amount, method, period, proof_path)
  values (p_group, v_uid, p_amount, p_method, nullif(trim(coalesce(p_period, '')), ''), p_proof_path)
  returning id into v_id;
  perform public.mb_log(p_group, 'preuve_envoyee', v_id::text, jsonb_build_object('montant', p_amount, 'moyen', p_method));
  return v_id;
end; $$;

-- Le trésorier (ou le propriétaire) valide ou refuse une preuve ; la validation crée l'opération de caisse
create or replace function public.review_proof(p_proof uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user(); v_p public.payment_proofs%rowtype; v_ledger bigint;
begin
  select * into v_p from public.payment_proofs where id = p_proof for update;
  if not found then raise exception 'Preuve introuvable'; end if;
  if not public.mb_has_role(v_p.group_id, array['proprietaire', 'tresorier']) then raise exception 'Action réservée au trésorier ou au propriétaire du groupe'; end if;
  perform public.mb_assert_writable(v_p.group_id);
  if v_p.status <> 'en_attente' then raise exception 'Cette preuve a déjà été traitée'; end if;
  if p_decision not in ('valider', 'refuser') then raise exception 'Décision invalide'; end if;
  if p_decision = 'valider' then
    insert into public.ledger_entries (group_id, kind, sign, amount, member_id, period, label, proof_path, created_by)
    values (v_p.group_id, 'cotisation', 1, v_p.amount, v_p.user_id, v_p.period,
            'Cotisation' || coalesce(' ' || v_p.period, '') || ' (' || v_p.method || ')', v_p.proof_path, v_uid)
    returning id into v_ledger;
  end if;
  update public.payment_proofs set status = case when p_decision = 'valider' then 'valide' else 'refuse' end,
         note = nullif(left(trim(coalesce(p_note, '')), 300), ''), reviewed_by = v_uid, reviewed_at = now(), ledger_id = v_ledger
   where id = p_proof;
  perform public.mb_log(v_p.group_id, 'preuve_' || p_decision, p_proof::text, jsonb_build_object('montant', v_p.amount, 'membre', v_p.user_id));
end; $$;

-- Saisie directe dans la caisse (trésorier, propriétaire) : solde initial, entrée, sortie, tour versé, aide
create or replace function public.add_ledger_entry(p_group uuid, p_kind text, p_amount bigint, p_member uuid, p_period text, p_label text, p_proof_path text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user(); v_id bigint;
begin
  if not public.mb_has_role(p_group, array['proprietaire', 'tresorier']) then raise exception 'Action réservée au trésorier ou au propriétaire du groupe'; end if;
  perform public.mb_assert_writable(p_group);
  if p_kind not in ('solde_initial', 'cotisation', 'entree', 'sortie', 'tour', 'aide') then raise exception 'Type d''opération invalide'; end if;
  if p_kind = 'solde_initial' and exists (select 1 from public.ledger_entries where group_id = p_group and kind = 'solde_initial'
       and id not in (select reverses from public.ledger_entries where group_id = p_group and reverses is not null)) then
    raise exception 'Un solde initial existe déjà : annule-le d''abord si tu dois le corriger';
  end if;
  if p_member is not null and not exists (select 1 from public.memberships where group_id = p_group and user_id = p_member) then
    raise exception 'Ce membre n''appartient pas au groupe';
  end if;
  if p_proof_path is not null and split_part(p_proof_path, '/', 1) <> p_group::text then raise exception 'Chemin du justificatif invalide'; end if;
  insert into public.ledger_entries (group_id, kind, sign, amount, member_id, period, label, proof_path, created_by)
  values (p_group, p_kind, case when p_kind in ('sortie', 'tour', 'aide') then -1 else 1 end, p_amount, p_member,
          nullif(trim(coalesce(p_period, '')), ''), trim(p_label), p_proof_path, v_uid)
  returning id into v_id;
  perform public.mb_log(p_group, 'caisse_' || p_kind, v_id::text, jsonb_build_object('montant', p_amount, 'libelle', p_label));
  return v_id;
end; $$;

-- Annuler une opération (jamais de suppression) : crée l'opération inverse, visible par tous
create or replace function public.reverse_ledger_entry(p_entry bigint, p_reason text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user(); v_e public.ledger_entries%rowtype; v_id bigint;
begin
  select * into v_e from public.ledger_entries where id = p_entry for update;
  if not found then raise exception 'Opération introuvable'; end if;
  if not public.mb_has_role(v_e.group_id, array['proprietaire', 'tresorier']) then raise exception 'Action réservée au trésorier ou au propriétaire du groupe'; end if;
  perform public.mb_assert_writable(v_e.group_id);
  if v_e.kind = 'annulation' then raise exception 'Une annulation ne peut pas être annulée'; end if;
  if exists (select 1 from public.ledger_entries where reverses = p_entry) then raise exception 'Cette opération a déjà été annulée'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Indique la raison de l''annulation'; end if;
  insert into public.ledger_entries (group_id, kind, sign, amount, member_id, period, label, reverses, created_by)
  values (v_e.group_id, 'annulation', -v_e.sign, v_e.amount, v_e.member_id, v_e.period, left('Annulation : ' || trim(p_reason), 200), p_entry, v_uid)
  returning id into v_id;
  perform public.mb_log(v_e.group_id, 'caisse_annulation', p_entry::text, jsonb_build_object('raison', p_reason, 'montant', v_e.amount));
  return v_id;
end; $$;

-- Publier une annonce (propriétaire, président, secrétaire)
create or replace function public.post_announcement(p_group uuid, p_title text, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public.mb_require_user();
  if not public.mb_has_role(p_group, array['proprietaire', 'president', 'secretaire']) then raise exception 'Action réservée au bureau du groupe'; end if;
  perform public.mb_assert_writable(p_group);
  insert into public.announcements (group_id, author_id, title, body) values (p_group, auth.uid(), trim(p_title), trim(p_body)) returning id into v_id;
  perform public.mb_log(p_group, 'annonce_publiee', v_id::text, '{}'::jsonb);
  return v_id;
end; $$;

-- Ma situation dans un groupe
create or replace function public.my_situation(p_group uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user();
begin
  if not public.mb_is_member(p_group) then raise exception 'Accès réservé aux membres du groupe'; end if;
  return jsonb_build_object(
    'balance', (select coalesce(sum(sign * amount), 0) from public.ledger_entries where group_id = p_group),
    'my_total', (select coalesce(sum(amount), 0) from public.ledger_entries l where group_id = p_group and member_id = v_uid and kind = 'cotisation'
                   and not exists (select 1 from public.ledger_entries r where r.reverses = l.id)),
    'my_received', (select coalesce(sum(amount), 0) from public.ledger_entries l where group_id = p_group and member_id = v_uid and kind in ('tour', 'aide')
                   and not exists (select 1 from public.ledger_entries r where r.reverses = l.id)),
    'pending_proofs', (select count(*) from public.payment_proofs where group_id = p_group and user_id = v_uid and status = 'en_attente'),
    'state', public.mb_group_state(p_group),
    'role', public.mb_role(p_group)
  );
end; $$;

-- Le bureau envoie la preuve du paiement de l'abonnement Mbootaay
create or replace function public.submit_subscription(p_group uuid, p_plan text, p_months integer, p_proof_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.mb_require_user(); v_plan public.plans%rowtype; v_id uuid;
begin
  if not public.mb_has_role(p_group, array['proprietaire', 'president', 'tresorier']) then raise exception 'Action réservée au bureau du groupe'; end if;
  select * into v_plan from public.plans where id = p_plan and is_active;
  if not found then raise exception 'Formule indisponible'; end if;
  if p_months not in (1, 12) then raise exception 'Durée invalide'; end if;
  if p_proof_path is not null and split_part(p_proof_path, '/', 1) <> p_group::text then raise exception 'Chemin de la capture invalide'; end if;
  if exists (select 1 from public.subscription_payments where group_id = p_group and status = 'en_attente') then raise exception 'Un paiement d''abonnement est déjà en attente de vérification'; end if;
  insert into public.subscription_payments (group_id, plan_id, months, amount, proof_path, submitted_by)
  values (p_group, p_plan, p_months, case when p_months = 12 then v_plan.price_year else v_plan.price_month end, p_proof_path, v_uid)
  returning id into v_id;
  perform public.mb_log(p_group, 'abonnement_envoye', v_id::text, jsonb_build_object('formule', p_plan, 'mois', p_months));
  return v_id;
end; $$;

-- ---------------------------------------------------------------------
-- 10. Console du propriétaire de la plateforme (Julien)
-- ---------------------------------------------------------------------
create or replace function public.owner_review_subscription(p_payment uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_p public.subscription_payments%rowtype; v_from timestamptz;
begin
  if not public.mb_is_owner() then raise exception 'Accès réservé au propriétaire de Mbootaay'; end if;
  if p_decision not in ('valider', 'refuser', 'offrir') then raise exception 'Décision invalide'; end if;
  select * into v_p from public.subscription_payments where id = p_payment for update;
  if not found then raise exception 'Paiement introuvable'; end if;
  if v_p.status <> 'en_attente' then raise exception 'Ce paiement a déjà été traité'; end if;
  update public.subscription_payments set status = case p_decision when 'valider' then 'valide' when 'offrir' then 'offert' else 'refuse' end,
         note = nullif(left(trim(coalesce(p_note, '')), 300), ''), reviewed_at = now() where id = p_payment;
  if p_decision <> 'refuser' then
    select greatest(coalesce(paid_until, now()), now()) into v_from from public.groups where id = v_p.group_id;
    update public.groups set plan_id = v_p.plan_id, paid_until = v_from + make_interval(months => v_p.months) where id = v_p.group_id;
  end if;
  perform public.mb_log(v_p.group_id, 'abonnement_' || p_decision, p_payment::text, jsonb_build_object('formule', v_p.plan_id, 'mois', v_p.months, 'montant', v_p.amount));
end; $$;

create or replace function public.owner_save_plan(p_id text, p_name text, p_max integer, p_month integer, p_year integer, p_position integer, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.mb_is_owner() then raise exception 'Accès réservé au propriétaire de Mbootaay'; end if;
  insert into public.plans (id, name, max_members, price_month, price_year, position, is_active, updated_at)
  values (p_id, trim(p_name), p_max, p_month, p_year, coalesce(p_position, 0), coalesce(p_active, true), now())
  on conflict (id) do update set name = excluded.name, max_members = excluded.max_members, price_month = excluded.price_month,
     price_year = excluded.price_year, position = excluded.position, is_active = excluded.is_active, updated_at = now();
  perform public.mb_log(null, 'tarif_modifie', p_id, jsonb_build_object('mois', p_month, 'an', p_year, 'max', p_max));
end; $$;

create or replace function public.owner_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.mb_is_owner() then raise exception 'Accès réservé au propriétaire de Mbootaay'; end if;
  if p_key not in ('trial_days', 'readonly_days', 'referral_months', 'wave_number', 'support_whatsapp', 'max_groups_per_user') then raise exception 'Réglage inconnu'; end if;
  if p_key in ('wave_number', 'support_whatsapp') and p_value <> 'null'::jsonb and public.mb_phone(p_value #>> '{}') is null then raise exception 'Numéro invalide'; end if;
  if p_key in ('trial_days', 'readonly_days', 'referral_months', 'max_groups_per_user') and (jsonb_typeof(p_value) <> 'number' or (p_value)::text::int < 0) then raise exception 'Valeur invalide'; end if;
  update public.platform_settings
     set value = case when p_key in ('wave_number', 'support_whatsapp') and p_value <> 'null'::jsonb then to_jsonb(public.mb_phone(p_value #>> '{}')) else p_value end,
         updated_at = now()
   where key = p_key;
  perform public.mb_log(null, 'reglage_modifie', p_key, jsonb_build_object('valeur', p_value));
end; $$;

create or replace function public.owner_set_suspended(p_group uuid, p_suspended boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.mb_is_owner() then raise exception 'Accès réservé au propriétaire de Mbootaay'; end if;
  update public.groups set is_suspended = p_suspended where id = p_group;
  if not found then raise exception 'Groupe introuvable'; end if;
  perform public.mb_log(p_group, case when p_suspended then 'groupe_suspendu' else 'groupe_reactive' end, p_group::text, jsonb_build_object('raison', p_reason));
end; $$;

create or replace function public.owner_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.mb_is_owner() then raise exception 'Accès réservé au propriétaire de Mbootaay'; end if;
  return jsonb_build_object(
    'groups', (select count(*) from public.groups),
    'by_state', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) from (select public.mb_group_state(id) s, count(*) n from public.groups group by 1) x),
    'by_type', (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb) from (select type, count(*) n from public.groups group by 1) x),
    'members', (select count(*) from public.memberships where status = 'actif'),
    'users', (select count(*) from public.profiles),
    'revenue_month', (select coalesce(sum(amount), 0) from public.subscription_payments where status = 'valide' and date_trunc('month', reviewed_at) = date_trunc('month', now())),
    'revenue_total', (select coalesce(sum(amount), 0) from public.subscription_payments where status = 'valide'),
    'pending_subscriptions', (select count(*) from public.subscription_payments where status = 'en_attente'),
    'trials_ending_7d', (select count(*) from public.groups where paid_until is null and trial_ends_at between now() and now() + interval '7 days')
  );
end; $$;

-- ---------------------------------------------------------------------
-- 11. Droits d'exécution : uniquement pour les comptes connectés
-- ---------------------------------------------------------------------
revoke all on all functions in schema public from public, anon;
grant execute on function public.create_group(text, text, integer, text, text), public.join_group(text), public.review_member(uuid, uuid, text),
  public.set_member_role(uuid, uuid, text), public.leave_group(uuid), public.update_group(uuid, text, integer, text, text, text, boolean),
  public.group_members(uuid), public.my_groups(), public.submit_proof(uuid, bigint, text, text, text), public.review_proof(uuid, text, text),
  public.add_ledger_entry(uuid, text, bigint, uuid, text, text, text), public.reverse_ledger_entry(bigint, text),
  public.post_announcement(uuid, text, text), public.my_situation(uuid), public.submit_subscription(uuid, text, integer, text),
  public.owner_review_subscription(uuid, text, text), public.owner_save_plan(text, text, integer, integer, integer, integer, boolean),
  public.owner_set_setting(text, jsonb), public.owner_set_suspended(uuid, boolean, text), public.owner_dashboard(),
  public.mb_is_owner(), public.mb_try_uuid(text), public.mb_is_member(uuid), public.mb_has_role(uuid, text[]), public.mb_role(uuid), public.mb_group_state(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 12. Stockage privé : captures de paiement, justificatifs, logos
--     Chemin imposé : <groupe>/<membre>/<fichier> ; liens temporaires uniquement
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mb-preuves', 'mb-preuves', false, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy mb_preuves_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'mb-preuves'
              and public.mb_is_member(public.mb_try_uuid((storage.foldername(name))[1]))
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy mb_preuves_read on storage.objects for select to authenticated
  using (bucket_id = 'mb-preuves'
         and ((storage.foldername(name))[2] = auth.uid()::text
              or public.mb_has_role(public.mb_try_uuid((storage.foldername(name))[1]), array['proprietaire', 'president', 'tresorier'])
              or public.mb_is_owner()));
