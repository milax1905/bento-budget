package fr.cubeland.metiers.metier;

import fr.cubeland.metiers.Progression;
import fr.cubeland.metiers.Reglages;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.network.chat.Component;

/** La table des six métiers. */
public final class Metiers {
   private static final Map<String, Metier> TABLE = new LinkedHashMap<>();

   static {
      ajouter(new Metier(Metier.MINEUR, "minecraft:iron_pickaxe", List.of("mineur_minerai", "mineur_pierre")));
      ajouter(new Metier(Metier.BUCHERON, "minecraft:iron_axe", List.of("bucheron_buche")));
      ajouter(new Metier(Metier.FERMIER, "minecraft:iron_hoe", List.of("fermier_recolte")));
      ajouter(new Metier(Metier.CHASSEUR, "minecraft:bow", List.of("chasseur_tuerie")));
      ajouter(new Metier(Metier.PECHEUR, "minecraft:fishing_rod", List.of("pecheur_prise")));
      ajouter(new Metier(Metier.CUISINIER, "farmersdelight:cooking_pot", List.of()));
   }

   private Metiers() {
   }

   private static void ajouter(Metier m) {
      TABLE.put(m.id(), m);
   }

   public static List<String> tous() {
      return List.copyOf(TABLE.keySet());
   }

   public static Metier de(String id) {
      return TABLE.get(id);
   }

   public static boolean existe(String id) {
      return TABLE.containsKey(id);
   }

   public static Component nom(String id) {
      Metier m = TABLE.get(id);
      return m == null ? Component.literal(id) : m.nom();
   }

   public static String embleme(String id) {
      Metier m = TABLE.get(id);
      return m == null ? "minecraft:barrier" : m.embleme();
   }

   /**
    * Le titre porté à ce niveau (« Apprenti mineur », « Légende de la pêche »),
    * ou un composant vide en dessous du premier rang.
    */
   public static Component titre(String id, int niveau) {
      int rang = Progression.rang(niveau, Reglages.get().niveauMax);
      if (rang <= 0) {
         return Component.empty();
      }
      return Component.translatable("cubelandmetiers.rang." + rang, nom(id));
   }

   public static boolean aUnTitre(String id, int niveau) {
      return Progression.rang(niveau, Reglages.get().niveauMax) > 0;
   }
}
