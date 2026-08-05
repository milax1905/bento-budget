import { Home, Map, List, Radar, Plus } from 'lucide-react'

// Barre de navigation « pilule de verre » flottante (style visionOS/futuriste).
// IMPORTANT : positionnée en `absolute` DANS le cadre de l'app (h-dvh,
// overflow-hidden) et non en `fixed` — sur iOS Safari, `fixed` s'ancre au
// viewport de mise en page qui ne coïncide pas toujours avec l'écran (bug de
// barre « flottante »). La marge basse absorbe la zone sûre iPhone.
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
      className="flex h-full flex-1 flex-col items-center justify-center gap-0.5"
    >
      <span
        className={`flex h-8 w-14 items-center justify-center rounded-full transition ${
          active ? 'bg-indigo-400/20 text-indigo-200' : 'text-zinc-500'
        }`}
      >
        <Icon size={19} strokeWidth={active ? 2.3 : 2} />
      </span>
      <span
        className={`text-[9.5px] tracking-wide ${active ? 'font-semibold text-indigo-200' : 'font-medium text-zinc-500'}`}
      >
        {label}
      </span>
    </button>
  )
}

export default function BottomNav({ active, onNavigate, onAdd }) {
  return (
    <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-[2000] flex justify-center">
      <div
        className="pointer-events-auto glass mx-4 flex h-[4.25rem] w-full max-w-[440px] items-stretch gap-0.5 rounded-[2rem] px-2 shadow-2xl shadow-black/50"
        style={{ marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.65rem)' }}
      >
        <Tab {...TABS[0]} active={active === 'home'} onClick={() => onNavigate('home')} />
        <Tab {...TABS[1]} active={active === 'map'} onClick={() => onNavigate('map')} />

        {/* Action centrale : ajouter un spot */}
        <div className="flex w-14 shrink-0 items-center justify-center">
          <button
            onClick={onAdd}
            aria-label="Ajouter un spot"
            className="glow-soft flex h-12 w-12 -translate-y-4 items-center justify-center rounded-full bg-gradient-to-b from-indigo-400 to-indigo-600 text-white ring-1 ring-white/25 transition hover:brightness-110 active:scale-90"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>

        <Tab {...TABS[2]} active={active === 'places'} onClick={() => onNavigate('places')} />
        <Tab {...TABS[3]} active={active === 'discover'} onClick={() => onNavigate('discover')} />
      </div>
    </nav>
  )
}
