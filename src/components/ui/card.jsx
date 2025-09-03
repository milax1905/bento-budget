import { motion } from "framer-motion";

/**
 * Card cocooning / futuriste
 * - fond glass (dégradé subtil)
 * - bord doux (ring white/10) + lueur radiale pour éviter les "coupures"
 * - entrée en fondu
 */
export function Card({ className = "", children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={
        "relative rounded-3xl overflow-hidden " +
        // fond glass + ring (supprime les ruptures nettes)
        "bg-gradient-to-br from-white/6 to-white/[.02] dark:from-white/7 dark:to-white/[.03] " +
        "backdrop-blur-md ring-1 ring-white/10 shadow-[0_24px_80px_-32px_rgba(0,0,0,.55)] " +
        className
      }
    >
      {/* Glow très léger sur les bords pour casser la "coupure" */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 400px at 50% -200px, rgba(99,102,241,.16), rgba(99,102,241,0) 60%)",
        }}
      />
      {/* voile interno pour l’aspect velours */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0))]" />
      {children}
    </motion.div>
  );
}

export function CardHeader({ className = "", children }) {
  return <div className={"p-4 sm:p-5 " + className}>{children}</div>;
}
export function CardTitle({ className = "", children }) {
  return <h3 className={"text-lg font-semibold tracking-tight " + className}>{children}</h3>;
}
export function CardDescription({ className = "", children }) {
  return <p className={"text-sm text-slate-400 " + className}>{children}</p>;
}
export function CardContent({ className = "", children }) {
  return <div className={"p-4 sm:p-5 pt-0 " + className}>{children}</div>;
}
export function CardFooter({ className = "", children }) {
  return <div className={"p-4 sm:p-5 pt-0 " + className}>{children}</div>;
}