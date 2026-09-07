package fr.cubeland.metiers.client.ecran;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.Ateliers;
import fr.cubeland.metiers.client.Dessin;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.client.Palette;
import fr.cubeland.metiers.client.Txt;
import fr.cubeland.metiers.cuisine.Famille;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.quete.TextesQuete;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import net.minecraft.network.chat.Component;

/** Le guide du cuisinier : six sections, dans l'ordre où on en a besoin. Les chiffres viennent des réglages du serveur. */
final class PageGuide implements Page {
   private static final String[] SECTIONS = new String[]{"debuter", "commandes", "paliers", "familles", "qualites", "vendre"};
   private static final int X_TEXTE = 118;
   private static final int L_TEXTE = Widgets.DROITE - X_TEXTE;
   private static final int Y_DEBUT = 52;

   private final EcranCubeland ecran;
   private int section;

   PageGuide(EcranCubeland ecran, int section) {
      this.ecran = ecran;
      this.section = Math.max(0, Math.min(SECTIONS.length - 1, section));
   }

   @Override
   public void dessiner(Contexte c) {
      Widgets.retour(c, this.ecran::fermerSousPage);
      Dessin.texte(c.pile, Txt.maj(Txt.t("guide.titre")), 80, 32, Palette.AMBRE);
      for (int i = 0; i < SECTIONS.length; i++) {
         int iy = 56 + i * 15;
         boolean actif = this.section == i;
         int cible = i;
         boolean survol = c.zone(17, iy - 3, 84, 13, () -> this.section = cible);
         if (actif) {
            Dessin.rect(c.pile, 17, iy - 1, 2, 9, Palette.AMBRE);
         }
         Dessin.texte(c.pile, Txt.t("guide.section." + SECTIONS[i]), 24, iy, actif ? Palette.AMBRE : (survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE));
      }
      for (int fy = 52; fy < 208; fy += 2) {
         Dessin.rect(c.pile, 106, fy, 1, 1, Palette.voile(Palette.VIOLET, 176));
      }
      switch (this.section) {
         case 0 -> this.debuter(c);
         case 1 -> this.commandes(c);
         case 2 -> this.paliers(c);
         case 3 -> this.familles(c);
         case 4 -> this.qualites(c);
         default -> this.vendre(c);
      }
   }

   private int titre(Contexte c, int y, String t) {
      Dessin.texte(c.pile, Txt.maj(t), X_TEXTE, y, Palette.AMBRE_CHAUD);
      Dessin.trait(c.pile, X_TEXTE, y + 11, L_TEXTE, Palette.voile(Palette.VIOLET, 192));
      return y + 17;
   }

   private int para(Contexte c, int y, String t, int couleur) {
      for (String ligne : Widgets.couper(t, L_TEXTE, 6)) {
         Dessin.texte(c.pile, ligne, X_TEXTE, y, couleur);
         y += 10;
      }
      return y + 4;
   }

   private int ligne(Contexte c, int y, String gauche, String droite, int couleurDroite) {
      Dessin.texte(c.pile, gauche, X_TEXTE, y, Palette.TEXTE_DOUX);
      Dessin.texteDroite(c.pile, droite, X_TEXTE + L_TEXTE, y, couleurDroite);
      return y + 11;
   }

   private void debuter(Contexte c) {
      Reglages r = Reglages.get();
      PaquetCuisine cuisine = EtatClient.cuisine();
      int y = this.titre(c, Y_DEBUT, Txt.t("guide.debuter.titre"));
      y = this.para(c, y, Txt.t("guide.debuter.1"), Palette.TEXTE_DOUX);
      y = this.para(c, y, Txt.t("guide.debuter.2"), Palette.TEXTE);
      y += 2;
      y = this.titre(c, y, Txt.t("guide.debuter.xp"));
      y = this.ligne(c, y, Txt.t("geste.plat"), "+" + r.xpPlat + " XP", Palette.AMBRE_CLAIR);
      y = this.ligne(c, y, Txt.t("geste.decouverte"), "+" + r.xpDecouverte + " XP", Palette.AMBRE_CLAIR);
      y = this.ligne(c, y, Txt.t("geste.qualite"), "+" + r.xpQualite + " XP", Palette.AMBRE_CLAIR);
      if (cuisine != null && r.bonusXpDe(cuisine.palier()) > 0) {
         y = this.ligne(c, y, Txt.t("guide.debuter.bonus", cuisine.palier()), "+" + r.bonusXpDe(cuisine.palier()) + "%", Palette.JADE);
      }
      y += 4;
      y = this.para(c, y, Txt.t("guide.debuter.3"), Palette.TEXTE_FAIBLE);
      if (r.platHorsPalierInerte) {
         this.para(c, y, Txt.t("guide.debuter.4"), Palette.TEXTE_FAIBLE);
      }
   }

