import { motion } from "framer-motion";

export function Card({ className="", children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: .22, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className={`rounded-3xl bg-slate-900/60 ring-1 ring-white/10 shadow-[0_20px_60px_-25px_rgba(0,0,0,.55)] backdrop-blur ${className}`}
      style={{ backgroundImage: "linear-gradient(140deg, rgba(255,255,255,.05), rgba(255,255,255,.02))" }}
    >
      {children}
    </motion.div>
  );
}
export function CardHeader({ className="", children }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
export function CardTitle({ className="", children }) {
  return <h3 className={`text-lg font-semibold tracking-tight ${className}`}>{children}</h3>;
}
export function CardContent({ className="", children }) {
  return <div className={`p-4 pt-0 ${className}`}>{children}</div>;
}
export function CardDescription({ className="", children }) {
  return <p className={`text-sm text-slate-400 ${className}`}>{children}</p>;
}