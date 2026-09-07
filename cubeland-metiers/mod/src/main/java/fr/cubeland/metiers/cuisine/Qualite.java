package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.Reglages;
import java.util.Random;
import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.item.ItemStack;

public final class Qualite {
   public static final String CLE = "CubelandCuisine";
   private static final String CLE_QUALITE = "qualite";
   private static final String CLE_PALIER = "palier";
   private static final String CLE_AUTEUR = "auteur";
   private static final String CLE_HORS = "horsPalier";
   private static final Random HASARD = new Random();
   public static final String[] NOMS = new String[]{"Ordinaire", "Soigne", "De qualite", "De maitre", "Signature"};
   private static final ChatFormatting[] COULEURS = new ChatFormatting[]{
      ChatFormatting.GRAY, ChatFormatting.WHITE, ChatFormatting.GREEN, ChatFormatting.AQUA, ChatFormatting.GOLD
   };

   private Qualite() {
   }

   public static String nom(int q) {
      return NOMS[borne(q) - 1];
   }

   public static ChatFormatting couleur(int q) {
      return COULEURS[borne(q) - 1];
   }

   public static int borne(int q) {
      return Math.max(1, Math.min(5, q));
   }

   public static int tirer(int palierCuisinier, int palierCouteau) {
      int[] table = Reglages.get().probabilites[Math.max(0, Math.min(4, palierCuisinier - 1))];
      int total = 0;

      for (int v : table) {
         total += Math.max(0, v);
      }

      if (total <= 0) {
         return 1;
      } else {
         int tire = HASARD.nextInt(total);
         int q = 1;
         int cumul = 0;

         for (int i = 0; i < table.length; i++) {
            cumul += Math.max(0, table[i]);
            if (tire < cumul) {
               q = i + 1;
               break;
            }
         }

         int bonus = Couteaux.bonusQualite(palierCouteau);
         if (bonus > 0 && q < 5 && HASARD.nextInt(100) < bonus) {
            q++;
         }

         return q;
      }
   }

   public static boolean marque(ItemStack pile) {
      return pile != null && !pile.isEmpty() && pile.getTagElement("CubelandCuisine") != null && pile.getTagElement("CubelandCuisine").contains("qualite");
   }

   public static int de(ItemStack pile) {
      return !marque(pile) ? 0 : borne(pile.getTagElement("CubelandCuisine").getInt("qualite"));
   }

   public static int palierDe(ItemStack pile) {
      return !marque(pile) ? 0 : pile.getTagElement("CubelandCuisine").getInt("palier");
   }

   public static boolean horsPalier(ItemStack pile) {
      return marque(pile) && pile.getTagElement("CubelandCuisine").getBoolean("horsPalier");
   }

   public static String auteur(ItemStack pile) {
      return !marque(pile) ? "" : pile.getTagElement("CubelandCuisine").getString("auteur");
   }

   public static void poser(ItemStack pile, int qualite, int palier, String auteur, boolean hors) {
      if (pile != null && !pile.isEmpty()) {
         CompoundTag t = pile.getOrCreateTagElement("CubelandCuisine");
         t.putInt("qualite", borne(qualite));
         t.putInt("palier", palier);
         t.putBoolean("horsPalier", hors);
         if (auteur != null && !auteur.isEmpty()) {
            t.putString("auteur", auteur);
         }
      }
   }

   public static long prix(Plat plat, int qualite) {
      if (plat == null) {
         return 0L;
      } else {
         double[] m = Reglages.get().multiplicateurs;
         double mult = m[Math.max(0, Math.min(m.length - 1, borne(qualite) - 1))];
         return Math.max(1L, Math.round((double)plat.valeur() * mult));
      }
   }

   public static int dureeEffet(int qualite) {
      int[] d = Reglages.get().dureeEffet;
      return d[Math.max(0, Math.min(d.length - 1, borne(qualite) - 1))];
   }
}
