// Évaluation du niveau de danger d'un lieu abandonné. 100 % calculé localement
// (aucun appel réseau) à partir de la catégorie et des tags OpenStreetMap :
// c'est une aide à la préparation, pas une garantie — chaque site doit être
// évalué sur place.

// 1 = Faible, 2 = Modéré, 3 = Élevé, 4 = Extrême.
const LEVELS = {
  1: { label: 'Faible', color: '#10b981' },
  2: { label: 'Modéré', color: '#f59e0b' },
  3: { label: 'Élevé', color: '#f97316' },
  4: { label: 'Extrême', color: '#ef4444' },
}

// Danger de base + risques typiques par catégorie.
const BASE = {
  tunnel: { level: 4, risks: ['Effondrement', 'Manque d’oxygène / gaz', 'Noyade (galeries inondées)', 'Obscurité totale, désorientation'] },
  militaire: { level: 3, risks: ['Munitions non explosées', 'Puits et galeries', 'Effondrement'] },
  usine: { level: 3, risks: ['Amiante', 'Produits chimiques', 'Sols et planchers instables'] },
  hopital: { level: 3, risks: ['Amiante', 'Déchets médicaux / seringues', 'Effondrement'] },
  parc: { level: 3, risks: ['Structures métalliques rouillées', 'Hauteur', 'Effondrement'] },
  chateau: { level: 3, risks: ['Planchers et escaliers pourris', 'Hauteur', 'Chutes de pierres'] },
  gare: { level: 2, risks: ['Voies parfois encore actives', 'Chute', 'Ferraille coupante'] },
  eglise: { level: 2, risks: ['Effondrement', 'Chutes de pierres', 'Hauteur'] },
  ecole: { level: 2, risks: ['Amiante (bâtiments anciens)', 'Planchers instables'] },
  hotel: { level: 2, risks: ['Planchers instables', 'Amiante'] },
  piscine: { level: 2, risks: ['Chute dans le bassin', 'Effondrement'] },
  maison: { level: 2, risks: ['Planchers et toitures instables', 'Effondrement'] },
  ferme: { level: 2, risks: ['Toitures et planchers instables', 'Effondrement'] },
  autre: { level: 2, risks: ['Effondrement', 'Terrain instable'] },
}

export function assessDanger(category, tags = {}) {
  const base = BASE[category] || BASE.autre
  let level = base.level
  const risks = [...base.risks]
  const add = (r) => {
    if (!risks.includes(r)) risks.push(r)
  }
  const hay = Object.entries(tags)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
    .toLowerCase()

  // Danger explicitement signalé sur OSM.
  if (tags.hazard || /hazard|hazmat|danger_area/.test(hay)) {
    level = Math.max(level, 3)
    add('Danger explicitement signalé sur place')
  }
  // Radiologique / nucléaire.
  if (/radioactive|nuclear|uranium|radiolog/.test(hay)) {
    level = 4
    add('Contamination radiologique possible')
  }
  // Zone militaire dangereuse.
  if (/military=danger_area|range=military|explosive/.test(hay)) {
    level = 4
    add('Zone de tir / explosifs possibles')
  }
  // Électrique (poste, ligne, centrale parfois encore alimentés).
  if (/power=|:power|substation|transformer|generator/.test(hay)) {
    level = Math.max(level, 3)
    add('Risque électrique (parfois encore alimenté)')
  }
  // Hauteur.
  if (/tower|chimney|crane|silo|mast|=roof|building:levels=(?:[4-9]|\d\d)/.test(hay)) {
    add('Hauteur / risque de chute')
  }
  // Eau : carrière, bassin, galerie inondée.
  if (/quarry|=water|reservoir|basin|flooded|lido|swimming/.test(hay)) {
    add('Noyade (bassins / zones inondées)')
  }
  // Chimique / industriel lourd.
  if (/refinery|chemical|tank|fuel|gasometer|coke|smelter/.test(hay)) {
    level = Math.max(level, 3)
    add('Résidus chimiques / cuves')
  }

  level = Math.min(4, Math.max(1, level))
  return { level, label: LEVELS[level].label, color: LEVELS[level].color, risks: risks.slice(0, 5) }
}
