package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.Reglages;
import java.util.Locale;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

public final class Couteaux {
   private Couteaux() {
   }

   public static int palierDe(ItemStack pile) {
      if (pile != null && !pile.isEmpty()) {
         ResourceLocation rl = ForgeRegistries.ITEMS.getKey(pile.getItem());
         if (rl == null) {
            return 0;
         } else {
            String id = rl.getPath().toLowerCase(Locale.ROOT);
            if (!id.contains("knife")) {
               return 0;
            } else if (contient(id, "neptunium")) {
               return 5;
            } else if (contient(
               id, "netherite", "adamantite", "adamantium", "allthemodium", "vibranium", "unobtainium", "alf", "star", "dragon", "cosmic", "infinity"
            )) {
               return 4;
            } else if (contient(id, "diamond", "emerald", "amethyst", "opal", "crystal", "gold", "golden", "rose_gold", "platinum", "silver")) {
               return 3;
            } else {
               return contient(id, "iron", "steel", "brass", "bronze", "copper", "constantan", "invar", "electrum", "tin", "zinc", "lead", "nickel") ? 2 : 1;
            }
         }
      } else {
         return 0;
      }
   }

   private static boolean contient(String id, String... mots) {
      for (String m : mots) {
         if (id.contains(m)) {
            return true;
         }
      }

      return false;
   }

   public static int palierDuJoueur(Player joueur) {
      if (joueur == null) {
         return 0;
      } else {
         int meilleur = 0;

         for (ItemStack pile : joueur.getInventory().items) {
            int p = palierDe(pile);
            if (p > meilleur) {
               meilleur = p;
            }
         }

         for (ItemStack pilex : joueur.getInventory().offhand) {
            int p = palierDe(pilex);
            if (p > meilleur) {
               meilleur = p;
            }
         }

         return meilleur;
      }
   }

   public static int bonusQualite(int palier) {
      if (palier <= 0) {
         return 0;
      } else {
         int[] t = Reglages.get().couteauQualite;
         return t[Math.min(t.length - 1, palier - 1)];
      }
   }

   public static int gainDeTemps(int palier) {
      if (palier <= 0) {
         return 0;
      } else {
         int[] t = Reglages.get().couteauTemps;
         return t[Math.min(t.length - 1, palier - 1)];
      }
   }
}
