import { motion } from "framer-motion";

/**
 * Bouton futuriste avec glow + halo animé
 * Variants : "glow" (par défaut), "secondary", "ghost"
 */
const styles = {
  glow:
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-2 font-medium " +
    "text-white bg-gradient-to-br from-indigo-500 to-violet-500 " +
    "shadow-[0_10px_30px_-10px_rgba(99,102,241,.55)] overflow-hidden group",
  secondary:
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-2 " +
    "font-medium text-slate-100 bg-slate-800/70 hover:bg-slate-700/70 ring-1 ring-white/10",
  ghost:
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-2 " +
    "font-medium text-slate-200 hover:bg-white/5",
};

export function Button({ children, className = "", variant = "glow", ...props }) {
  const cls = `${styles[variant] || styles.glow} ${className}`;

  return (
    <motion.button
      whileHover={{
        y: -1,
        scale: 1.02,
        boxShadow:
          "0 12px 36px -14px rgba(99,102,241,.75), 0 0 0 8px rgba(99,102,241,.12)",
      }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
      className={cls}
      {...props}
    >
      {/* Texte au premier plan */}
      <span className="relative z-10">{children}</span>

      {/* Halo lumineux animé au survol */}
      {variant === "glow" && (
        <span
          aria-hidden
          className="absolute -inset-12 z-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background:
              "radial-gradient(300px 120px at 50% 120%, rgba(34,211,238,.25), transparent 60%)",
          }}
        />
      )}

      {/* Reflet doux */}
      {variant === "glow" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-20"
          style={{
            background:
              "linear-gradient(120deg, rgba(255,255,255,.35), rgba(255,255,255,0) 60%)",
          }}
        />
      )}
    </motion.button>
  );
}