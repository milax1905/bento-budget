export function Input({ className="", ...rest }) {
  return (
    <input
      className={
        "w-full px-3 py-2 rounded-2xl bg-slate-900/60 border border-slate-700/80 " +
        "text-slate-100 placeholder:text-slate-400/70 outline-none transition-all " +
        "focus:border-indigo-400 focus:shadow-[0_0_0_5px_rgba(99,102,241,.12)] " +
        "hover:border-slate-600 " + className
      }
      {...rest}
    />
  );
}