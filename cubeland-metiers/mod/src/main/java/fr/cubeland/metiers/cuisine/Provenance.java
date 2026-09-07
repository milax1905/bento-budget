package fr.cubeland.metiers.cuisine;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.inventory.AbstractContainerMenu;

/**
 * D'où vient un plat qui apparaît dans un inventaire.
 *
 * <p>La règle du jeu : un plat compte quand il sort d'un atelier. Les trois
 * façons de le savoir, sans dépendre des mods de cuisine :</p>
 * <ul>
 *   <li>l'événement de fabrication ou de cuisson de Forge (établi, four, fumoir) ;</li>
 *   <li>un menu de cuisine ouvert, ou fermé il y a moins de deux secondes
 *       (marmite, bouilloire, tonneau…) ;</li>
 *   <li>un objet ramassé au sol à moins de trois blocs d'un poste (planche à
 *       découper, feu de camp, poêle).</li>
 * </ul>
 * <p>Tout le reste, coffre, échange, commande d'administration, est marqué
 * « ailleurs » : le plat garde son effet à la qualité minimale, mais il n'entre
 * pas au carnet et ne rapporte rien.</p>
 */
public final class Provenance {
   public static final String ATELIER = "atelier";
   public static final String AILLEURS = "ailleurs";

   /** Menus de cuisine, reconnus au nom de leur classe. */
   private static final String[] MENUS = new String[]{
      "furnace", "smoker", "blast", "cookingpot", "cooking_pot", "skillet", "kettle", "keg", "stove", "oven", "grill", "fermenter", "brewing"
   };
   private static final long DELAI_TICKS = 40L;

   private static final Map<UUID, Long> derniereProduction = new ConcurrentHashMap<>();

   private Provenance() {
   }

   /** Note qu'un joueur vient de produire quelque chose (fabrication, cuisson, fermeture d'un menu de cuisine). */
   public static void noterProduction(ServerPlayer joueur) {
      derniereProduction.put(joueur.getUUID(), joueur.level.getGameTime());
   }

   public static void oublier(UUID joueur) {
      derniereProduction.remove(joueur);
   }

   public static boolean menuDeCuisine(AbstractContainerMenu menu) {
      if (menu == null) {
         return false;
      }
      String nom = menu.getClass().getName().toLowerCase(Locale.ROOT);
      for (String m : MENUS) {
         if (nom.contains(m)) {
            return true;
         }
      }
      return false;
   }

   /** L'origine la plus probable d'un plat qui vient d'apparaître dans l'inventaire de ce joueur. */
   public static String origineProbable(ServerPlayer joueur) {
      if (menuDeCuisine(joueur.containerMenu)) {
         return ATELIER;
      }
      Long t = derniereProduction.get(joueur.getUUID());
      return t != null && joueur.level.getGameTime() - t <= DELAI_TICKS ? ATELIER : AILLEURS;
   }
}