   private void commandes(Contexte c) {
      Reglages r = Reglages.get();
      int y = this.titre(c, Y_DEBUT, Txt.t("guide.commandes.titre"));
      y = this.para(c, y, Txt.t("guide.commandes.1"), Palette.TEXTE_DOUX);
      Dessin.rect(c.pile, X_TEXTE, y + 2, 3, 3, Palette.CIEL);
      y = this.para(c, y, "   " + Txt.t("guide.commandes.decouverte", r.xpCommandeDecouverte), Palette.TEXTE);
      Dessin.rect(c.pile, X_TEXTE, y + 2, 3, 3, Palette.AMBRE);
      y = this.para(c, y, "   " + Txt.t("guide.commandes.livraison", r.livraisonPourcent), Palette.TEXTE);
      Dessin.rect(c.pile, X_TEXTE, y + 2, 3, 3, Palette.JADE);
      y = this.para(c, y, "   " + Txt.t("guide.commandes.maitrise", r.xpCommandeMaitrise), Palette.TEXTE);
      y += 2;
      y = this.para(c, y, Txt.t("guide.commandes.2", r.rotationLivraisonMinutes), Palette.TEXTE_FAIBLE);
      this.para(c, y, Txt.t("guide.commandes.3"), Palette.TEXTE_FAIBLE);
   }

   private void paliers(Contexte c) {
      Reglages r = Reglages.get();
      PaquetCuisine cuisine = EtatClient.cuisine();
      int palier = cuisine == null ? 1 : cuisine.palier();
      int y = this.titre(c, Y_DEBUT, Txt.t("guide.paliers.titre"));
      Map<Integer, String> postes = new LinkedHashMap<>();
      for (Entry<String, Integer> e : r.postes.entrySet()) {
         if (e.getValue() != null) {
            postes.merge(e.getValue(), Txt.c(TextesQuete.poste(e.getKey())), (a, b) -> a + ", " + b);
         }
      }
      for (int p = 1; p <= 5; p++) {
         boolean atteint = p <= palier;
         boolean courant = p == palier;
         if (courant) {
            Dessin.rect(c.pile, X_TEXTE - 6, y + 1, 3, 3, Palette.AMBRE);
         }
         String besoin = p == 1 ? Txt.t("guide.paliers.debut") : Txt.t("guide.paliers.recettes", r.palierRecettes[p - 1]);
         Dessin.texte(c.pile, p + " · " + Txt.c(Component.translatable("cubelandmetiers.palier." + p)), X_TEXTE, y, courant ? Palette.AMBRE : (atteint ? Palette.TEXTE : Palette.TEXTE_DOUX));
         Dessin.texteDroite(c.pile, besoin, X_TEXTE + L_TEXTE, y, atteint ? Palette.JADE : Palette.TEXTE_FAIBLE);
         y += 10;
         String detail = postes.containsKey(p) ? Txt.t("guide.paliers.postes", postes.get(p)) : "";
         String rec = Txt.c(Component.translatable("cubelandmetiers.palier." + p + ".recompense"));
         if (!rec.isBlank()) {
            detail = detail.isEmpty() ? rec : detail + " · " + rec;
         }
         for (String ligne : Widgets.couper(detail, L_TEXTE, 2)) {
            Dessin.texte(c.pile, ligne, X_TEXTE, y, Palette.TEXTE_FAIBLE);
            y += 9;
         }
         y += 3;
      }
   }

