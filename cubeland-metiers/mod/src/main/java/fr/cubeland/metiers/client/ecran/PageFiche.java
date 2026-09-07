package fr.cubeland.metiers.client.ecran;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.Ateliers;
import fr.cubeland.metiers.client.Dessin;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.client.Palette;
import fr.cubeland.metiers.client.Txt;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Famille;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.cuisine.Recettes;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import java.util.List;
import java.util.Locale;

/** La fiche d'un plat : sa recette à gauche, FAIRE ou VALEUR à droite. */
final class PageFiche implements Page {
   private static final int VOLET_FAIRE = 0;
   private static final int VOLET_VALEUR = 1;
   private static final int Y_ONGLETS = 69;

   private final EcranCubeland ecran;
   private final String platId;
   private int volet = VOLET_FAIRE;

   PageFiche(EcranCubeland ecran, String platId) {
      this.ecran = ecran;
      this.platId = platId;
   }

   @Override
   public void dessiner(Contexte c) {
      PaquetCuisine cuisine = EtatClient.cuisine();
      Plat p = Catalogue.parId(this.platId);
      if (p == null) {
         this.ecran.fermerSousPage();
         return;
      }
      Widgets.retour(c, this.ecran::fermerSousPage);
      Famille f = p.famille();
      int coul = Palette.famille(f);
      boolean connue = cuisine != null && cuisine.connue(p);
      int fois = cuisine == null ? 0 : cuisine.fois(p);
      boolean pret = EtatClient.ficheDe(p.id());
      List<Recettes.Facon> facons = pret ? EtatClient.fiche().facons() : List.of();
      List<String> utileA = pret ? EtatClient.fiche().utileA() : List.of();
      boolean enListe = !facons.isEmpty() && facons.get(0).ingredients().size() > 4;

      // le plat et sa recette
      int cx = Widgets.CX_CADRAN;
      int cy = enListe ? 74 : 118;
      int rc = enListe ? 18 : 22;
      Dessin.disque(c.pile, cx, cy, rc, Palette.voile(Palette.NUIT, 224));
      Dessin.anneau(c.pile, cx, cy, rc, 2, Palette.voile(Palette.VIOLET, 224));
      Dessin.arc(c.pile, cx, cy, rc - 2, 3, coul, -90.0F, 360.0F * Math.min(1.0F, fois / 20.0F));
      Dessin.objet(p.id(), cx - 8, cy - 8);
      if (facons.isEmpty()) {
         Dessin.texteCentre(c.pile, pret ? Txt.t("ui.ne_se_fabrique_pas") : "…", cx, cy + rc + 12, Palette.TEXTE_FAIBLE);
      } else if (enListe) {
         this.ingredientsEnListe(c, facons.get(0));
      } else {
         this.ingredientsEnCercle(c, facons.get(0), cx, cy, rc);
      }

      int pied = 196;
      if (!connue) {
         Dessin.texteCentre(c.pile, Txt.t("ui.pas_au_carnet"), cx, pied, Palette.ROSE);
         Dessin.texteCentre(c.pile, Txt.t("ui.pas_au_carnet.detail"), cx, pied + 11, Palette.TEXTE_FAIBLE);
      } else {
         Dessin.texteCentre(c.pile, Txt.t("ui.cuisine_n_fois", fois), cx, pied, Palette.TEXTE_FAIBLE);
         if (!utileA.isEmpty()) {
            StringBuilder b = new StringBuilder(Txt.t("ui.sert_aussi")).append(' ');
            for (int i = 0; i < utileA.size() && i < 2; i++) {
               if (i > 0) {
                  b.append(", ");
               }
               b.append(Ateliers.objet(utileA.get(i)));
            }
            if (utileA.size() > 2) {
               b.append('…');
            }
            Dessin.texteCentre(c.pile, Dessin.tronquer(b.toString(), 208), cx, pied + 11, Palette.voile(Palette.VIOLET, 255));
         }
      }

      // la colonne
      Widgets.filetColonne(c.pile);
      int y = Widgets.HAUT_COLONNE;
      Dessin.texteGrand(c.pile, Dessin.tronquer(p.nomTexte(), (int) (Widgets.L_COLONNE / 1.4F)), Widgets.X_COLONNE, y, 1.4F, Palette.TEXTE);
      y += 16;
      Dessin.texte(c.pile, Txt.c(f.nom()).toLowerCase(Locale.ROOT) + " · " + Txt.t("ui.palier").toLowerCase(Locale.ROOT) + " " + p.palier(), Widgets.X_COLONNE, y, coul);
      y += 12;
      Dessin.trait(c.pile, Widgets.X_COLONNE, y, Widgets.L_COLONNE, Palette.voile(Palette.VIOLET, 192));
      this.onglets(c);
      if (this.volet == VOLET_FAIRE) {
         this.faire(c, p, cuisine, facons, pret, connue);
      } else {
         this.valeur(c, p, cuisine, f);
      }
   }

