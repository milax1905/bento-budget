// Clé d'analyse IA « apporte ta clé » (BYOK) : saisie dans les Réglages, stockée
// UNIQUEMENT sur l'appareil (jamais dans le dépôt ni le bundle public), et
// envoyée au serveur à chaque enrichissement pour activer l'IA sans avoir à
// configurer de variable d'environnement sur Vercel.
//
// Module sans dépendance (testable en Node pur).
export const AI_KEY_LS = 'urbex-atlas:aiKey'

// Reconnaît le fournisseur d'après le préfixe de la clé (et sert de validation).
export function aiKeyProvider(key) {
  const k = (key || '').trim()
  if (/^sk-ant-/.test(k)) return 'Claude'
  if (/^gsk_/.test(k)) return 'Groq'
  return null
}

export function getAiKey() {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(AI_KEY_LS)) || ''
  } catch {
    return ''
  }
}

export function setAiKey(key) {
  const k = (key || '').trim()
  try {
    if (k) localStorage.setItem(AI_KEY_LS, k)
    else localStorage.removeItem(AI_KEY_LS)
  } catch {
    /* stockage indisponible : on ignore */
  }
}
