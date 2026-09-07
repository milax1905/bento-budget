package fr.cubeland.metiers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ProgressionTest {
   private static final long XP_BASE = 120L;
   private static final int NIVEAU_MAX = 50;
   private static final int[] SEUILS = new int[]{0, 4, 10, 18, 28};

   @Test
   void leSeuilSuitLeCarreDuNiveau() {
      assertEquals(0L, Progression.seuil(XP_BASE, 0));
      assertEquals(120L, Progression.seuil(XP_BASE, 1));
      assertEquals(480L, Progression.seuil(XP_BASE, 2));
      assertEquals(120L * 50 * 50, Progression.seuil(XP_BASE, 50));
   }

   @Test
   void leNiveauEstBorneParLeMaximum() {
      assertEquals(0, Progression.niveauPour(XP_BASE, NIVEAU_MAX, 0L));
      assertEquals(0, Progression.niveauPour(XP_BASE, NIVEAU_MAX, 119L));
      assertEquals(1, Progression.niveauPour(XP_BASE, NIVEAU_MAX, 120L));
      assertEquals(2, Progression.niveauPour(XP_BASE, NIVEAU_MAX, 480L));
      assertEquals(NIVEAU_MAX, Progression.niveauPour(XP_BASE, NIVEAU_MAX, Long.MAX_VALUE / 4));
   }

   @Test
   void laProgressionVaDeZeroAUn() {
      assertEquals(0.0F, Progression.progression(XP_BASE, NIVEAU_MAX, 120L), 1e-6);
      assertEquals(0.5F, Progression.progression(XP_BASE, NIVEAU_MAX, 300L), 1e-6);
      assertEquals(1.0F, Progression.progression(XP_BASE, NIVEAU_MAX, Progression.seuil(XP_BASE, NIVEAU_MAX)), 1e-6);
   }

   @Test
   void lePalierSuitLesSeuilsDeRecettes() {
      assertEquals(1, Progression.palierPour(SEUILS, 0));
      assertEquals(1, Progression.palierPour(SEUILS, 3));
      assertEquals(2, Progression.palierPour(SEUILS, 4));
      assertEquals(3, Progression.palierPour(SEUILS, 10));
      assertEquals(4, Progression.palierPour(SEUILS, 27));
      assertEquals(5, Progression.palierPour(SEUILS, 28));
      assertEquals(5, Progression.palierPour(SEUILS, 500));
   }

   @Test
   void leRangEstProportionnelAuNiveauMaximum() {
      assertEquals(0, Progression.rang(0, 50));
      assertEquals(0, Progression.rang(4, 50));
      assertEquals(1, Progression.rang(5, 50));
      assertEquals(2, Progression.rang(10, 50));
      assertEquals(3, Progression.rang(20, 50));
      assertEquals(4, Progression.rang(35, 50));
      assertEquals(5, Progression.rang(50, 50));
      // avec un niveau maximum de 100, les mêmes rangs arrivent deux fois plus tard
      assertEquals(1, Progression.rang(10, 100));
      assertEquals(5, Progression.rang(100, 100));
   }

   @Test
   void lesBornesTiennent() {
      assertEquals(1, Progression.bornerPalier(-3));
      assertEquals(5, Progression.bornerPalier(9));
      assertTrue(Progression.borner(2.0F) <= 1.0F);
      assertTrue(Progression.borner(-2.0F) >= 0.0F);
   }
}
