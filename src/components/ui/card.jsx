// src/components/ui/card.jsx
import { motion } from "framer-motion";

export function Card({ className = "", children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={
        "relative overflow-hidden rounded-3xl " +
        // fond “glass” discret (plus durs à couper visuellement)
        "bg-gradient-to-br from-white/7 to-white/[.03] backdrop-blur-md " +
        // ring très discret + ombre velours
        "ring-1 ring-white/10 shadow-[0_24px_80px_-32px_rgba(0,0,0,.55)] " +
        className
      }
    >
      {/* glow haut/bas pour fondre la jonction entre sections */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white/[.06] to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white/[.05] to-transparent" />
      {children}
    </motion.div>
  );
}

export const CardHeader   = ({ className="", children }) => <div className={"p-4 sm:p-5 " + className}>{children}</div>;
export const CardTitle    = ({ className="", children }) => <h3 className={"text-lg font-semibold tracking-tight " + className}>{children}</h3>;
export const CardContent  = ({ className="", children }) => <div className={"p-4 sm:p-5 pt-0 " + className}>{children}</div>;
export const CardFooter   = ({ className="", children }) => <div className={"p-4 sm:p-5 pt-0 " + className}>{children}</div>;
export const CardDescription = ({ className="", children }) => <p className={"text-sm text-slate-400 " + className}>{children}</p>;