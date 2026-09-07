#!/usr/bin/env python3
"""Cure le catalogue plats.json de Cubeland Métiers.

Entrée  : le plats.json livré dans le jar 1.4.2 (291 entrées, généré automatiquement).
Sortie  : un plats.json curé, même format, utilisable tel quel dans
          config/cubeland-metiers/plats.json d'un serveur 1.4.2.

Règles :
  - on retire ce qui n'est pas un plat (sacs, bottes, bocaux, buissons, graines,
    feuilles, pâte crue, riz cru, blocs-festins dont l'assiette existe déjà,
    variantes de couleur des gâteaux à bougie) ;
  - on garde une seule entrée par nom quand deux mods proposent le même plat ;
  - on range chaque plat dans sa famille d'après son nom ;
  - on attribue le poste, puis le palier = max(plancher du poste, complexité) ;
  - la valeur de base suit le palier, avec un petit écart par famille.
"""
import json
import re
import sys
from collections import Counter, OrderedDict

SRC = sys.argv[1]
DST = sys.argv[2]

PRIORITE_MODS = [
    "farmersdelight", "farmersrespite", "delightful", "collectorsreap", "moredelight",
    "alexsdelight", "aquaculturedelight", "aquaculture", "mynethersdelight",
    "sweetberryfoods", "berries_and_cherries", "cratedelight",
]

# --- ce qui n'est pas un plat ------------------------------------------------
DROP_ID = re.compile(
    r"(_bag$|_sack$|_bale$|_crate$|jam_jar|_bush|_stem|small_tea_bush|_leaves$|_leaf$|"
    r"coffee_berries|pie_crust|raw_pasta|^farmersdelight:rice$|wild_rice$|ironbowl|"
    r"raw_stuffed|_block$)"
)
# variantes de couleur : on garde la version « with Candle » simple
DROP_COULEUR = re.compile(
    r"^(black|blue|brown|cyan|gray|green|light_blue|light_gray|lime|magenta|orange|pink|purple|red|white|yellow)"
    r"_candle_(lime_cake|pomegranate_cake|coffee_cake)$"
)
DROP_EXPLICITE = {
    "farmersrespite:coffee_bush_top",
    "farmersrespite:coffee_bush",
}

# --- familles ----------------------------------------------------------------
POISSON = re.compile(r"(fish|cod\b|salmon|catfish|halibut|pollock|lobster|squid|turtle|bass\b|tartare|fillet)", re.I)
SOUPE = re.compile(r"(soup|stew|chowder|curry|broth)", re.I)
BOISSON = re.compile(r"(\btea\b|juice|cider|coffee|milk|smoothie|latte)", re.I)
VIANDE = re.compile(
    r"(chicken|beef|bacon|\bham\b|porkchop|pork|steak|mutton|meatball|kangaroo|bison|venison|chevon|goat|"
    r"hoglin|sausage|skewer|\bloin\b|tenderloin|rabbit|moose|centipede|chop|drumstick|bunfungus|strider|"
    r"glazed ham|roast ear|cooked rice with)", re.I)
DESSERT = re.compile(
    r"(pie|cake|cookie|jam|muffin|tart\b|cheesecake|gummy|pudding|honey dipped|marshmallow|walnut|"
    r"sweet berr|blueberr|cherry|strawberr|raspberr|grape|pomegranate|lime|salmonberr|crimson berr|"
    r"nightshade|source berr|gloomgourd|rose hip|chocolate|honey$|with honey|peanut butter|nut butter|"
    r"glow berr|magma)", re.I)
LEGUME = re.compile(r"(salad|portobello|pumpkin|carrot|vegetable|mushroom|cactus|prickly|kelp|corn|ear\b|egg\b)", re.I)
FECULENT = re.compile(r"(pasta|rice|noodle|sandwich|wrap|toast|bread|dumpling|roll|bun\b)", re.I)


