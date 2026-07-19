import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Lightbox({ src, onClose }) {
  // Échap ferme la lightbox en priorité (capture), sans fermer le panneau
  // qui se trouve derrière.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <img src={src} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
      <button className="absolute right-4 top-4 rounded-full bg-zinc-800/80 p-2 text-zinc-200">
        <X size={20} />
      </button>
    </div>
  )
}
