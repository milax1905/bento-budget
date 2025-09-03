import { motion } from "framer-motion";

const variants = {
  default:
    "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,.55)]",
  secondary:
    "bg-slate-700/80 text-slate-100 hover:bg-slate-600/80 shadow-inner",
  outline:
    "border border-slate-600/80 text-slate-100 hover:bg-slate-800/40",
  ghost:
    "bg-transparent text-slate-200 hover:bg-slate-800/40",
  destructive:
    "bg-rose-600 text-white hover:bg-rose-500",
};

export function Button({ children, className = "", variant = "default", ...props }) {
  const base =
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium " +
    "outline-none ring-0 transition-colors backdrop-blur";

  return (
    <motion.button
      whileHover={{ y: -1, scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
      className={`${base} ${variants[variant] || variants.default} ${className}`}
      {...props}
    >
      {/* léger sheen */}
      <span className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity hover:opacity-20"
            style={{ background: "linear-gradient(120deg, rgba(255,255,255,.35), rgba(255,255,255,0) 60%)" }}/>
      {children}
      {/* focus ring doux */}
      <span className="absolute inset-0 -z-10 rounded-3xl ring-0 focus-within:ring-2 ring-indigo-400/40" />
    </motion.button>
  );
}