package fr.cubeland.metiers.client;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

/**
 * Les ateliers de cuisine, reconnus au type de recette ou au nom du poste, et
 * décrits par les fichiers de langue : où ça se passe, quel bloc, quels gestes.
 */
public final class Ateliers {
   private Ateliers() {
   }

   /** Un atelier et la table de mots qui le reconnaît. */
   public enum Atelier {
      PLANCHE("planche", "planche", "cutting"),
      POELE("poele", "poele", "skillet", "pan"),
      MARMITE("marmite", "marmite", "cooking"),
      BOUILLOIRE("bouilloire", "bouilloire", "kettle", "brewing"),
      FEU_DE_CAMP("feu_de_camp", "campfire"),
      FUMOIR("fumoir", "smoking", "smoker"),
      HAUT_FOURNEAU("haut_fourneau", "blasting", "blast"),
      FOUR("four", "smelting", "furnace"),
      FOURNEAU("fourneau", "fourneau", "stove"),
      ETABLI("etabli", "crafting", "etabli"),
      TONNEAU("tonneau", "keg", "ferment"),
      NETHER("nether", "nether"),
      AUTRE("autre");

      private final String id;
      private final String[] mots;

      Atelier(String id, String... mots) {
         this.id = id;
         this.mots = mots;
      }

      public String id() {
         return this.id;
      }

      /** « au fourneau », « sur la planche à découper »… */
      public String nom() {
         return Txt.t("atelier." + this.id);
      }

      /** Le bloc à poser. */
      public String bloc() {
         return Txt.t("atelier." + this.id + ".bloc");
      }

      /** Les gestes, dans l'ordre. */
      public List<String> gestes() {
         List<String> g = new ArrayList<>();
         for (int i = 1; i <= 3; i++) {
            String cle = "atelier." + this.id + ".geste." + i;
            String t = Txt.t(cle);
            if (!t.isEmpty() && !t.equals("cubelandmetiers." + cle)) {
               g.add(t);
            }
         }
         return g;
      }
   }

   /** L'atelier d'un type de recette ({@code farmersdelight:cooking}) ou d'un poste ({@code marmite}). */
   public static Atelier detecter(String typeOuPoste) {
      if (typeOuPoste == null || typeOuPoste.isBlank()) {
         return Atelier.AUTRE;
      }
      String t = typeOuPoste.toLowerCase(Locale.ROOT);
      for (Atelier a : Atelier.values()) {
         for (String mot : a.mots) {
            if (t.contains(mot)) {
               return a;
            }
         }
      }
      return Atelier.AUTRE;
   }

   /** Le nom lisible d'un type inconnu : « farmersdelight:cooking » devient « cooking ». */
   public static String nomBrut(String type) {
      if (type == null) {
         return "";
      }
      int p = type.indexOf(':');
      return (p >= 0 ? type.substring(p + 1) : type).replace('_', ' ');
   }

   /** Le nom traduit d'un objet, ou son identifiant s'il n'existe pas. */
   public static String objet(String id) {
      ResourceLocation rl = ResourceLocation.tryParse(id);
      if (rl == null) {
         return id;
      }
      Item item = ForgeRegistries.ITEMS.getValue(rl);
      return item == null ? rl.getPath().replace('_', ' ') : new ItemStack(item).getHoverName().getString();
   }

   public static String effet(MobEffect e) {
      return e == null ? "" : e.getDisplayName().getString();
   }
}
