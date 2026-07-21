// Filet de sécurité (indépendant de l'IA) pour écarter les lieux « encore
// debout » : châteaux habités/restaurés, monuments classés entretenus, sites
// visitables… La géo-recherche Wikipédia remonte TOUT monument notable à
// proximité, abandonné ou non. On lit l'extrait : s'il décrit clairement un
// lieu ACTIF/entretenu SANS aucun signe d'abandon, on l'écarte (récupérable via
// « Voir les lieux écartés »). Un vrai spot en ruine garde toujours un mot
// d'abandon (ruine, vestiges, désaffecté…) qui l'emporte.
//
// Module SANS dépendance (imports) pour rester testable en Node pur.
const EXTRACT_ACTIVE =
  /monument historique|class[ée]|inscrit|se dresse|se visite|ouverte? (?:à la visite|au public)|\bmus[ée]e\b|propri[ée]t[ée] priv[ée]e|est habit|habit[ée]e?\b|restaur[ée]|r[ée]nov[ée]|centre de la seigneurie|maison forte|chambres? d'h[ôo]tes|\bh[ôo]tel\b|\bmairie\b|en activit[ée]|en service|aujourd'hui|actuel/i
const EXTRACT_ABANDON =
  /en ruines?|\bruines?\b|abandonn|d[ée]saffect|à l'abandon|vestiges?|d[ée]truit|incendi[ée]|effondr|en friche|\bfriche\b|ne subsiste|d[ée]labr/i

export function extractLooksActive(extract) {
  const s = extract || ''
  if (!s) return false
  return EXTRACT_ACTIVE.test(s) && !EXTRACT_ABANDON.test(s)
}
