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

-- 👉 BOOTSTRAP OBLIGATOIRE : ajoute TON email ici (en minuscules) avant de
-- resserrer les règles ci-dessous, sinon tu perdrais l'accès à tes propres
-- spots. Remplace l'adresse puis garde cette ligne :
insert into public.members (email, added_by)
  values ('ton-email@example.com', 'bootstrap')
  on conflict (email) do nothing;

-- Un compte connecté est « membre » si son email est dans public.members.
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

drop policy if exists "members remove" on public.members;
create policy "members remove" on public.members
  for delete to authenticated using (public.is_member());

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

-- Astuce confort : Authentication → Providers → Email → désactiver
-- « Confirm email » simplifie la première connexion (pas de mail à valider).
-- Avec le système d'invitation ci-dessus, laisser les inscriptions ouvertes
-- n'expose plus tes spots : un non-membre ne voit rien.
