import { Home, Map, List, Radar, Plus } from 'lucide-react'

// Barre de navigation basse — le cœur de la « vraie app ». 4 onglets + une
// action centrale « + » mise en avant (néon). Toujours visible, au-dessus de
// tout, respectant la zone sûre (encoche / barre iPhone).
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
      className={`group relative flex h-full flex-1 flex-col items-center justify-center gap-1 transition ${
        active ? 'text-violet-200' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <Icon size={21} strokeWidth={active ? 2.4 : 2} className={active ? 'drop-shadow-[0_0_8px_rgba(168,92,247,0.8)]' : ''} />
      <span className={`text-[10px] font-semibold tracking-tight ${active ? '' : 'font-medium'}`}>{label}</span>
      {active && <span className="absolute -top-px h-0.5 w-8 rounded-full bg-violet-400 shadow-[0_0_10px_2px_rgba(168,92,247,0.8)]" />}
    </button>
  )
}

export default function BottomNav({ active, onNavigate, onAdd }) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-[2000] flex justify-center">
      <div className="pointer-events-auto glass mb-safe relative flex h-16 w-full items-stretch gap-1 border-x-0 border-b-0 border-t px-2 sm:mb-3 sm:w-[440px] sm:rounded-2xl sm:border">
        <Tab {...TABS[0]} active={active === 'home'} onClick={() => onNavigate('home')} />
        <Tab {...TABS[1]} active={active === 'map'} onClick={() => onNavigate('map')} />

        {/* Action centrale « + » (ajouter un spot) */}
        <div className="flex w-16 shrink-0 items-center justify-center">
          <button
            onClick={onAdd}
            aria-label="Ajouter un spot"
            className="flex h-13 w-13 -translate-y-3 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-[0_8px_24px_-4px_rgba(168,92,247,0.7)] ring-1 ring-white/20 transition active:scale-90"
            style={{ height: '3.25rem', width: '3.25rem' }}
          >
            <Plus size={24} strokeWidth={2.6} />
          </button>
        </div>

        <Tab {...TABS[2]} active={active === 'places'} onClick={() => onNavigate('places')} />
        <Tab {...TABS[3]} active={active === 'discover'} onClick={() => onNavigate('discover')} />
      </div>
    </nav>
  )
}
