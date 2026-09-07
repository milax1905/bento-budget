package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.Reglages;
import java.util.Locale;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

/** Les couteaux de cuisine : leur palier se lit dans le nom de l'objet. */
public final class Couteaux {
   private static final String[][] PALIERS = new String[][]{
      {"neptunium"},
      {"netherite", "adamantite", "adamantium", "allthemodium", "vibranium", "unobtainium", "alf", "star", "dragon", "cosmic", "infinity"},
      {"diamond", "emerald", "amethyst", "opal", "crystal", "gold", "golden", "rose_gold", "platinum", "silver"},
      {"iron", "steel", "brass", "bronze", "copper", "constantan", "invar", "electrum", "tin", "zinc", "lead", "nickel"}
   };

   private Couteaux() {
   }

   /** 0 si ce n'est pas un couteau, sinon 1 (bois, silex) à 5 (neptunium). */
   public static int palierDe(ItemStack pile) {
      if (pile == null || pile.isEmpty()) {
         return 0;
      }
      ResourceLocation rl = ForgeRegistries.ITEMS.getKey(pile.getItem());
      if (rl == null) {
         return 0;
      }
      String id = rl.getPath().toLowerCase(Locale.ROOT);
      if (!id.contains("knife")) {
         return 0;
      }
      for (int i = 0; i < PALIERS.length; i++) {
         for (String mot : PALIERS[i]) {
            if (id.contains(mot)) {
               return 5 - i;
            }
         }
      }
      return 1;
   }

   /** Le meilleur couteau porté (inventaire, main secondaire). */
   public static int palierDuJoueur(Player joueur) {
      if (joueur == null) {
         return 0;
      }
      int meilleur = 0;
      for (ItemStack pile : joueur.getInventory().items) {
         meilleur = Math.max(meilleur, palierDe(pile));
      }
      for (ItemStack pile : joueur.getInventory().offhand) {
         meilleur = Math.max(meilleur, palierDe(pile));
      }
      return meilleur;
   }

   public static int bonusQualite(int palier) {
      if (palier <= 0) {
         return 0;
      }
      int[] t = Reglages.get().couteauQualite;
      return t[Math.min(t.length - 1, palier - 1)];
   }

   public static int gainDeTemps(int palier) {
      if (palier <= 0) {
         return 0;
      }
      int[] t = Reglages.get().couteauTemps;
      return t[Math.min(t.length - 1, palier - 1)];
   }
}
