-- Urbex Atlas — schéma Supabase
-- À exécuter dans l'éditeur SQL de ton projet Supabase
-- (Dashboard → SQL Editor → New query → colle tout → Run).
-- Ce script est idempotent : tu peux le relancer sans risque pour migrer.

-- ─────────────────────────── Table des spots ───────────────────────────
create table if not exists public.spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'autre',
  status text not null default 'repere',
  lat double precision not null,
  lng double precision not null,
  description text not null default '',
  access_notes text not null default '',
  danger int not null default 2 check (danger between 1 and 5),
  photos jsonb not null default '[]',
  approach jsonb,
  checklist jsonb not null default '[]',
  favorite boolean not null default false,
  visited_at date,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration douce depuis une version antérieure (sans effet si déjà présent) :
alter table public.spots add column if not exists approach jsonb;
alter table public.spots add column if not exists checklist jsonb not null default '[]';
alter table public.spots add column if not exists favorite boolean not null default false;

-- ─────────────────────────── Équipe / invitations ───────────────────────────
-- Seuls les emails présents dans cette table voient et modifient la carte.
create table if not exists public.members (
  email text primary key,
  added_by text not null default '',
  added_at timestamptz not null default now()
);

-- 👉 BOOTSTRAP OBLIGATOIRE : mets TON email ci-dessous (en minuscules).
-- Ce bloc s'arrête volontairement tant que le placeholder n'est pas remplacé,
-- pour t'éviter de te verrouiller toi-même hors de tes propres spots.
do $$
declare
  owner_email text := 'ton-email@example.com';  -- 👈 REMPLACE par ton email
begin
  if owner_email = 'ton-email@example.com' then
    raise exception 'Bootstrap : remplace ton-email@example.com par ton vrai email avant d''exécuter le script.';
  end if;
  insert into public.members (email, added_by)
    values (lower(owner_email), 'bootstrap')
    on conflict (email) do nothing;
end $$;

-- Un compte connecté est « membre » si son email (vérifié) est dans members.
-- ⚠️ La sécurité de l'invitation REPOSE sur la vérification d'email : garde
-- « Confirm email » ACTIVÉ (Authentication → Providers → Email), sinon
-- quelqu'un pourrait créer un compte avec l'email d'un invité sans le posséder.
-- La connexion Google est déjà vérifiée par Google.
create or replace function public.is_member()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

alter table public.members enable row level security;

drop policy if exists "members read" on public.members;
create policy "members read" on public.members
  for select to authenticated using (public.is_member());

drop policy if exists "members invite" on public.members;
create policy "members invite" on public.members
  for insert to authenticated with check (public.is_member());

-- Un membre peut retirer un autre membre, MAIS pas la ligne « bootstrap »
-- (l'owner) ni lui-même — évite les prises de contrôle et les verrouillages.
drop policy if exists "members remove" on public.members;
create policy "members remove" on public.members
  for delete to authenticated
  using (
    public.is_member()
    and added_by <> 'bootstrap'
    and lower(email) <> lower(auth.jwt() ->> 'email')
  );

-- ─────────────────────────── Sécurité des spots ───────────────────────────
-- Seuls les membres invités ont accès. Quelqu'un qui se connecte sans être
-- invité ne voit rien et ne peut rien écrire.
alter table public.spots enable row level security;

drop policy if exists "authenticated read" on public.spots;
drop policy if exists "members read spots" on public.spots;
create policy "members read spots" on public.spots
  for select to authenticated using (public.is_member());

drop policy if exists "authenticated insert" on public.spots;
drop policy if exists "members insert spots" on public.spots;
create policy "members insert spots" on public.spots
  for insert to authenticated with check (public.is_member());

drop policy if exists "authenticated update" on public.spots;
drop policy if exists "members update spots" on public.spots;
create policy "members update spots" on public.spots
  for update to authenticated using (public.is_member()) with check (public.is_member());

drop policy if exists "authenticated delete" on public.spots;
drop policy if exists "members delete spots" on public.spots;
create policy "members delete spots" on public.spots
  for delete to authenticated using (public.is_member());

-- ─────────────────────────── Temps réel ───────────────────────────
do $$
begin
  alter publication supabase_realtime add table public.spots;
exception
  when duplicate_object then null;
end $$;

-- ─────────────────────────── Sécurité : à retenir ───────────────────────────
-- 1. GARDE « Confirm email » ACTIVÉ (Authentication → Providers → Email).
--    C'est ce qui empêche quelqu'un de s'inscrire avec l'email d'un invité
--    sans posséder cette boîte mail. La connexion Google est déjà vérifiée.
-- 2. Tu peux, en plus, fermer les inscriptions une fois vos comptes créés
--    (Authentication → Sign In / Providers → « Allow new user signups »).
-- 3. Seuls les emails de la table members voient la carte ; l'owner (ligne
--    « bootstrap ») ne peut pas être retiré depuis l'app.
