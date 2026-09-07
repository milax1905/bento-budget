package fr.cubeland.metiers.client;

import fr.cubeland.metiers.cuisine.Famille;
import fr.cubeland.metiers.quete.TypeQuete;

/** Les couleurs du panneau : nuit, violet, ambre, jade, ciel. Toutes en ARGB. */
public final class Palette {
   public static final int NUIT = 0xFF12101E;
   public static final int CARTE = 0xFF241834;
   public static final int CARTE_HAUT = 0xFF2E1F42;
   public static final int VIOLET = 0xFF4A2E55;
   public static final int AMBRE = 0xFFFFB25E;
   public static final int AMBRE_CHAUD = 0xFFF08B3C;
   public static final int AMBRE_CLAIR = 0xFFFFC981;
   public static final int TEXTE = 0xFFF3EAE2;
   public static final int TEXTE_DOUX = 0xFFB5A3B6;
   public static final int TEXTE_FAIBLE = 0xFF7E6E85;
   public static final int JADE = 0xFF6FBF8E;
   public static final int CIEL = 0xFF6FBFC7;
   public static final int ROUGE = 0xFFFF6047;
   public static final int ROSE = 0xFFE86A7B;
   public static final int VOILE = 0xC012101E;

   private Palette() {
   }

   public static int famille(Famille f) {
      return f == null ? TEXTE_DOUX : 0xFF000000 | f.couleur();
   }

   public static int famille(String id) {
      return famille(Famille.par(id));
   }

   public static int qualite(int q) {
      return switch (q) {
         case 2 -> TEXTE;
         case 3 -> JADE;
         case 4 -> CIEL;
         case 5 -> AMBRE;
         default -> TEXTE_DOUX;
      };
   }

   public static int quete(TypeQuete type) {
      return switch (type) {
         case DECOUVERTE -> CIEL;
         case LIVRAISON -> AMBRE;
         case MAITRISE -> JADE;
      };
   }

   /** La même couleur avec cet alpha (0 à 255). */
   public static int voile(int couleur, int alpha) {
      return couleur & 0xFFFFFF | (alpha & 0xFF) << 24;
   }
}
