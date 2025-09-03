import { motion } from "framer-motion";

export function Switch({ checked = false, onCheckedChange = () => {} }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 
        ${checked ? "bg-indigo-500/80" : "bg-slate-600/80"} shadow-inner`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 32 }}
        className="inline-block h-6 w-6 rounded-full bg-white shadow"
        style={{ x: checked ? 20 : 2 }}
      />
      {/* halo doux */}
      {checked && <span className="absolute inset-0 rounded-full ring-2 ring-indigo-300/30 pointer-events-none" />}
    </button>
  );
}