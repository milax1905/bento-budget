package fr.cubeland.metiers.client.ecran;

import com.mojang.blaze3d.vertex.PoseStack;
import fr.cubeland.metiers.client.Dessin;
import fr.cubeland.metiers.client.Palette;
import fr.cubeland.metiers.client.Txt;
import java.util.ArrayList;
import java.util.List;

/** Les éléments que plusieurs pages partagent : cadran, satellites, colonne de droite, retour. */
public final class Widgets {
   public static final int LARGEUR = EcranCubeland.LARGEUR;
   public static final int HAUTEUR = EcranCubeland.HAUTEUR;
   public static final int MARGE = EcranCubeland.MARGE;
   /** Bord intérieur : là où le texte commence. */
   public static final int BORD = MARGE + 7;
   public static final int DROITE = LARGEUR - BORD;
   public static final int CX_CADRAN = 129;
   public static final int CY_CADRAN = 124;
   public static final int RAYON_SATELLITE = 12;
   public static final int DIST_SATELLITE = 60;
   public static final int X_COLONNE = 240;
   public static final int L_COLONNE = DROITE - X_COLONNE;
   public static final int HAUT_COLONNE = MARGE + 26;
   public static final int BAS_COLONNE = HAUTEUR - MARGE - 12;

   private Widgets() {
   }

   // --- cadran ---------------------------------------------------------------

   public static void cadran(PoseStack pile, float part, String gros, String sousTitre, int accent) {
      int cx = CX_CADRAN;
      int cy = CY_CADRAN;
      part = Math.max(0.0F, Math.min(1.0F, part));
      Dessin.anneau(pile, cx, cy, 47, 1, Palette.voile(Palette.VIOLET, 112));
      Dessin.anneau(pile, cx, cy, 38, 3, Palette.voile(Palette.VIOLET, 192));
      Dessin.arc(pile, cx, cy, 38, 3, accent, -90.0F, 360.0F * part);
      Dessin.anneau(pile, cx, cy, 31, 1, Palette.voile(Palette.VIOLET, 112));
      Dessin.graduations(pile, cx, cy, 42, 60, 2, 4, Palette.voile(Palette.VIOLET, 144), Palette.voile(Palette.AMBRE, 112));
      double a = Math.toRadians(-90.0F + 360.0F * part);
      int bx = cx + (int) (Math.cos(a) * 38.0);
      int by = cy + (int) (Math.sin(a) * 38.0);
      Dessin.disque(pile, bx, by, 3, Palette.voile(accent, 96));
      Dessin.disque(pile, bx, by, 2, Palette.AMBRE_CLAIR);
      if (gros != null) {
         Dessin.texteGrandCentre(pile, gros, cx, cy - 18, 2.4F, Palette.AMBRE);
      }
      if (sousTitre != null && !sousTitre.isBlank()) {
         Dessin.trait(pile, cx - 14, cy + 8, 28, Palette.voile(Palette.VIOLET, 224));
         Dessin.texteCentre(pile, Dessin.tronquer(sousTitre, 72), cx, cy + 13, Palette.AMBRE_CLAIR);
      }
   }

   /** Position d'un satellite sur son orbite. */
   public static int[] satellitePos(double angleDeg) {
      double a = Math.toRadians(angleDeg);
      return new int[]{CX_CADRAN + (int) (Math.cos(a) * DIST_SATELLITE), CY_CADRAN + (int) (Math.sin(a) * DIST_SATELLITE)};
   }

   /**
    * Un satellite du cadran : disque, anneau, objet, nom placé selon le quadrant
    * pour que deux voisins ne se marchent pas dessus.
    */
   public static void satellite(PoseStack pile, double angleDeg, String objet, String nom, String sous, float part, int accent, boolean choisi, boolean survol) {
      int cx = CX_CADRAN;
      int cy = CY_CADRAN;
      double a = Math.toRadians(angleDeg);
      int[] p = satellitePos(angleDeg);
      int sx = p[0];
      int sy = p[1];
      Dessin.trait(
         pile,
         cx + (int) (Math.cos(a) * 48.0), cy + (int) (Math.sin(a) * 48.0),
         sx - (int) (Math.cos(a) * 12.0), sy - (int) (Math.sin(a) * 12.0),
         choisi ? Palette.voile(accent, 144) : Palette.voile(Palette.VIOLET, 144)
      );
      Dessin.disque(pile, sx, sy, RAYON_SATELLITE, Palette.CARTE);
      Dessin.anneau(pile, sx, sy, RAYON_SATELLITE, 1, choisi ? accent : Palette.voile(Palette.VIOLET, survol ? 255 : 224));
      if (choisi || survol) {
         Dessin.anneau(pile, sx, sy, RAYON_SATELLITE + 3, 1, Palette.voile(accent, choisi ? 112 : 64));
      }
      if (part > 0.0F) {
         Dessin.arc(pile, sx, sy, 11, 2, accent, -90.0F, 360.0F * Math.min(1.0F, part));
      }
      if (objet != null) {
         Dessin.objet(objet, sx - 8, sy - 8);
      }
      int maxLabel = Math.abs(sx - cx) < 25 ? 100 : (sous == null ? 88 : 64);
      int couleurNom = choisi || survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE;
      List<String> lignes = sous == null ? couper(nom, maxLabel, 2) : List.of(Dessin.tronquer(nom, maxLabel));
      int ly = sy < cy ? sy - 12 - lignes.size() * 10 - (sous != null ? 10 : 0) : sy + 16;
      for (String ligne : lignes) {
         Dessin.texteCentre(pile, ligne, sx, ly, couleurNom);
         ly += 10;
      }
      if (sous != null) {
         Dessin.texteCentre(pile, sous, sx, ly, choisi ? accent : Palette.voile(Palette.VIOLET, 255));
      }
   }

