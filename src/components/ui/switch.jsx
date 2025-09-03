import React from "react";
export function Switch({ checked = false, onCheckedChange = () => {} }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${checked ? "bg-indigo-500" : "bg-slate-600"} shadow-inner`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 shadow ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}