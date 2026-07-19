-- Urbex Atlas — schéma Supabase
-- À exécuter une seule fois dans l'éditeur SQL de ton projet Supabase
-- (Dashboard → SQL Editor → New query → colle tout → Run).

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
  visited_at date,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sécurité : seules les personnes connectées (toi + ton cousin) peuvent
-- lire et modifier les spots. Personne d'autre n'y a accès.
alter table public.spots enable row level security;

drop policy if exists "authenticated read" on public.spots;
create policy "authenticated read" on public.spots
  for select to authenticated using (true);

drop policy if exists "authenticated insert" on public.spots;
create policy "authenticated insert" on public.spots
  for insert to authenticated with check (true);

drop policy if exists "authenticated update" on public.spots;
create policy "authenticated update" on public.spots
  for update to authenticated using (true) with check (true);

drop policy if exists "authenticated delete" on public.spots;
create policy "authenticated delete" on public.spots
  for delete to authenticated using (true);

-- Temps réel : chaque ajout / modif / suppression est poussé instantanément
-- vers les autres appareils connectés.
do $$
begin
  alter publication supabase_realtime add table public.spots;
exception
  when duplicate_object then null;
end $$;

-- Optionnel mais recommandé : limite l'inscription aux personnes qui ont le
-- lien — dans le Dashboard : Authentication → Providers → Email,
-- tu peux aussi désactiver « Confirm email » pour simplifier la connexion.
