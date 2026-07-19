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

-- Sécurité : seuls les comptes connectés peuvent lire et modifier les spots.
-- ⚠️ ATTENTION : par défaut Supabase laisse les INSCRIPTIONS OUVERTES —
-- n'importe qui connaissant l'URL du projet pourrait créer un compte et donc
-- accéder à la carte. Une fois vos comptes créés, fermez les inscriptions :
-- Dashboard → Authentication → Sign In / Providers → décocher
-- « Allow new user signups ». (Voir aussi la fin de ce fichier.)
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

-- ────────────────────────────────────────────────────────────────────────────
-- 🔐 OBLIGATOIRE une fois vos comptes créés : fermer les inscriptions.
-- Dashboard → Authentication → Sign In / Providers → décocher
-- « Allow new user signups ». Sans ça, toute personne devinant l'URL du
-- projet peut créer un compte et lire/modifier/supprimer vos spots.
--
-- Option plus stricte (à la place ou en plus) : restreindre les policies à
-- une liste d'emails précise, par exemple :
--
--   drop policy "authenticated read" on public.spots;
--   create policy "authenticated read" on public.spots
--     for select to authenticated
--     using ((auth.jwt()->>'email') in ('toi@exemple.fr', 'cousin@exemple.fr'));
--
--   (répéter le même using/with check pour insert, update et delete)
--
-- Astuce confort : Authentication → Providers → Email → désactiver
-- « Confirm email » simplifie la première connexion (pas de mail à valider).
