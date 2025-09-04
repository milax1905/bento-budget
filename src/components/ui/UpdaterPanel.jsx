import React from "react";

const safeBento = (typeof window !== "undefined" && window.bento) ? window.bento : {
  app: { getInfo: async () => ({ version: "dev", platform: "", arch: "", isPackaged: false }) },
  onUpdateEvent: () => {},
  update: { check: async () => {}, download: async () => {}, install: async () => {} },
};

export default function UpdaterPanel() {
  const [info, setInfo] = React.useState({ version: "?", platform: "", arch: "", isPackaged: false });
  const [status, setStatus] = React.useState("idle");
  const [progress, setProgress] = React.useState(null);
  const [availableVersion, setAvailableVersion] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const i = await safeBento.app.getInfo();
        setInfo(i);
      } catch (e) {
        setError(String(e));
      }
    })();

    safeBento.onUpdateEvent((ev) => {
      if (!ev || !ev.type) return;
      switch (ev.type) {
        case "checking":
          setStatus("checking");
          setError("");
          break;
        case "available":
          setStatus("available");
          setAvailableVersion(ev.info?.version || null);
          setError("");
          break;
        case "none":
          setStatus("none");
          setAvailableVersion(null);
          setError("");
          break;
        case "progress":
          setStatus("downloading");
          setProgress(ev.progress || null);
          setError("");
          break;
        case "downloaded":
          setStatus("downloaded");
          setError("");
          break;
        case "error":
          setStatus("error");
          setError(ev.error || "Erreur inconnue");
          break;
      }
    });
  }, []);

  const pct = progress?.percent ? Math.max(0, Math.min(100, progress.percent)) : null;

  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <strong>Version</strong>
        <span>v{info.version}</span>
      </div>
      <div style={styles.row}>
        <strong>Plateforme</strong>
        <span>{info.platform} {info.arch}</span>
      </div>
      <div style={styles.row}>
        <strong>Mode</strong>
        <span>{info.isPackaged ? "Production (installée)" : "Dev/Unpacked"}</span>
      </div>

      <div style={{marginTop: 12, fontSize: 12, opacity: 0.8}}>
        Statut MAJ&nbsp;: {renderStatus(status, availableVersion, pct, error)}
      </div>

      <div style={{display: "flex", gap: 8, marginTop: 12}}>
        <button onClick={() => safeBento.update.check()} style={styles.btn}>Vérifier</button>
        {status === "downloaded" && (
          <button onClick={() => safeBento.update.install()} style={styles.btnPrimary}>Installer et redémarrer</button>
        )}
      </div>

      {/* badge discret en bas à droite de l’app */}
      <div style={styles.badge}>v{info.version} • {info.platform} {info.arch}</div>
    </div>
  );
}

function renderStatus(status, availableVersion, pct, error) {
  switch (status) {
    case "idle": return "—";
    case "checking": return "Vérification en cours…";
    case "available": return <>Mise à jour disponible : <strong>{availableVersion}</strong>. Téléchargement en cours…</>;
    case "downloading": return <>Téléchargement… {pct !== null ? pct.toFixed(1) + "%" : ""}</>;
    case "downloaded": return <>Mise à jour téléchargée. Prête à installer.</>;
    case "none": return "Aucune mise à jour disponible.";
    case "error": return <span style={{color: "#ff6b6b"}}>Erreur : {error}</span>;
    default: return status;
  }
}

const styles = {
  card: {
    position: "relative",
    padding: 12,
    borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    maxWidth: 420
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 14,
    marginTop: 4
  },
  btn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    cursor: "pointer"
  },
  btnPrimary: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(90deg, #7c4dff, #6a8dff)",
    color: "white",
    cursor: "pointer"
  },
  badge: {
    position: "absolute",
    right: 8,
    bottom: 6,
    fontSize: 11,
    opacity: 0.6
  }
};