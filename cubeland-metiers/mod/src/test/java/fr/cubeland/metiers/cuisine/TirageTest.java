package fr.cubeland.metiers.cuisine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Random;
import org.junit.jupiter.api.Test;

class TirageTest {
   private static final double[] MULT = new double[]{1.0, 1.4, 2.2, 3.2, 4.5};

   @Test
   void uneTableVideDonneLaQualiteMinimale() {
      assertEquals(1, Tirage.qualite(new Random(1), new int[]{0, 0, 0, 0, 0}, 0));
   }

   @Test
   void uneTableCertaineDonneToujoursLaMemeQualite() {
      Random r = new Random(42);
      for (int i = 0; i < 200; i++) {
         assertEquals(3, Tirage.qualite(r, new int[]{0, 0, 100, 0, 0}, 0));
      }
   }

   @Test
   void leBonusDuCouteauMonteDunCranAuPlus() {
      Random r = new Random(7);
      for (int i = 0; i < 200; i++) {
         int q = Tirage.qualite(r, new int[]{0, 0, 100, 0, 0}, 100);
         assertEquals(4, q);
      }
      // jamais au-dessus de 5
      for (int i = 0; i < 200; i++) {
         assertEquals(5, Tirage.qualite(r, new int[]{0, 0, 0, 0, 100}, 100));
      }
   }

   @Test
   void laRepartitionSuitLesChances() {
      Random r = new Random(2026);
      int[] table = new int[]{70, 25, 5, 0, 0};
      int[] compte = new int[6];
      int n = 20000;
      for (int i = 0; i < n; i++) {
         compte[Tirage.qualite(r, table, 0)]++;
      }
      assertTrue(Math.abs(compte[1] / (double) n - 0.70) < 0.02, "ordinaire " + compte[1]);
      assertTrue(Math.abs(compte[2] / (double) n - 0.25) < 0.02, "soigné " + compte[2]);
      assertTrue(Math.abs(compte[3] / (double) n - 0.05) < 0.01, "de qualité " + compte[3]);
      assertEquals(0, compte[4] + compte[5]);
   }

   @Test
   void lePrixSuitLeMultiplicateurEtNeDescendJamaisSousUn() {
      assertEquals(60L, Tirage.prix(60, MULT, 1));
      assertEquals(84L, Tirage.prix(60, MULT, 2));
      assertEquals(270L, Tirage.prix(60, MULT, 5));
      assertEquals(1L, Tirage.prix(0, MULT, 3));
      assertEquals(60L, Tirage.prix(60, MULT, -4));
      assertEquals(270L, Tirage.prix(60, MULT, 99));
   }
}