   private void familles(Contexte c) {
      int y = this.titre(c, Y_DEBUT, Txt.t("guide.familles.titre"));
      y = this.para(c, y, Txt.t("guide.familles.1"), Palette.TEXTE_DOUX);
      for (Famille f : Famille.values()) {
         Dessin.rect(c.pile, X_TEXTE, y + 2, 3, 3, Palette.famille(f));
         Dessin.texte(c.pile, Txt.c(f.nom()), X_TEXTE + 8, y, Palette.famille(f));
         Dessin.texte(c.pile, Dessin.tronquer(Txt.c(f.sert()), 90), X_TEXTE + 78, y, Palette.TEXTE_FAIBLE);
         Dessin.texteDroite(c.pile, Dessin.tronquer(Ateliers.effet(f.effet()), 120), X_TEXTE + L_TEXTE, y, Palette.TEXTE_DOUX);
         y += 12;
      }
      y += 2;
      this.para(c, y, Txt.t("guide.familles.2"), Palette.TEXTE_FAIBLE);
   }

   private void qualites(Contexte c) {
      Reglages r = Reglages.get();
      PaquetCuisine cuisine = EtatClient.cuisine();
      int y = this.titre(c, Y_DEBUT, Txt.t("guide.qualites.titre"));
      y = this.para(c, y, Txt.t("guide.qualites.1"), Palette.TEXTE_DOUX);
      Dessin.texte(c.pile, Txt.t("guide.qualites.col.qualite"), X_TEXTE, y, Palette.TEXTE_FAIBLE);
      Dessin.texteDroite(c.pile, Txt.t("guide.qualites.col.effet"), X_TEXTE + 128, y, Palette.TEXTE_FAIBLE);
      Dessin.texteDroite(c.pile, Txt.t("guide.qualites.col.prix"), X_TEXTE + 176, y, Palette.TEXTE_FAIBLE);
      if (cuisine != null) {
         Dessin.texteDroite(c.pile, Txt.t("guide.qualites.col.chances"), X_TEXTE + L_TEXTE, y, Palette.TEXTE_FAIBLE);
      }
      y += 11;
      for (int q = 1; q <= Qualite.MAX; q++) {
         int cq = Palette.qualite(q);
         Dessin.texte(c.pile, Txt.c(Qualite.nom(q)), X_TEXTE, y, cq);
         Dessin.texteDroite(c.pile, r.dureeEffet[q - 1] + " s", X_TEXTE + 128, y, Palette.TEXTE_DOUX);
         Dessin.texteDroite(c.pile, "×" + r.multiplicateurs[q - 1], X_TEXTE + 176, y, Palette.AMBRE_CLAIR);
         if (cuisine != null) {
            int chance = cuisine.chances()[q - 1];
            int bx = X_TEXTE + 196;
            int bw = L_TEXTE - 196 - 26;
            Dessin.rect(c.pile, bx, y + 2, bw, 3, Palette.voile(Palette.VIOLET, 160));
            Dessin.rect(c.pile, bx, y + 2, Math.max(chance > 0 ? 1 : 0, bw * chance / 100), 3, cq);
            Dessin.texteDroite(c.pile, chance + "%", X_TEXTE + L_TEXTE, y, Palette.TEXTE_FAIBLE);
         }
         y += 12;
      }
      y += 3;
      this.para(c, y, Txt.t("guide.qualites.2", r.couteauQualite[1], r.couteauQualite[2], r.couteauQualite[3], r.couteauQualite[4]), Palette.TEXTE_FAIBLE);
   }

   private void vendre(Contexte c) {
      Reglages r = Reglages.get();
      int y = this.titre(c, Y_DEBUT, Txt.t("guide.vendre.titre"));
      y = this.para(c, y, Txt.t("guide.vendre.1"), Palette.TEXTE_DOUX);
      for (int q = 1; q <= Qualite.MAX; q++) {
         Dessin.texte(c.pile, Txt.c(Qualite.nom(q)), X_TEXTE, y, Palette.qualite(q));
         Dessin.texteDroite(c.pile, "×" + r.multiplicateurs[q - 1], X_TEXTE + 110, y, Palette.AMBRE_CLAIR);
         y += 11;
      }
      y += 4;
      for (String cle : List.of("guide.vendre.cmd.vendre", "guide.vendre.cmd.tout", "guide.vendre.cmd.prix", "guide.vendre.cmd.livrer")) {
         y = this.para(c, y, Txt.t(cle), Palette.TEXTE);
      }
      if (r.commissionVente > 0) {
         y = this.para(c, y, Txt.t("guide.vendre.commission", r.commissionVente), Palette.TEXTE_FAIBLE);
      }
      this.para(c, y, Txt.t("guide.vendre.2"), Palette.TEXTE_FAIBLE);
   }

   @Override
   public boolean echap() {
      this.ecran.fermerSousPage();
      return true;
   }
}