   public static double[] anglesRepartis(int n) {
      double[] a = new double[n];
      for (int i = 0; i < n; i++) {
         a[i] = -90.0 + i * (360.0 / n);
      }
      return a;
   }

   /** Quatre positions cardinales au plus : chaque nom garde une vraie place. */
   public static double[] anglesCardinaux(int n) {
      return switch (Math.max(1, Math.min(4, n))) {
         case 1 -> new double[]{-90.0};
         case 2 -> new double[]{180.0, 0.0};
         case 3 -> new double[]{-90.0, 0.0, 180.0};
         default -> new double[]{-90.0, 0.0, 90.0, 180.0};
      };
   }

   // --- colonne de droite ----------------------------------------------------

   public static void filetColonne(PoseStack pile) {
      int x = X_COLONNE - 12;
      for (int y = MARGE + 24; y < HAUTEUR - MARGE - 14; y += 2) {
         Dessin.rect(pile, x, y, 1, 1, Palette.voile(Palette.VIOLET, 176));
      }
   }

   public static int titreColonne(PoseStack pile, int y, String t) {
      if (y > BAS_COLONNE) {
         return y;
      }
      Dessin.texte(pile, Dessin.tronquer(t, L_COLONNE), X_COLONNE, y, Palette.AMBRE_CHAUD);
      Dessin.trait(pile, X_COLONNE, y + 11, L_COLONNE, Palette.voile(Palette.VIOLET, 192));
      return y + 19;
   }

   public static int ligneColonne(PoseStack pile, int y, String lab, String val, int couleur) {
      if (y > BAS_COLONNE) {
         return y;
      }
      Dessin.texte(pile, lab, X_COLONNE, y, Palette.TEXTE_FAIBLE);
      int place = L_COLONNE - Dessin.largeur(lab) - 8;
      Dessin.texteDroite(pile, Dessin.tronquer(val, place), X_COLONNE + L_COLONNE, y, couleur);
      Dessin.trait(pile, X_COLONNE, y + 12, L_COLONNE, Palette.voile(Palette.VIOLET, 96));
      return y + 17;
   }

   public static int paragrapheColonne(PoseStack pile, int y, String t, int couleur, int maxLignes) {
      for (String ligne : couper(t, L_COLONNE, maxLignes)) {
         if (y > BAS_COLONNE) {
            break;
         }
         Dessin.texte(pile, ligne, X_COLONNE, y, couleur);
         y += 10;
      }
      return y + 2;
   }

   // --- divers ---------------------------------------------------------------

   /** Le lien « ‹ retour » en haut à gauche. Retourne vrai s'il est survolé. */
   public static boolean retour(Contexte c, Runnable action) {
      boolean survol = c.zone(BORD, MARGE + 20, 48, 12, action);
      Dessin.texte(c.pile, "‹ " + Txt.t("ui.retour"), BORD, MARGE + 22, survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE);
      return survol;
   }

   /** Un petit bouton texte encadré. Retourne vrai s'il est survolé. */
   public static boolean bouton(Contexte c, int x, int y, String texte, int accent, Runnable action) {
      int l = Dessin.largeur(texte) + 12;
      boolean survol = c.zone(x, y, l, 14, action);
      Dessin.carteMate(c.pile, x, y, l, 14, Palette.voile(Palette.NUIT, 192), survol ? accent : Palette.voile(accent, 128));
      Dessin.texteCentre(c.pile, texte, x + l / 2, y + 3, survol ? accent : Palette.voile(accent, 224));
      return survol;
   }

   public static int largeurBouton(String texte) {
      return Dessin.largeur(texte) + 12;
   }

   /** Coupe un texte en lignes qui tiennent dans {@code largeur}, au plus {@code maxLignes}. */
   public static List<String> couper(String t, int largeur, int maxLignes) {
      List<String> out = new ArrayList<>();
      if (t == null || t.isBlank()) {
         return out;
      }
      StringBuilder ligne = new StringBuilder();
      for (String mot : t.split(" ")) {
         String essai = ligne.length() == 0 ? mot : ligne + " " + mot;
         if (Dessin.largeur(essai) > largeur && ligne.length() > 0) {
            if (out.size() >= maxLignes - 1) {
               out.add(Dessin.tronquer(ligne + " " + mot + "…", largeur));
               return out;
            }
            out.add(ligne.toString());
            ligne = new StringBuilder(mot);
         } else {
            ligne = new StringBuilder(essai);
         }
      }
      if (ligne.length() > 0) {
         out.add(ligne.toString());
      }
      return out;
   }
}
