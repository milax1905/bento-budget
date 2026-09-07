package fr.cubeland.metiers.client;

public final class Palette {
   public static final int NUIT = -15594722;
   public static final int CARTE = -14411724;
   public static final int CARTE_HAUT = -13754302;
   public static final int VIOLET = -11916715;
   public static final int AMBRE = -19874;
   public static final int AMBRE_CHAUD = -1013188;
   public static final int AMBRE_CLAIR = -13951;
   public static final int TEXTE = -791838;
   public static final int TEXTE_DOUX = -4873290;
   public static final int TEXTE_FAIBLE = -8491387;
   public static final int JADE = -9453682;
   public static final int CIEL = -9453625;
   public static final int ROUGE = -40889;
   public static final int ROSE = -1545861;
   public static final int VOILE = -1072559330;

   private Palette() {
   }

   public static int famille(String id) {
      return switch (id) {
         case "feculent" -> -1523590;
         case "viande" -> -1545861;
         case "poisson" -> -9453625;
         case "soupe" -> -1013188;
         case "legume" -> -9453682;
         case "dessert" -> -3695640;
         case "boisson" -> -4879761;
         default -> -4873290;
      };
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

   public static int voile(int couleur, int alpha) {
      return couleur & 16777215 | (alpha & 0xFF) << 24;
   }
}
