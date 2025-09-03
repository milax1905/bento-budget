import { motion } from "framer-motion";

// ...
<motion.button
  type="button"
  onClick={addExpense}
  className="relative inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 font-medium text-white
             bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_10px_30px_-10px_rgba(99,102,241,.55)] overflow-hidden"
  whileHover={{
    y: -1,
    scale: 1.03,
    boxShadow: "0 16px 44px -16px rgba(99,102,241,.95), 0 0 0 12px rgba(99,102,241,.16)",
  }}
  whileTap={{ scale: 0.985 }}
  transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
>
  <span className="relative z-10">Ajouter</span>

  {/* halo radial au hover */}
  <span
    aria-hidden
    className="pointer-events-none absolute -inset-16 rounded-full opacity-0 transition-opacity duration-200 hover:opacity-100"
    style={{
      background:
        "radial-gradient(360px 160px at 50% 120%, rgba(34,211,238,.32), transparent 60%)",
    }}
  />

  {/* reflet doux */}
  <span
    aria-hidden
    className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 hover:opacity-20"
    style={{
      background:
        "linear-gradient(120deg, rgba(255,255,255,.38), rgba(255,255,255,0) 60%)",
    }}
  />
</motion.button>