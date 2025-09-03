export function Textarea({ className="", ...props }) {
  return <textarea className={`w-full min-h-[80px] px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl outline-none focus:border-indigo-500 ${className}`} {...props} />;
} 