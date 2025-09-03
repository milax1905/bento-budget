import { motion } from "framer-motion";

export function Card({ className = "", children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={
        "rounded-3xl bg-slate-900/55 backdrop-blur-md " +
        "ring-1 ring-white/10 shadow-[0_24px_80px_-32px_rgba(0,0,0,.55)] " +
        "overflow-hidden " + // pas d'absolute overlay => pas de bande
        className
      }
    >
      {children}
    </motion.div>
  );
}

export const CardHeader      = ({ className="", children }) => <div className={"p-4 sm:p-5 " + className}>{children}</div>;
export const CardTitle       = ({ className="", children }) => <h3 className={"text-lg font-semibold tracking-tight " + className}>{children}</h3>;
export const CardDescription = ({ className="", children }) => <p className={"text-sm text-slate-400 " + className}>{children}</p>;
export const CardContent     = ({ className="", children }) => <div className={"p-4 sm:p-5 pt-0 " + className}>{children}</div>;
export const CardFooter      = ({ className="", children }) => <div className={"p-4 sm:p-5 pt-0 " + className}>{children}</div>;