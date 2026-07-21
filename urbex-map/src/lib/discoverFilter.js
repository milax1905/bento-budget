// Filet de sécurité (indépendant de l'IA) pour écarter les lieux « encore
// debout » : châteaux habités/restaurés, monuments entretenus, sites visitables…
// La géo-recherche Wikipédia remonte TOUT monument notable à proximité,
// abandonné ou non. On lit l'extrait pour décider — sans jamais masquer un vrai
// spot en ruine. Les lieux écartés restent récupérables via « Voir les écartés ».
//
// Module SANS dépendance (imports) pour rester testable en Node pur.
//
// Modèle de décision (dans cet ordre) :
//   1) un signe d'ABANDON ACTUEL (ruine, ruiné, désaffecté, friche, inhabité,
//      fermé…) est DÉCISIF → on GARDE toujours le lieu (c'est un vrai spot).
//   2) un USAGE ACTUEL FORT (habité, restauré, musée, mairie, hôtel, se visite,
//      propriété privée…) → on ÉCARTE (ce n'est pas de l'urbex).
//   3) un indice FAIBLE « encore debout » (se dresse, centre de la seigneurie —
//      typique des châteaux notables) → on écarte SEULEMENT s'il n'y a aucune
//      trace de destruction (une destruction HISTORIQUE seule laisse le doute →
//      on garde).
// Les mots de destruction HISTORIQUE (vestiges, détruit, incendié…) ne « sauvent »
// jamais un lieu par ailleurs clairement réhabilité (règle 2 l'emporte), mais ils
// empêchent l'écartement sur un simple indice faible (règle 3).

// Apostrophe typographique → ASCII : fr.wikipedia utilise souvent U+2019, sinon
// les littéraux à apostrophe (aujourd'hui, d'hôtes…) ne correspondraient pas.
function normalize(s) {
  return (s || '').replace(/[’‘＇]/g, "'")
}

// 1) Abandon ACTUEL — décisif (on garde). Couvre nom + participe + formes
//    courantes. Pas de \b après un accent (le \b JS est ASCII et échoue après « é »).
const CURRENT_ABANDON =
  /\bruin[ée]e?s?|en ruines?|\babandon|d[ée]saffect|en friche|\bfriche\b|ne subsiste|d[ée]labr|inhabit|inoccup|d[ée]sert|sans usage|ferm[ée]/i

// Destruction HISTORIQUE (guerre, révolution, incendie…) — NON décisive.
const HISTORICAL_ABANDON = /vestiges?|d[ée]truit|incendi[ée]|effondr/i

// 2) Usage ACTUEL fort — on écarte. `\bhabit[ée]` matche habité/habitée sans
//    matcher « inhabité(e) » (capté avant par CURRENT_ABANDON) ni « habitude ».
//    Inclut aussi des édifices quasi toujours en service (basilique, cathédrale,
//    collégiale, préfecture, mairie/hôtel de ville…) — les rares en ruine gardent
//    un mot d'abandon qui l'emporte via CURRENT_ABANDON.
const STRONG_ACTIVE =
  /\bhabit[ée]|restaur[ée]|r[ée]nov[ée]|se visite|ouverte? (?:à la visite|au public)|\bmus[ée]e\b|\bmairie\b|h[ôo]tel de ville|pr[ée]fecture|\bh[ôo]tel\b|chambres? d'h[ôo]tes|propri[ée]t[ée] priv[ée]e|en activit[ée]|en service|\babrite\b|basilique|cath[ée]drale|coll[ée]giale|\bs[ée]minaire\b/i

// 3) Indices FAIBLES qu'un monument documenté est encore debout.
const WEAK_ACTIVE = /se dresse|centre de la seigneurie/i

export function extractLooksActive(extract) {
  const s = normalize(extract)
  if (!s) return false
  if (CURRENT_ABANDON.test(s)) return false // abandon actuel → vrai spot, on garde
  if (STRONG_ACTIVE.test(s)) return true // clairement en usage → on écarte
  if (WEAK_ACTIVE.test(s) && !HISTORICAL_ABANDON.test(s)) return true
  return false
}
