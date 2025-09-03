import { motion } from "framer-motion";

const styles = {
  glow:
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-2 font-medium " +
    "text-white bg-gradient-to-br from-indigo-500 to-violet-500 " +
    "shadow-[0_10px_30px_-10px_rgba(99,102,241,.55)] overflow-hidden",
  secondary:
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-2 font-medium " +
    "text-slate-100 bg-slate-800/70 hover:bg-slate-700/70 ring-1 ring-white/10",
  ghost:
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-2 font-medium " +
    "text-slate-200 hover:bg-white/5",
};

export function Button({ children, className = "", variant = "glow", ...props }) {
  const cls = `${styles[variant] || styles.glow} ${className}`;

  return (
    <motion.button
      whileHover={{
        y: -1,
        scale: 1.03,
        boxShadow:
          "0 16px 44px -16px rgba(99,102,241,.95), 0 0 0 12px rgba(99,102,241,.16)",
      }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
      className={cls}
      {...props}
    >
      {/* texte au-dessus */}
      <span className="relative z-10">{children}</span>

      {/* halo radial (pas besoin de group) */}
      {variant === "glow" && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-16 rounded-full opacity-0 transition-opacity duration-200 hover:opacity-100"
          style={{
            background:
              "radial-gradient(360px 160px at 50% 120%, rgba(34,211,238,.32), transparent 60%)",
          }}
        />
      )}

      {/* reflet doux */}
      {variant === "glow" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-200 hover:opacity-20"
          style={{
            background:
              "linear-gradient(120deg, rgba(255,255,255,.38), rgba(255,255,255,0) 60%)",
          }}
        />
      )}
    </motion.button>
  );
}