   private void onglets(Contexte c) {
      int x = Widgets.X_COLONNE;
      String[] noms = new String[]{Txt.maj(Txt.t("ui.faire")), Txt.maj(Txt.t("ui.valeur"))};
      for (int i = 0; i < noms.length; i++) {
         int l = Dessin.largeur(noms[i]);
         boolean actif = this.volet == i;
         int cible = i;
         boolean survol = c.zone(x, Y_ONGLETS - 2, l, 12, () -> this.volet = cible);
         Dessin.texte(c.pile, noms[i], x, Y_ONGLETS, actif ? Palette.AMBRE : (survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE));
         if (actif) {
            Dessin.trait(c.pile, x, Y_ONGLETS + 10, l, Palette.AMBRE);
         }
         x += l + 12;
      }
   }

   private void faire(Contexte c, Plat p, PaquetCuisine cuisine, List<Recettes.Facon> facons, boolean pret, boolean connue) {
      String type = facons.isEmpty() ? p.poste() : facons.get(0).type();
      Ateliers.Atelier atelier = Ateliers.detecter(type);
      int y = Y_ONGLETS + 14;
      y = Widgets.titreColonne(c.pile, y, Txt.maj(Txt.t("ui.le_poste")));
      if (!pret) {
         Dessin.texte(c.pile, "…", Widgets.X_COLONNE, y, Palette.TEXTE_FAIBLE);
         return;
      }
      String bloc = atelier == Ateliers.Atelier.AUTRE ? Ateliers.nomBrut(type) : atelier.bloc();
      Dessin.texte(c.pile, Dessin.tronquer(bloc, Widgets.L_COLONNE), Widgets.X_COLONNE, y, Palette.JADE);
      y += 13;
      y = Widgets.titreColonne(c.pile, y, Txt.maj(Txt.t("ui.comment_faire")));
      int n = 1;
      for (String geste : atelier.gestes()) {
         y = this.etape(c, y, n++, geste);
      }
      y = this.etape(c, y, n++, Txt.t(connue ? "ui.etape.carnet" : "ui.etape.premiere"));
      y = this.etape(c, y, n++, Txt.t("ui.etape.jei"));
      if (cuisine != null && !cuisine.aPortee(p)) {
         this.etape(c, y, n, Txt.t("ui.etape.palier_requis", p.palier(), cuisine.palier()));
      }
   }

   private int etape(Contexte c, int y, int n, String texte) {
      if (y > Widgets.BAS_COLONNE - 8) {
         return y;
      }
      List<String> lignes = Widgets.couper(texte, Widgets.L_COLONNE - 12, 3);
      if (lignes.isEmpty()) {
         return y;
      }
      Dessin.texte(c.pile, n + ".", Widgets.X_COLONNE, y, Palette.AMBRE);
      for (String ligne : lignes) {
         if (y > Widgets.BAS_COLONNE) {
            break;
         }
         Dessin.texte(c.pile, ligne, Widgets.X_COLONNE + 12, y, Palette.TEXTE_DOUX);
         y += 10;
      }
      return y + 3;
   }

