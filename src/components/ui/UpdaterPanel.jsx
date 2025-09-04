// src/pages/UpdatesPage.jsx
import React from "react";

const safeBento = (typeof window !== "undefined" && window.bento) ? window.bento : {
  app: { getInfo: async () => ({ version: "dev", platform: "", arch: "", isPackaged: false }) },
  onUpdateEvent: () => {},
  update: { check: async () => {}, download: async () => {}, install: async () => {} },
};

export default function UpdatesPage() {
  const [info, setInfo] = React.useState({ version: "?", platform: "", arch: "", isPackaged: false });
  const [status, setStatus] = React.useState("idle");
  const [progress, setProgress] = React.useState(null);
  const [availableVersion, setAvailableVersion] = React.useState(null);
  const [error, setError] = React.useState("");
  const [logLines, setLogLines] = React.useState([]);

  React.useEffect(() => {
    (async () => {
      try {
        const i = await safeBento.app.getInfo();
        setInfo(i);
      } catch (e) { setError(String(e)); }
    })();

    const push = (t) => setLogLines((lines) => [...lines.slice(-199), `${new Date().toLocaleTimeString()}  ${t}`]);

    safeBento.onUpdateEvent((ev) => {
      if (!ev?.type) return;
      switch (ev.type) {
        case "checking":
          setStatus("checking"); setError(""); push("Vérification des mises à jour…"); break;
        case "available":
          setStatus("available"); setAvailableVersion(ev.info?.version || null); setError(""); push(`Nouvelle version ${ev.info?.version} trouvée. Téléchargement…`); break;
        case "none":
          setStatus("none"); setAvailableVersion(null); setError(""); push("Aucune mise à jour disponible."); break;
        case "progress":
          setStatus("downloading"); setProgress(ev.progress || null);
          push(`Téléchargement: ${ev.progress?.percent?.toFixed?.(1) ?? "?"}% (${Math.round(ev.progress?.bytesPerSecond/1024)||0} kB/s)`); 
          break;
        case "downloaded":
          setStatus("downloaded"); setError(""); push("Téléchargement terminé. Prêt à installer.");
          break;
        case "error":
          setStatus("error"); setError(ev.error || "Erreur inconnue"); push(`Erreur: ${ev.error || "inconnue"}`);
          break;
      }
    });
  }, []);

  const pct = progress?.percent ? Math.max(0, Math.min(100, progress.percent)) : null;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">Mises à jour</h1>
            <p className="text-slate-400 text-sm">Gestion des mises à jour de l’application</p>
          </div>
          <a href="#/" className="rounded-xl px-3 py-2 bg-slate-800/60 hover:bg-slate-700/60 transition text-sm">← Retour</a>
        </header>

        <section className="mt-6 grid gap-4">
          <div className="rounded-2xl bg-slate-900/60 p-4 ring-1 ring-white/10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <Info label="Version installée" value={`v${info.version}`} />
              <Info label="Plateforme" value={`${info.platform} ${info.arch}`} />
              <Info label="Mode" value={info.isPackaged ? "Production (installée)" : "Dev/Unpacked"} />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4 ring-1 ring-white/10 space-y-3">
            <h2 className="text-lg font-medium">Statut</h2>
            <StatusLine status={status} availableVersion={availableVersion} error={error} />
            <ProgressBar percent={pct} />

            <div className="flex flex-wrap gap-2">
              <button onClick={() => safeBento.update.check()} className="rounded-xl px-4 py-2 bg-indigo-600 hover:bg-indigo-500 transition">Vérifier</button>
              {status === "downloaded" && (
                <button onClick={() => safeBento.update.install()} className="rounded-xl px-4 py-2 bg-emerald-600 hover:bg-emerald-500 transition">
                  Installer et redémarrer
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4 ring-1 ring-white/10">
            <h3 className="text-md font-medium mb-2">Journal</h3>
            <div className="h-48 overflow-auto rounded-xl bg-slate-950/70 p-2 text-xs font-mono whitespace-pre-wrap">
              {logLines.length === 0 ? <div className="opacity-60">—</div> : logLines.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </section>

        <footer className="mt-8 text-xs text-slate-500">
          v{info.version} • {info.platform} {info.arch}
        </footer>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-800/50 p-3">
      <div className="text-slate-400 text-xs">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function StatusLine({ status, availableVersion, error }) {
  let text = "—";
  if (status === "checking") text = "Vérification en cours…";
  if (status === "available") text = `Mise à jour disponible : v${availableVersion}. Téléchargement…`;
  if (status === "downloading") text = "Téléchargement…";
  if (status === "downloaded") text = "Mise à jour téléchargée. Prête à installer.";
  if (status === "none") text = "Aucune mise à jour disponible.";
  if (status === "error") text = `Erreur : ${error}`;
  return <div className="text-sm">{text}</div>;
}

function ProgressBar({ percent }) {
  if (percent === null) return null;
  return (
    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
      <div className="h-full bg-indigo-500 transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}