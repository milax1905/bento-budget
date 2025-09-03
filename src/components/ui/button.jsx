export function Button({ children, className = "", variant = "default", ...props }) {
  const styles =
    variant === "ghost"
      ? "bg-transparent hover:bg-slate-800/40"
      : variant === "secondary"
      ? "bg-slate-700 hover:bg-slate-600"
      : variant === "outline"
      ? "border border-slate-600 hover:bg-slate-800/40"
      : variant === "destructive"
      ? "bg-rose-600 hover:bg-rose-500"
      : "bg-indigo-600 hover:bg-indigo-500";
  return (
    <button
      className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}