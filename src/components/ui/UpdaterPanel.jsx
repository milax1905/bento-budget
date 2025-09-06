// components/ui/UpdaterPanel.jsx
import React from "react";

const safeBento =
  typeof window !== "undefined" && window.bento
    ? window.bento
    : {
        app: {
          getInfo: async () => ({
            version: "dev",
            platform: "",
            arch: "",
            isPackaged: false,
          }),
        },
        onUpdateEvent: () => () => {}, // retourne un unsubscribe no-op
        update: {
          getState: async () => ({
            status: "idle",
            progress: null,
            availableVersion: null,
            error: "",
          }),
          check: async () => ({ ok: true }),
          download: async () => ({ ok: true }),
          install: async () => ({ ok: true }),
        },
      };

export default function UpdaterPanel({ variant = "panel", onBack, onUpdateAvailable }) {
  const [info, setInfo] = React.useState({
    version: "?",
    platform: "",
    arch: "",
    isPackaged: false,
  });

  // --- États éphémères (plus de persistance localStorage) ---
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("idle"); // idle | checking | available | none | downloading | downloaded | error
  const [progress, setProgress] = React.useState(null); // { percent, transferred, total, bytesPerSecond }
  const [availableVersion, setAvailableVersion] = React.useState(null);
  const [logLines, setLogLines] = React.useState([]);

  React.useEffect(() => {
    // Infos app
    (async () => {
      try {
        const i = await safeBento.app.getInfo();
        setInfo(i);
      } catch (e) {
        setError(String(e));
      }
    })();

    // Ajout de lignes de log en sécurité
    const push = (t) => {
      setLogLines((lines) => {
        const safe = Array.isArray(lines) ? lines : [];
        return [...safe.slice(-199), `${new Date().toLocaleTimeString()}  ${t}`];
      });
    };

    // --- Ré-hydratation depuis le process principal ---
    (async () => {
      try {
        const s = await safeBento.update.getState(); // retourne le snapshot courant
        if (s && typeof s === "object") {
          setStatus(s.status || "idle");
          setProgress(s.progress ?? null);
          setAvailableVersion(s.availableVersion ?? null);
          if (s.status && s.status !== "idle") {
            const p =
              typeof s.progress?.percent === "number"
                ? ` (${Math.max(0, Math.min(100, s.progress.percent)).toFixed(1)}%)`
                : "";
            push(`Reprise : statut=${s.status}${p}`);
          }
        }
      } catch (e) {
        // non bloquant
      }
    })();

    // --- Écoute des événements "live" envoyés par le main ---
    const off = safeBento.onUpdateEvent((ev) => {
      if (!ev?.type) return;

      switch (ev.type) {
        case "checking":
          setStatus("checking");
          setError("");
          push("Vérification des mises à jour…");
          break;

        case "available":
          setStatus("available");
          setAvailableVersion(ev.info?.version || null);
          setError("");
          push(`Nouvelle version ${ev.info?.version} trouvée. Téléchargement…`);
          onUpdateAvailable?.(ev.info);
          break;

        case "none":
          setStatus("none");
          setAvailableVersion(null);
          setError("");
          push("Aucune mise à jour disponible.");
          break;

        case "progress":
          setStatus("downloading");
          setProgress(ev.progress || null);
          push(`Téléchargement: ${ev.progress?.percent?.toFixed?.(1) ?? "?"}%`);
          break;

        case "downloaded":
          setStatus("downloaded");
          setError("");
          push("Téléchargement terminé. Prêt à installer.");
          onUpdateAvailable?.(ev.info);
          break;

        case "error":
          setStatus("error");
          setError(ev.error || "Erreur inconnue");
          push(`Erreur: ${ev.error || "inconnue"}`);
          break;
      }
    });

    return () => {
      try { off?.(); } catch {}
    };
  }, [onUpdateAvailable]);

  // Affiche bien 0% (ne pas cacher la barre quand percent === 0)
  const pct =
    typeof progress?.percent === "number"
      ? Math.max(0, Math.min(100, progress.percent))
      : null;

  const isPage = variant === "page";

  const wrapStyle = isPage
    ? {
        minHeight: "100vh",
        width: "100%",
        padding: 24,
        background: "#0b1220",
        color: "#e5e7eb",
      }
    : {
        position: "relative",
        padding: 12,
        borderRadius: 10,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        maxWidth: 420,
      };

  return (
    <div style={wrapStyle}>
      {isPage && (
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>Mises à jour</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              Gestion des mises à jour de l’application
            </div>
          </div>
          <a
            onClick={() => (onBack ? onBack() : (window.location.hash = "#/"))}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(148,163,184,.18)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Retour
          </a>
        </header>
      )}

      <Section isPage={isPage} title="Infos">
        <Row label="Version" value={`v${info.version}`} />
        <Row label="Plateforme" value={`${info.platform} ${info.arch}`} />
        <Row
          label="Mode"
          value={info.isPackaged ? "Production (installée)" : "Dev/Unpacked"}
        />
      </Section>

      <Section isPage={isPage} title="Statut">
        <div style={{ fontSize: isPage ? 14 : 12, marginBottom: 8 }}>
          {renderStatus(status, availableVersion, pct, error)}
        </div>
        {pct !== null && (
          <div
            style={{
              height: 8,
              width: "100%",
              borderRadius: 6,
              background: "rgba(148,163,184,.2)",
              overflow: "hidden",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: "#6366f1",
                transition: "width .2s",
              }}
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => safeBento.update.check()} style={btn()}>
            Vérifier
          </button>
          {status === "downloaded" && (
            <button onClick={() => safeBento.update.install()} style={btnPrimary()}>
              Installer et redémarrer
            </button>
          )}
        </div>
      </Section>

      <Section isPage={isPage} title="Journal">
        <div
          style={{
            height: isPage ? 220 : 160,
            overflow: "auto",
            borderRadius: 10,
            background: "rgba(2,6,23,.6)",
            padding: 8,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            fontSize: 12,
          }}
        >
          {logLines.length === 0 ? (
            <div style={{ opacity: 0.6 }}>—</div>
          ) : (
            logLines.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </Section>

      {!isPage && (
        <div style={{ position: "absolute", right: 8, bottom: 6, fontSize: 11, opacity: 0.6 }}>
          v{info.version} • {info.platform} {info.arch}
        </div>
      )}
    </div>
  );
}

function Section({ title, children, isPage }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: isPage ? 16 : 12,
        borderRadius: 16,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: isPage ? 16 : 14, fontWeight: 600, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 14 }}>
      <strong style={{ opacity: 0.8 }}>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function renderStatus(status, availableVersion, pct, error) {
  switch (status) {
    case "idle":
      return "—";
    case "checking":
      return "Vérification en cours…";
    case "available":
      return (
        <>
          Mise à jour disponible : <strong>v{availableVersion}</strong>. Téléchargement…
        </>
      );
    case "downloading":
      return <>Téléchargement… {pct !== null ? pct.toFixed(1) + "%" : ""}</>;
    case "downloaded":
      return "Mise à jour téléchargée. Prête à installer.";
    case "none":
      return "Aucune mise à jour disponible.";
    case "error":
      return `Erreur : ${error}`;
    default:
      return status;
  }
}

const btn = () => ({
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  cursor: "pointer",
  fontSize: 14,
});
const btnPrimary = () => ({
  padding: "8px 12px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(90deg,#7c4dff,#6a8dff)",
  color: "white",
  cursor: "pointer",
  fontSize: 14,
});