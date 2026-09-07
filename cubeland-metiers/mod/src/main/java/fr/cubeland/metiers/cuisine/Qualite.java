package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.Reglages;
import java.util.Random;
import net.minecraft.ChatFormatting;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;

/**
 * La marque posée sur chaque plat : qualité, palier, auteur, provenance.
 *
 * <p>Stockée dans le NBT {@code CubelandCuisine} de l'objet. Un plat non marqué
 * est un plat que le serveur n'a pas encore vu passer.</p>
 */
public final class Qualite {
   public static final String CLE = "CubelandCuisine";
   private static final String CLE_QUALITE = "qualite";
   private static final String CLE_PALIER = "palier";
   private static final String CLE_AUTEUR = "auteur";
   private static final String CLE_HORS = "horsPalier";
   private static final String CLE_ORIGINE = "origine";
   private static final Random HASARD = new Random();

   public static final int MIN = 1;
   public static final int MAX = 5;
   public static final int SIGNATURE = 5;

   private static final ChatFormatting[] COULEURS = new ChatFormatting[]{
      ChatFormatting.GRAY, ChatFormatting.WHITE, ChatFormatting.GREEN, ChatFormatting.AQUA, ChatFormatting.GOLD
   };

   private Qualite() {
   }

   public static Component nom(int q) {
      return Component.translatable("cubelandmetiers.qualite." + borne(q));
   }

   public static ChatFormatting couleur(int q) {
      return COULEURS[borne(q) - 1];
   }

   public static int borne(int q) {
      return Math.max(MIN, Math.min(MAX, q));
   }

   /** Tire une qualité pour un cuisinier de ce palier, aidé par ce couteau. */
   public static int tirer(int palierCuisinier, int palierCouteau) {
      int[] table = Reglages.get().probabilites[Math.max(0, Math.min(4, palierCuisinier - 1))];
      return Tirage.qualite(HASARD, table, Couteaux.bonusQualite(palierCouteau));
   }

   public static boolean marque(ItemStack pile) {
      if (pile == null || pile.isEmpty()) {
         return false;
      }
      CompoundTag t = pile.getTagElement(CLE);
      return t != null && t.contains(CLE_QUALITE);
   }

   private static CompoundTag lire(ItemStack pile) {
      return marque(pile) ? pile.getTagElement(CLE) : null;
   }

   public static int de(ItemStack pile) {
      CompoundTag t = lire(pile);
      return t == null ? 0 : borne(t.getInt(CLE_QUALITE));
   }

   public static int palierDe(ItemStack pile) {
      CompoundTag t = lire(pile);
      return t == null ? 0 : t.getInt(CLE_PALIER);
   }

   public static boolean horsPalier(ItemStack pile) {
      CompoundTag t = lire(pile);
      return t != null && t.getBoolean(CLE_HORS);
   }

   public static String auteur(ItemStack pile) {
      CompoundTag t = lire(pile);
      return t == null ? "" : t.getString(CLE_AUTEUR);
   }

   /** Vrai si le plat est sorti d'un atelier de son auteur, faux s'il vient d'ailleurs. */
   public static boolean cuisine(ItemStack pile) {
      CompoundTag t = lire(pile);
      return t != null && Provenance.ATELIER.equals(t.getString(CLE_ORIGINE));
   }

   public static boolean estDe(ItemStack pile, String nomJoueur) {
      return nomJoueur != null && !nomJoueur.isEmpty() && nomJoueur.equals(auteur(pile));
   }

   public static void poser(ItemStack pile, int qualite, int palier, String auteur, boolean hors, String origine) {
      if (pile == null || pile.isEmpty()) {
         return;
      }
      CompoundTag t = pile.getOrCreateTagElement(CLE);
      t.putInt(CLE_QUALITE, borne(qualite));
      t.putInt(CLE_PALIER, palier);
      t.putBoolean(CLE_HORS, hors);
      t.putString(CLE_ORIGINE, origine);
      if (auteur != null && !auteur.isEmpty()) {
         t.putString(CLE_AUTEUR, auteur);
      } else {
         t.remove(CLE_AUTEUR);
      }
   }

   public static long prix(Plat plat, int qualite) {
      return plat == null ? 0L : Tirage.prix(plat.valeur(), Reglages.get().multiplicateurs, borne(qualite));
   }

   /** Durée de l'effet en secondes. */
   public static int dureeEffet(int qualite) {
      int[] d = Reglages.get().dureeEffet;
      return d[Math.max(0, Math.min(d.length - 1, borne(qualite) - 1))];
   }

   public static String etoiles(int q) {
      StringBuilder b = new StringBuilder();
      for (int i = 0; i < MAX; i++) {
         b.append(i < q ? '★' : '☆');
      }
      return b.toString();
   }

   public static String etoilesPleines(int q) {
      StringBuilder b = new StringBuilder();
      for (int i = 0; i < Math.max(0, Math.min(MAX, q)); i++) {
         b.append('★');
      }
      return b.toString();
   }
}
