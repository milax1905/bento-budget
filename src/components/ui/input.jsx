export function Input(props) {
  const { className="", ...rest } = props;
  return <input className={`w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-xl outline-none focus:border-indigo-500 ${className}`} {...rest} />;
}