def famille(nom, fam_orig, mod):
    n = nom.lower()
    if SOUPE.search(n):
        return "soupe"
    if POISSON.search(n) and "tartar sauce" not in n and "salmonberry" not in n:
        return "poisson"
    if "halibut" in n:
        return "poisson"
    if BOISSON.search(n) and not re.search(r"(cake|cookie|gummy|curry)", n):
        return "boisson"
    if VIANDE.search(n):
        return "viande"
    if DESSERT.search(n):
        return "dessert"
    if LEGUME.search(n):
        return "legume"
    if FECULENT.search(n):
        return "feculent"
    return fam_orig


# --- postes et paliers -------------------------------------------------------
PLANCHER = {"fourneau": 1, "planche": 1, "poele": 2, "marmite": 3, "bouilloire": 4, "nether": 5}


def poste(nom, fam, mod, id_):
    n = nom.lower()
    if mod == "mynethersdelight":
        return "nether"
    if fam == "soupe":
        return "marmite"
    if fam == "boisson":
        return "bouilloire"
    if re.search(r"(fried|glazed|roast|chops|baked|cactus steak|pasta with|creamy|with porkchop|with egg)", n):
        return "poele"
    if re.search(r"(sandwich|salad|jam|toast|wrap|pasta|noodle|cookie|tartare|slice|cooked rice|dumpling|"
                 r"honey dipped|cuts|deluxe|stuffed portobello|fillet|dish)", n):
        return "planche"
    return "fourneau"


COMPLEXITE = [
    # (motif, palier minimal)
    (re.compile(r"^(cooked|slice of|toast$|bread slice|cooked rice$|dumplings|rice$)", re.I), 1),
    (re.compile(r"(sandwich|salad|jam$|cookie|muffin|tart$|fried|wrap|noodles|pasta$|tartare|cooked rice$|"
                r"pie$|cake$|cheesecake|steak$|bacon|cuts|jam bun|honey dipped|shepherd)", re.I), 2),
    (re.compile(r"(chops|roast chicken|jam sandwich|coffee cake|roll medley|cooked fish fillet|squid ink|"
                r"portobello|bean salad|rose hip pie|green apple pie|key lime pie|source berry|nightshade|"
                r"crimson berry pie|grape pie|meat dish|centipede|kangaroo shank|carrot roast)", re.I), 3),
    (re.compile(r"(toast with|pasta with|stuffed|deluxe|glazed|moose|small turtle|marshmallow|tea gummy|"
                r"coffee gummy|green tea cookie|tea curry|pomegranate black tea|lime green tea)", re.I), 4),
    (re.compile(r"(with candle|creamy|cooked rice with|with egg and tomato|egg with bacon|steak with egg|"
                r"halibut|pollock|nut butter|glow berr|hoglin|peanut)", re.I), 5),
]


def palier(nom, pst):
    p = PLANCHER[pst]
    for motif, mini in COMPLEXITE:
        if motif.search(nom):
            p = max(p, mini)
    return min(5, p)


VALEUR = {1: 30, 2: 40, 3: 55, 4: 60, 5: 80}
ECART = {"viande": 5, "soupe": 5, "poisson": 5, "boisson": -15, "dessert": 0, "legume": -5, "feculent": -5}


def valeur(nom, fam, pal):
    v = VALEUR[pal] + ECART[fam]
    if re.search(r"(slice|toast$|bread slice)", nom, re.I):
        v -= 10
    return max(20, v)


