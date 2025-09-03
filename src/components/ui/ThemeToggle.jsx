import React, { useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ value, onChange }) {
  useEffect(() => {
    const root = document.documentElement;
    value ? root.classList.add("dark") : root.classList.remove("dark");
  }, [value]);
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-label={value ? "Passer en mode clair" : "Passer en mode sombre"}
      className="group flex items-center rounded-2xl px-2 py-1 bg-slate-800/60 ring-1 ring-white/20 shadow-inner transition-all"
    >
      <Sun className={`h-4 w-4 mr-1 ${value ? "text-slate-400 opacity-40" : "text-amber-300"}`} />
      <span className={`relative h-6 w-12 rounded-full border border-white/20 ${value ? "bg-indigo-500/80" : "bg-slate-700/70"}`}>
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${value ? "translate-x-[22px]" : "translate-x-0"}`} />
      </span>
      <Moon className={`h-4 w-4 ml-1 ${value ? "text-indigo-100" : "text-slate-400 opacity-40"}`} />
    </button>
  );
}