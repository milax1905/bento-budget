package fr.cubeland.metiers.client.ecran;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.Dessin;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.client.Palette;
import fr.cubeland.metiers.client.Txt;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.quete.PremiersPas;
import fr.cubeland.metiers.quete.Quete;
import fr.cubeland.metiers.quete.TextesQuete;
import fr.cubeland.metiers.quete.TypeQuete;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import fr.cubeland.metiers.reseau.PaquetLivrer;
import fr.cubeland.metiers.reseau.Reseau;
import java.util.List;
import java.util.Map.Entry;
import net.minecraft.network.chat.Component;

/**
 * L'onglet Cuisine : le cadran du palier, des idées de plats autour, et dans la
 * colonne les trois commandes du carnet (ou les premiers pas).
 */
final class PageCuisine implements Page {
   private static final int MAX_IDEES = 4;
   private static final int H_CARTE = 46;
   private final EcranCubeland ecran;

   PageCuisine(EcranCubeland ecran) {
      this.ecran = ecran;
   }

   @Override
   public void dessiner(Contexte c) {
      PaquetCuisine cuisine = EtatClient.cuisine();
      if (cuisine == null) {
         Dessin.texteCentre(c.pile, Txt.t("ui.attente"), Widgets.LARGEUR / 2, Widgets.HAUTEUR / 2, Palette.TEXTE_FAIBLE);
         return;
      }
      Reglages r = Reglages.get();
      String sous = cuisine.seuilSuivant() > 0 ? cuisine.recettes() + " / " + cuisine.seuilSuivant() : Txt.t("ui.palier_max");
      Widgets.cadran(c.pile, cuisine.progression(), String.valueOf(cuisine.palier()), sous, Palette.JADE);

      List<String> idees = cuisine.idees();
      int n = Math.min(MAX_IDEES, idees.size());
      double[] angles = Widgets.anglesCardinaux(n);
      for (int i = 0; i < n; i++) {
         Plat p = Catalogue.parId(idees.get(i));
         if (p == null) {
            continue;
         }
         int[] pos = Widgets.satellitePos(angles[i]);
         boolean survol = c.zoneDisque(pos[0], pos[1], Widgets.RAYON_SATELLITE + 2, () -> this.ecran.ouvrirFiche(p.id()));
         Widgets.satellite(c.pile, angles[i], p.id(), p.nomTexte(), null, 0.0F, Palette.famille(p.famille()), false, survol);
         if (survol) {
            c.bulle(p.nomTexte(), Txt.t("ui.clique_fiche"));
         }
      }
      if (idees.isEmpty()) {
         Dessin.texteCentre(c.pile, Txt.t("ui.tout_decouvert"), Widgets.CX_CADRAN, Widgets.CY_CADRAN + 80, Palette.JADE);
      } else if (cuisine.manque() > 0) {
         Dessin.texteCentre(c.pile, Txt.t("ui.encore_recettes", cuisine.manque(), cuisine.palier() + 1), Widgets.CX_CADRAN, Widgets.CY_CADRAN + 80, Palette.TEXTE_FAIBLE);
      }

      Widgets.filetColonne(c.pile);
      String nomPalier = Txt.c(Component.translatable("cubelandmetiers.palier." + cuisine.palier()));
      int y = Widgets.titreColonne(c.pile, Widgets.HAUT_COLONNE, Txt.maj(Txt.t("ui.palier") + " " + cuisine.palier() + " · " + nomPalier));

      if (EtatClient.premiersPasEnCours()) {
         this.premiersPas(c, y, EtatClient.premiersPas());
         return;
      }
      List<Quete> quetes = EtatClient.quetes();
      if (quetes.isEmpty()) {
         y = Widgets.paragrapheColonne(c.pile, y, Txt.t("ui.tu_debloqueras"), Palette.TEXTE_FAIBLE, 2);
         this.suivant(c, y, cuisine, r);
         return;
      }
      for (TypeQuete type : TypeQuete.values()) {
         for (Quete q : quetes) {
            if (q.type() == type) {
               this.carte(c, y, q);
               y += H_CARTE + 4;
            }
         }
      }
   }

