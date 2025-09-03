export function Card({ className="", children }) { return <div className={`rounded-2xl ${className}`}>{children}</div>; }
export function CardHeader({ className="", children }) { return <div className={`p-3 ${className}`}>{children}</div>; }
export function CardTitle({ className="", children }) { return <h3 className={`text-lg font-semibold ${className}`}>{children}</h3>; }
export function CardContent({ className="", children }) { return <div className={`p-3 pt-0 ${className}`}>{children}</div>; }
export function CardDescription({ className="", children }) { return <p className={`text-sm text-slate-400 ${className}`}>{children}</p>; }