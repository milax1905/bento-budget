package fr.cubeland.metiers;

/**
 * Les mathématiques des niveaux et des paliers, sans Minecraft.
 *
 * <p>Tout ce qui se calcule à partir d'un nombre (XP, recettes) vit ici pour
 * pouvoir être testé en JUnit pur. {@link Reglages} délègue à cette classe.</p>
 */
public final class Progression {
   public static final int PALIER_MAX = 5;

   private Progression() {
   }

   /** XP totale exigée pour atteindre {@code niveau} (0 pour le niveau 0). */
   public static long seuil(long xpBase, int niveau) {
      return niveau <= 0 ? 0L : xpBase * niveau * niveau;
   }

   /** Niveau atteint avec {@code xp}, borné par {@code niveauMax}. */
   public static int niveauPour(long xpBase, int niveauMax, long xp) {
      int n = 0;
      while (n < niveauMax && xp >= seuil(xpBase, n + 1)) {
         n++;
      }
      return n;
   }

   /** Part (0 à 1) du chemin parcouru vers le niveau suivant. */
   public static float progression(long xpBase, int niveauMax, long xp) {
      int n = niveauPour(xpBase, niveauMax, xp);
      if (n >= niveauMax) {
         return 1.0F;
      }
      long bas = seuil(xpBase, n);
      long haut = seuil(xpBase, n + 1);
      if (haut <= bas) {
         return 1.0F;
      }
      return borner((float) (xp - bas) / (float) (haut - bas));
   }

   /** Palier de cuisine (1 à 5) pour un nombre de recettes différentes. */
   public static int palierPour(int[] seuilsRecettes, int recettes) {
      int p = 1;
      for (int i = 1; i < seuilsRecettes.length && i < PALIER_MAX; i++) {
         if (recettes >= seuilsRecettes[i]) {
            p = i + 1;
         }
      }
      return p;
   }

   /** Rang d'un métier, de 0 (rien) à 5 (légende), proportionnel au niveau maximum. */
   public static int rang(int niveau, int niveauMax) {
      if (niveauMax <= 0 || niveau <= 0) {
         return 0;
      }
      int pourcent = niveau * 100 / niveauMax;
      if (pourcent >= 100) {
         return 5;
      }
      if (pourcent >= 70) {
         return 4;
      }
      if (pourcent >= 40) {
         return 3;
      }
      if (pourcent >= 20) {
         return 2;
      }
      return pourcent >= 10 ? 1 : 0;
   }

   public static int bornerPalier(int palier) {
      return Math.max(1, Math.min(PALIER_MAX, palier));
   }

   public static float borner(float part) {
      return Math.max(0.0F, Math.min(1.0F, part));
   }
}
