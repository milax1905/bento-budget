package fr.cubeland.metiers.cuisine;

import java.util.Locale;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraftforge.registries.ForgeRegistries;

/** Les blocs qui sont des postes de cuisine, reconnus à leur nom. */
public final class Postes {
   private static final String[] MOTS = new String[]{
      "cooking_pot", "cutting_board", "stove", "skillet", "kettle", "campfire", "furnace", "smoker",
      "grill", "oven", "keg", "fermenter", "churn", "cooking", "kitchen"
   };
   /** Distance (en blocs) à laquelle un objet ramassé est considéré comme sorti d'un poste. */
   public static final int PORTEE = 3;

   private Postes() {
   }

   public static boolean estUnPoste(BlockState etat) {
      if (etat == null) {
         return false;
      }
      ResourceLocation rl = ForgeRegistries.BLOCKS.getKey(etat.getBlock());
      if (rl == null) {
         return false;
      }
      String id = rl.getPath().toLowerCase(Locale.ROOT);
      for (String m : MOTS) {
         if (id.contains(m)) {
            return true;
         }
      }
      return false;
   }

   /** Vrai s'il y a un poste de cuisine à moins de {@link #PORTEE} blocs de cette position. */
   public static boolean pres(Level monde, BlockPos centre) {
      if (monde == null || centre == null) {
         return false;
      }
      BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
      for (int dx = -PORTEE; dx <= PORTEE; dx++) {
         for (int dy = -2; dy <= 2; dy++) {
            for (int dz = -PORTEE; dz <= PORTEE; dz++) {
               p.set(centre.getX() + dx, centre.getY() + dy, centre.getZ() + dz);
               if (estUnPoste(monde.getBlockState(p))) {
                  return true;
               }
            }
         }
      }
      return false;
   }
}
