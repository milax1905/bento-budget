import { Home, Map, List, Radar, Plus } from 'lucide-react'

// Barre de navigation basse. IMPORTANT : positionnée en `absolute` DANS le
// cadre de l'app (h-dvh, overflow-hidden) et non en `fixed` — sur iOS Safari,
// `fixed` s'ancre au viewport de mise en page qui ne coïncide pas toujours avec
// l'écran (la barre « flottait » au-dessus du bas). Sur mobile elle est collée
// en bas, la zone sûre (barre iPhone) étant absorbée en padding INTERNE.
const TABS = [
  { id: 'home', label: 'Accueil', Icon: Home },
  { id: 'map', label: 'Carte', Icon: Map },
  { id: 'places', label: 'Lieux', Icon: List },
  { id: 'discover', label: 'Découvrir', Icon: Radar },
]

function Tab({ id, label, Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex h-full flex-1 flex-col items-center justify-center gap-1 transition ${
        active ? 'text-amber-300' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <Icon size={21} strokeWidth={active ? 2.4 : 2} />
      <span className={`text-[10px] tracking-tight ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
      {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-amber-400" />}
    </button>
  )
}

export default function BottomNav({ active, onNavigate, onAdd }) {
  return (
    <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-[2000] flex justify-center">
      <div className="pointer-events-auto glass pb-safe w-full border-x-0 border-b-0 border-t sm:mb-3 sm:w-[440px] sm:rounded-2xl sm:border sm:pb-0">
        <div className="flex h-16 items-stretch gap-1 px-2">
          <Tab {...TABS[0]} active={active === 'home'} onClick={() => onNavigate('home')} />
          <Tab {...TABS[1]} active={active === 'map'} onClick={() => onNavigate('map')} />

          {/* Action centrale : ajouter un spot */}
          <div className="flex w-16 shrink-0 items-center justify-center">
            <button
              onClick={onAdd}
              aria-label="Ajouter un spot"
              className="flex h-12 w-12 -translate-y-3 items-center justify-center rounded-2xl bg-amber-400 text-zinc-950 shadow-xl shadow-black/40 transition hover:bg-amber-300 active:scale-90"
            >
              <Plus size={24} strokeWidth={2.6} />
            </button>
          </div>

          <Tab {...TABS[2]} active={active === 'places'} onClick={() => onNavigate('places')} />
          <Tab {...TABS[3]} active={active === 'discover'} onClick={() => onNavigate('discover')} />
        </div>
      </div>
    </nav>
  )
}