# --- corrections à la main ---------------------------------------------------
FORCER = {
    # id : (famille, poste, palier)
    "delightful:salmonberry_pie": ("dessert", "fourneau", 2),
    "delightful:salmonberry_pie_slice": ("dessert", "planche", 2),
    "collectorsreap:pomegranate_bean_salad": ("legume", "planche", 2),
    "collectorsreap:portobello_pasta": ("feculent", "planche", 2),
    "farmersdelight:vegetable_noodles": ("feculent", "planche", 2),
    "sweetberryfoods:blueberry_jam_sandwich": ("dessert", "planche", 2),
    "sweetberryfoods:sweet_berry_jam_sandwich": ("dessert", "planche", 2),
    "aquaculture:fish_fillet_cooked": ("poisson", "fourneau", 1),
    "aquaculturedelight:cooked_small_turtle_meat": ("poisson", "fourneau", 2),
    "moredelight:chicken_sandwich_with_egg_and_tomato": ("viande", "planche", 4),
    "moredelight:egg_with_bacon_sandwich": ("viande", "planche", 4),
    "moredelight:steak_with_egg_sandwich": ("viande", "poele", 4),
    "moredelight:cooked_rice_with_beef": ("viande", "planche", 4),
    "moredelight:cooked_rice_with_chicken_cuts": ("viande", "planche", 4),
    "moredelight:cooked_rice_with_porkchop": ("viande", "poele", 4),
    "moredelight:creamy_pasta_with_chicken_cuts": ("viande", "poele", 5),
    "moredelight:creamy_pasta_with_ham": ("viande", "poele", 5),
    "farmersdelight:mixed_salad": ("legume", "planche", 1),
    "farmersdelight:fruit_salad": ("dessert", "planche", 1),
    "delightful:field_salad": ("legume", "planche", 1),
    "farmersdelight:cooked_chicken_cuts": ("viande", "fourneau", 1),
    "alexsdelight:cooked_bunfungus_drumstick": ("viande", "fourneau", 1),
    "alexsdelight:cooked_kangaroo_shank": ("viande", "fourneau", 1),
    "alexsdelight:cooked_centipede_leg": ("viande", "fourneau", 1),
    "alexsdelight:cooked_loose_moose_rib": ("viande", "fourneau", 2),
    "delightful:cooked_marshmallow_stick": ("dessert", "fourneau", 1),
    "sweetberryfoods:cooked_blueberries": ("dessert", "fourneau", 1),
    "sweetberryfoods:cooked_sweet_berries": ("dessert", "fourneau", 1),
    "sweetberryfoods:honey_dipped_blueberries": ("dessert", "planche", 1),
    "sweetberryfoods:honey_dipped_sweet_berries": ("dessert", "planche", 1),
    "farmersdelight:honey_cookie": ("dessert", "planche", 1),
    "moredelight:toast_with_glow_berries": ("dessert", "planche", 4),
    "delightful:cooked_goat": ("viande", "fourneau", 1),
    "alexsdelight:cooked_bunfungus": ("viande", "fourneau", 1),
    "farmersdelight:cooked_bacon": ("viande", "fourneau", 1),
    "alexsdelight:cooked_bison": ("viande", "fourneau", 1),
    "farmersdelight:fried_egg": ("legume", "poele", 2),
    "farmersdelight:egg_sandwich": ("feculent", "planche", 2),
    "moredelight:toast_with_egg": ("feculent", "planche", 4),
    "collectorsreap:honey_lime_chicken": ("viande", "poele", 3),
    "collectorsreap:salmon_tartare": ("poisson", "planche", 2),
    "collectorsreap:glazed_strider": ("viande", "poele", 4),
    "farmersdelight:honey_glazed_ham": ("viande", "poele", 4),
    "farmersdelight:shepherds_pie": ("viande", "fourneau", 3),
    "farmersdelight:roast_chicken": ("viande", "poele", 3),
    "farmersdelight:stuffed_pumpkin": ("legume", "fourneau", 4),
    "farmersdelight:rice_roll_medley": ("poisson", "planche", 3),
    "aquaculturedelight:halibut_with_tartar_sauce": ("poisson", "poele", 5),
    "mynethersdelight:bleeding_tartar": ("viande", "nether", 5),
    "mynethersdelight:magma_cake": ("dessert", "nether", 5),
    "mynethersdelight:magma_cake_slice": ("dessert", "nether", 5),
    "mynethersdelight:roast_ear": ("legume", "nether", 5),
    "farmersrespite:tea_curry": ("soupe", "marmite", 4),
    "farmersrespite:coffee_cake": ("dessert", "fourneau", 4),
    "farmersrespite:candle_coffee_cake": ("dessert", "fourneau", 4),
    "farmersrespite:coffee_cake_slice": ("dessert", "fourneau", 4),
    "collectorsreap:candle_lime_cake": ("dessert", "fourneau", 5),
    "collectorsreap:candle_pomegranate_cake": ("dessert", "fourneau", 5),
    "farmersdelight:pasta_with_meatballs": ("viande", "poele", 4),
    "farmersdelight:pasta_with_mutton_chop": ("viande", "poele", 4),
    "alexsdelight:lobster_pasta": ("poisson", "planche", 3),
    "farmersdelight:squid_ink_pasta": ("poisson", "planche", 3),
    "alexsdelight:kangaroo_pasta": ("viande", "planche", 3),
    "farmersdelight:nether_salad": ("legume", "planche", 2),
    "alexsdelight:maggot_salad": ("legume", "planche", 2),
    "farmersdelight:cake_slice": ("dessert", "fourneau", 1),
    "farmersdelight:cooked_rice": ("feculent", "planche", 1),
    "farmersdelight:mushroom_rice": ("feculent", "planche", 2),
    "farmersdelight:fried_rice": ("feculent", "poele", 2),
    "delightful:cactus_steak": ("legume", "poele", 2),
    "delightful:honey_glazed_walnut": ("dessert", "poele", 4),
    "delightful:nut_butter_and_jelly_sandwich": ("dessert", "planche", 4),
    "moredelight:toast_with_peanut_butter": ("feculent", "planche", 4),
    "moredelight:toast_with_sweet_berries": ("dessert", "planche", 4),
}


