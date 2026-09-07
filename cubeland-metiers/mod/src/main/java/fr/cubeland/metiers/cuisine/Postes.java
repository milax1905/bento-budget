package fr.cubeland.metiers.cuisine;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraftforge.registries.ForgeRegistries;

public final class Postes {
   private static final Map<UUID, Long> derniereFois = new ConcurrentHashMap<>();
   private static final String[] MOTS = new String[]{
      "cooking_pot",
      "cutting_board",
      "stove",
      "skillet",
      "kettle",
      "cauldron",
      "campfire",
      "furnace",
      "smoker",
      "grill",
      "oven",
      "keg",
      "fermenter",
      "brewing",
      "churn",
      "cooking",
      "kitchen"
   };

   private Postes() {
   }

   public static boolean estUnPoste(BlockState etat) {
      if (etat == null) {
         return false;
      } else {
         ResourceLocation rl = ForgeRegistries.BLOCKS.getKey(etat.getBlock());
         if (rl == null) {
            return false;
         } else {
            String id = rl.getPath().toLowerCase(Locale.ROOT);

            for (String m : MOTS) {
               if (id.contains(m)) {
                  return true;
               }
            }

            return false;
         }
      }
   }

   public static void toucher(UUID joueur) {
      derniereFois.put(joueur, System.currentTimeMillis());
   }

   public static boolean recemment(UUID joueur, int secondes) {
      Long t = derniereFois.get(joueur);
      return t != null && System.currentTimeMillis() - t <= (long)secondes * 1000L;
   }

   public static void oublier(UUID joueur) {
      derniereFois.remove(joueur);
   }
}