   private void suivant(Contexte c, int y, PaquetCuisine cuisine, Reglages r) {
      if (cuisine.seuilSuivant() <= 0) {
         return;
      }
      for (Entry<String, Integer> e : r.postes.entrySet()) {
         if (e.getValue() != null && e.getValue() == cuisine.palier() + 1) {
            Dessin.texte(c.pile, Dessin.tronquer(Txt.t("ui.un_poste", Txt.c(TextesQuete.poste(e.getKey()))), Widgets.L_COLONNE), Widgets.X_COLONNE, y, Palette.TEXTE);
            break;
         }
      }
   }

   private void carte(Contexte c, int y, Quete q) {
      int x = Widgets.X_COLONNE;
      int l = Widgets.L_COLONNE;
      int accent = Palette.quete(q.type());
      boolean faite = q.faite();
      Dessin.carteMate(c.pile, x, y, l, H_CARTE, Palette.voile(Palette.CARTE, 176), Palette.voile(accent, faite ? 255 : 128));
      Dessin.rect(c.pile, x, y, 2, H_CARTE, accent);
      Dessin.texte(c.pile, Txt.maj(Txt.c(TextesQuete.titre(q))), x + 6, y + 4, accent);
      String avancement = q.progres() + "/" + q.objectif();
      Dessin.texteDroite(c.pile, avancement, x + l - 5, y + 4, faite ? accent : Palette.TEXTE_DOUX);
      List<String> lignes = Widgets.couper(Txt.c(TextesQuete.consigne(q)), l - 11, 2);
      int ly = y + 15;
      for (String ligne : lignes) {
         Dessin.texte(c.pile, ligne, x + 6, ly, Palette.TEXTE);
         ly += 10;
      }
      Dessin.texte(c.pile, Txt.c(TextesQuete.recompense(q)), x + 6, y + 35, Palette.TEXTE_FAIBLE);
      if (q.type() == TypeQuete.LIVRAISON && !faite) {
         String texte = Txt.maj(Txt.t("ui.livrer"));
         int bx = x + l - Widgets.largeurBouton(texte) - 3;
         boolean survol = Widgets.bouton(c, bx, y + 30, texte, accent, () -> Reseau.versServeur(new PaquetLivrer(q.id())));
         if (survol) {
            c.bulle(Txt.t("ui.livrer.bulle"));
         }
      }
   }

   private void premiersPas(Contexte c, int y, int etape) {
      int x = Widgets.X_COLONNE;
      int l = Widgets.L_COLONNE;
      Dessin.texte(c.pile, Txt.maj(Txt.t("ui.premiers_pas")), x, y, Palette.CIEL);
      Dessin.texteDroite(c.pile, Txt.t("ui.premiers_pas.etape", etape + 1, PremiersPas.FINI), x + l, y, Palette.TEXTE_DOUX);
      y += 12;
      for (int i = 0; i < PremiersPas.FINI; i++) {
         int px = x + i * ((l - 8) / PremiersPas.FINI);
         Dessin.rect(c.pile, px, y, (l - 8) / PremiersPas.FINI - 2, 3, i < etape ? Palette.CIEL : (i == etape ? Palette.voile(Palette.CIEL, 128) : Palette.voile(Palette.VIOLET, 176)));
      }
      y += 10;
      int h = 74;
      Dessin.carteMate(c.pile, x, y, l, h, Palette.voile(Palette.CARTE, 176), Palette.voile(Palette.CIEL, 160));
      Dessin.rect(c.pile, x, y, 2, h, Palette.CIEL);
      int ly = y + 5;
      for (String ligne : Widgets.couper(Txt.c(TextesQuete.premiersPas(etape)), l - 11, 2)) {
         Dessin.texte(c.pile, ligne, x + 6, ly, Palette.TEXTE);
         ly += 10;
      }
      ly += 3;
      for (String ligne : Widgets.couper(Txt.c(TextesQuete.premiersPasDetail(etape)), l - 11, 4)) {
         Dessin.texte(c.pile, ligne, x + 6, ly, Palette.TEXTE_DOUX);
         ly += 10;
      }
      Quete livraison = EtatClient.quete(TypeQuete.LIVRAISON);
      if (etape == PremiersPas.LIVRER && livraison != null) {
         this.carte(c, y + h + 6, livraison);
      }
   }
}