   private void valeur(Contexte c, Plat p, PaquetCuisine cuisine, Famille f) {
      int x = Widgets.X_COLONNE;
      int l = Widgets.L_COLONNE;
      int y = Y_ONGLETS + 14;
      Dessin.texte(c.pile, Txt.maj(Txt.t("ui.atelier")), x, y, Palette.AMBRE_CHAUD);
      y += 11;
      Dessin.texte(c.pile, Dessin.tronquer(Ateliers.detecter(p.poste()).nom(), l), x, y, Palette.JADE);
      y += 13;
      Dessin.texte(c.pile, Txt.maj(Txt.t("ui.effet")), x, y, Palette.AMBRE_CHAUD);
      y += 11;
      Dessin.texte(c.pile, Dessin.tronquer(Ateliers.effet(f.effet()), l), x, y, Palette.TEXTE);
      y += 11;
      if (f.aUnBonus()) {
         Dessin.texte(c.pile, Dessin.tronquer(Txt.t("ui.bonus_signature", Ateliers.effet(f.bonus())), l), x, y, Palette.TEXTE_FAIBLE);
         y += 11;
      }
      y += 3;
      Dessin.texte(c.pile, Txt.maj(Txt.t("ui.tes_chances")), x, y, Palette.AMBRE_CHAUD);
      if (cuisine != null && !cuisine.aPortee(p)) {
         Dessin.texteDroite(c.pile, Txt.t("ui.hors_palier"), x + l, y, Palette.ROUGE);
      }
      y += 11;
      for (int q = 1; q <= Qualite.MAX; q++) {
         int chance = cuisine == null ? 0 : cuisine.chances()[q - 1];
         int cq = Palette.qualite(q);
         Dessin.texte(c.pile, Dessin.tronquer(Txt.c(Qualite.nom(q)), 52), x, y, cq);
         int bx = x + 56;
         int bw = 34;
         Dessin.rect(c.pile, bx, y + 2, bw, 3, Palette.voile(Palette.VIOLET, 160));
         Dessin.rect(c.pile, bx, y + 2, Math.round(bw * chance / 100.0F), 3, cq);
         Dessin.texteDroite(c.pile, chance + "%", x + 118, y, Palette.TEXTE_FAIBLE);
         Dessin.texteDroite(c.pile, Qualite.prix(p, q) + " P", x + l, y, Palette.AMBRE_CLAIR);
         y += 11;
      }
      Reglages r = Reglages.get();
      if (r.livraisonPourcent > 100) {
         Dessin.texte(c.pile, Dessin.tronquer(Txt.t("ui.livraison_paie", r.livraisonPourcent), l), x, y + 2, Palette.TEXTE_FAIBLE);
      }
   }

   private void ingredientsEnCercle(Contexte c, Recettes.Facon fa, int cx, int cy, int rc) {
      int n = fa.ingredients().size();
      double[] angles = Widgets.anglesCardinaux(n);
      for (int i = 0; i < n && i < angles.length; i++) {
         double a = Math.toRadians(angles[i]);
         int ix = cx + (int) (Math.cos(a) * 44.0);
         int iy = cy + (int) (Math.sin(a) * 44.0);
         Dessin.trait(c.pile, cx + (int) (Math.cos(a) * (rc + 3)), cy + (int) (Math.sin(a) * (rc + 3)), ix - (int) (Math.cos(a) * 9.0), iy - (int) (Math.sin(a) * 9.0), Palette.voile(Palette.VIOLET, 160));
         Dessin.disque(c.pile, ix, iy, 9, Palette.CARTE);
         Dessin.anneau(c.pile, ix, iy, 9, 1, Palette.voile(Palette.VIOLET, 224));
         Dessin.objet(fa.ingredients().get(i), ix - 8, iy - 8);
         String lab = fa.combien().get(i) + " " + Ateliers.objet(fa.ingredients().get(i));
         int maxLab = Math.abs(ix - cx) < 25 ? 96 : 80;
         int ly = iy < cy ? iy - 21 : iy + 13;
         Dessin.texteCentre(c.pile, Dessin.tronquer(lab, maxLab), ix, ly, Palette.TEXTE_FAIBLE);
      }
   }

   private void ingredientsEnListe(Contexte c, Recettes.Facon fa) {
      int n = Math.min(fa.ingredients().size(), 10);
      for (int i = 0; i < n; i++) {
         int x = 22 + i % 2 * 104;
         int y = 102 + i / 2 * 18;
         Dessin.objet(fa.ingredients().get(i), x, y);
         String lab = fa.combien().get(i) + "× " + Ateliers.objet(fa.ingredients().get(i));
         Dessin.texte(c.pile, Dessin.tronquer(lab, 82), x + 19, y + 4, Palette.TEXTE_DOUX);
      }
   }

   @Override
   public boolean echap() {
      this.ecran.fermerSousPage();
      return true;
   }
}
