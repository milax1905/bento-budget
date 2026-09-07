package fr.cubeland.metiers.client.ecran;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.Dessin;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.client.Palette;
import fr.cubeland.metiers.client.Txt;
import fr.cubeland.metiers.metier.Metier;
import fr.cubeland.metiers.metier.Metiers;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import fr.cubeland.metiers.reseau.PaquetEtat;
import java.util.List;

/** L'onglet Métiers : le cadran du métier choisi, les six satellites, la colonne de détail. */
final class PageMetiers implements Page {
   private final EcranCubeland ecran;
   private String choisi = Metier.CUISINIER;

   PageMetiers(EcranCubeland ecran) {
      this.ecran = ecran;
   }

   @Override
   public void dessiner(Contexte c) {
      PaquetEtat etat = EtatClient.etat();
      PaquetCuisine cuisine = EtatClient.cuisine();
      Reglages r = Reglages.get();
      List<String> tous = Metiers.tous();
      int niveau = etat.niveauDe(this.choisi);
      long xp = etat.xpDe(this.choisi);
      boolean estCuisine = Metier.CUISINIER.equals(this.choisi);
      int accent = estCuisine ? Palette.JADE : Palette.AMBRE_CHAUD;
      String titre = Metiers.aUnTitre(this.choisi, niveau) ? Txt.c(Metiers.titre(this.choisi, niveau)) : null;

      Widgets.cadran(c.pile, r.progression(xp), String.valueOf(niveau), titre, accent);
      double[] angles = Widgets.anglesRepartis(tous.size());
      for (int i = 0; i < tous.size(); i++) {
         String id = tous.get(i);
         int[] p = Widgets.satellitePos(angles[i]);
         boolean survol = c.zoneDisque(p[0], p[1], Widgets.RAYON_SATELLITE + 2, () -> this.choisi = id);
         int n = etat.niveauDe(id);
         Widgets.satellite(
            c.pile, angles[i], Metiers.embleme(id), Txt.maj(Txt.c(Metiers.nom(id))), String.valueOf(n),
            Math.min(1.0F, n / (float) Math.max(1, r.niveauMax / 2)), Metier.CUISINIER.equals(id) ? Palette.JADE : Palette.AMBRE_CHAUD, id.equals(this.choisi), survol
         );
      }

      Widgets.filetColonne(c.pile);
      int y = Widgets.titreColonne(c.pile, Widgets.HAUT_COLONNE, Txt.maj(Txt.c(Metiers.nom(this.choisi))));
      y = Widgets.ligneColonne(c.pile, y, Txt.maj(Txt.t("ui.niveau")), String.valueOf(niveau), Palette.AMBRE);
      String xpTexte = niveau >= r.niveauMax ? xp + " · " + Txt.t("ui.max") : xp + " / " + r.seuil(niveau + 1);
      y = Widgets.ligneColonne(c.pile, y, Txt.maj(Txt.t("ui.experience")), xpTexte, Palette.TEXTE);
      if (titre != null) {
         y = Widgets.ligneColonne(c.pile, y, Txt.maj(Txt.t("ui.titre_rang")), titre, Palette.AMBRE_CLAIR);
      }

      y += 4;
      y = Widgets.titreColonne(c.pile, y, Txt.maj(Txt.t("ui.comment_progresser")));
      if (estCuisine) {
         y = this.geste(c, y, Txt.t("geste.plat"), "+" + r.xpPlat + " XP");
         y = this.geste(c, y, Txt.t("geste.decouverte"), "+" + r.xpDecouverte + " XP");
         y = this.geste(c, y, Txt.t("geste.qualite"), "+" + r.xpQualite + " XP");
      } else {
         Metier m = Metiers.de(this.choisi);
         for (String cle : m.gestes()) {
            long[] g = r.gain(cle);
            String valeur = g[1] > g[0] ? Txt.t("geste.xp_fourchette", g[0], g[1]) : Txt.t("geste.xp_fixe", g[0]);
            y = this.geste(c, y, Txt.t("geste." + cle), valeur);
         }
      }

      if (cuisine != null && !estCuisine) {
         y += 4;
         y = Widgets.titreColonne(c.pile, y, Txt.maj(Txt.t("ui.ta_cuisine")));
         y = Widgets.ligneColonne(c.pile, y, Txt.maj(Txt.t("ui.palier")), String.valueOf(cuisine.palier()), Palette.JADE);
         Widgets.ligneColonne(c.pile, y, Txt.maj(Txt.t("ui.recettes")), String.valueOf(cuisine.recettes()), Palette.TEXTE);
      } else if (estCuisine && cuisine != null) {
         y += 4;
         y = Widgets.titreColonne(c.pile, y, Txt.maj(Txt.t("ui.ta_cuisine")));
         y = Widgets.ligneColonne(c.pile, y, Txt.maj(Txt.t("ui.palier")), Txt.c(net.minecraft.network.chat.Component.translatable("cubelandmetiers.palier." + cuisine.palier())), Palette.JADE);
         Widgets.ligneColonne(c.pile, y, Txt.maj(Txt.t("ui.commandes_faites")), String.valueOf(cuisine.commandesFaites()), Palette.TEXTE);
      }
   }

   private int geste(Contexte c, int y, String label, String valeur) {
      if (y > Widgets.BAS_COLONNE) {
         return y;
      }
      Dessin.texte(c.pile, Dessin.tronquer(label, Widgets.L_COLONNE - Dessin.largeur(valeur) - 6), Widgets.X_COLONNE, y, Palette.TEXTE_DOUX);
      Dessin.texteDroite(c.pile, valeur, Widgets.X_COLONNE + Widgets.L_COLONNE, y, Palette.AMBRE_CLAIR);
      return y + 12;
   }
}
