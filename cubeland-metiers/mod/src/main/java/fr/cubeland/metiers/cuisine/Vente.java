package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.metier.PontBoutique;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;

/**
 * La vente des plats à la boutique.
 *
 * <p>Une vente se fait en deux temps : on compte, on encaisse, et seulement si
 * la boutique a crédité on retire les plats. Si la boutique ne répond pas, rien
 * ne bouge dans l'inventaire.</p>
 */
public final class Vente {
   private Vente() {
   }

   /** Le résultat d'une vente : nombre de plats, brut, commission, net. */
   public record Bilan(int plats, long brut, long commission, long net) {
      public static final Bilan RIEN = new Bilan(0, 0L, 0L, 0L);
   }

   public static boolean vendable(ItemStack pile) {
      return Catalogue.estUnPlat(pile) && !Qualite.horsPalier(pile);
   }

   public static long prixDe(ItemStack pile) {
      Plat plat = Catalogue.de(pile);
      return plat == null ? 0L : Qualite.prix(plat, Math.max(1, Qualite.de(pile)));
   }

   /** Vend ces piles. Retourne {@link Bilan#RIEN} si rien n'est vendable, ou {@code null} si la boutique a refusé. */
   public static Bilan vendre(ServerPlayer joueur, List<ItemStack> piles) {
      List<ItemStack> retenues = new ArrayList<>();
      long brut = 0L;
      int plats = 0;
      for (ItemStack pile : piles) {
         if (vendable(pile)) {
            retenues.add(pile);
            brut += prixDe(pile) * pile.getCount();
            plats += pile.getCount();
         }
      }
      if (plats == 0) {
         return Bilan.RIEN;
      }
      long commission = brut * Reglages.get().commissionVente / 100L;
      long net = Math.max(0L, brut - commission);
      if (!PontBoutique.crediter(joueur.server, joueur.getUUID(), net)) {
         return null;
      }
      for (ItemStack pile : retenues) {
         pile.setCount(0);
      }
      return new Bilan(plats, brut, commission, net);
   }
}