def main():
    with open(SRC, encoding="utf-8") as f:
        src = json.load(f)

    vus_par_nom = {}
    retires = []
    gardes = []

    def rang_mod(mod):
        return PRIORITE_MODS.index(mod) if mod in PRIORITE_MODS else 99

    # on trie par priorité de mod pour que le doublon gardé soit le « bon »
    for p in sorted(src, key=lambda p: rang_mod(p["id"].split(":")[0])):
        id_ = p["id"]
        nom = p["nom"]
        mod = id_.split(":")[0]
        if id_ in DROP_EXPLICITE or DROP_ID.search(id_) or DROP_COULEUR.search(id_.split(":")[1]):
            retires.append((id_, nom, "pas un plat / variante"))
            continue
        cle = nom.lower()
        if cle in vus_par_nom:
            retires.append((id_, nom, f"doublon de {vus_par_nom[cle]}"))
            continue
        vus_par_nom[cle] = id_

        if id_ in FORCER:
            fam, pst, pal = FORCER[id_]
        else:
            fam = famille(nom, p["fam"], mod)
            pst = poste(nom, fam, mod, id_)
            pal = palier(nom, pst)
            pal = max(pal, PLANCHER[pst])
        gardes.append(OrderedDict(id=id_, nom=nom, fam=fam, poste=pst, pal=pal, val=valeur(nom, fam, pal)))

    gardes.sort(key=lambda p: (p["pal"], p["fam"], p["nom"]))
    with open(DST, "w", encoding="utf-8") as f:
        json.dump(gardes, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"{len(src)} entrées lues, {len(gardes)} plats gardés, {len(retires)} retirés")
    print("par palier :", dict(sorted(Counter(p['pal'] for p in gardes).items())))
    print("par famille :", dict(Counter(p['fam'] for p in gardes)))
    print("par poste :", dict(Counter(p['poste'] for p in gardes)))
    if "--detail" in sys.argv:
        print("\n--- retirés")
        for r in retires:
            print("  ", *r)
        print("\n--- gardés")
        for p in gardes:
            print(f"  P{p['pal']} {p['fam']:8} {p['poste']:10} {p['val']:3}  {p['nom']}  ({p['id']})")


if __name__ == "__main__":
    main()
