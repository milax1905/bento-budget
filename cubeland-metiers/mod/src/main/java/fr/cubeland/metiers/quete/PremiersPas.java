package fr.cubeland.metiers.quete;

/**
 * Les cinq premiers pas, faits une seule fois par joueur.
 *
 * <p>Tant qu'ils ne sont pas finis, le carnet les montre à la place des
 * commandes. Chaque étape se valide toute seule en jouant.</p>
 */
public final class PremiersPas {
   /** Cliquer un poste de cuisine. */
   public static final int POSTE = 0;
   /** Cuisiner n'importe quel plat. */
   public static final int FOURNEE = 1;
   /** Manger un plat qu'on a cuisiné. */
   public static final int GOUTER = 2;
   /** Vendre un plat à la boutique. */
   public static final int VENDRE = 3;
   /** Remplir une première commande de livraison, facile. */
   public static final int LIVRER = 4;
   /** Tout est fait. */
   public static final int FINI = 5;

   private PremiersPas() {
   }

   public static boolean finis(int etape) {
      return etape >= FINI;
   }

   public static int borner(int etape) {
      return Math.max(POSTE, Math.min(FINI, etape));
   }
}
