package fr.cubeland.metiers.cuisine;

import java.util.Random;

/** Le tirage au sort d'une qualité, sans Minecraft, pour pouvoir le tester. */
public final class Tirage {
   private Tirage() {
   }

   /**
    * Tire une qualité de 1 à 5 selon une table de chances, puis tente une
    * montée d'un cran avec {@code bonusPourcent} de chances.
    */
   public static int qualite(Random hasard, int[] table, int bonusPourcent) {
      int total = 0;
      for (int v : table) {
         total += Math.max(0, v);
      }
      int q = 1;
      if (total > 0) {
         int tire = hasard.nextInt(total);
         int cumul = 0;
         for (int i = 0; i < table.length; i++) {
            cumul += Math.max(0, table[i]);
            if (tire < cumul) {
               q = i + 1;
               break;
            }
         }
      }
      if (bonusPourcent > 0 && q < 5 && hasard.nextInt(100) < bonusPourcent) {
         q++;
      }
      return q;
   }

   /** Prix d'un plat : valeur de base × multiplicateur de qualité, jamais moins de 1. */
   public static long prix(int valeur, double[] multiplicateurs, int qualite) {
      int i = Math.max(0, Math.min(multiplicateurs.length - 1, qualite - 1));
      return Math.max(1L, Math.round(valeur * multiplicateurs[i]));
   }
}
