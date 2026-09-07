package fr.cubeland.metiers.metier;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Metiers {
   private static final Map<String, Metier> TABLE = new LinkedHashMap<>();

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

   public static String nomAffiche(String id) {
      Metier m = TABLE.get(id);
      return m == null ? id : m.nom();
   }

   public static String icone(String id) {
      Metier m = TABLE.get(id);
      return m == null ? "•" : m.icone();
   }

   public static String resume(String id) {
      Metier m = TABLE.get(id);
      return m == null ? "" : m.resume();
   }

   public static List<String[]> actions(String id) {
      Metier m = TABLE.get(id);
      return m == null ? List.of() : m.actions();
   }

   public static String titre(String id, int niveau) {
      if (niveau < 5) {
         return "";
      } else {
         String rang = niveau >= 50 ? "Legende" : (niveau >= 35 ? "Maitre" : (niveau >= 20 ? "Expert" : (niveau >= 10 ? "Confirme" : "Apprenti")));
         return rang + " " + nomAffiche(id).toLowerCase();
      }
   }

   static {
      ajouter(
         new Metier(
            "mineur",
            "Mineur",
            "⛏",
            "Casser de la pierre et des minerais.",
            List.of(new String[]{"Minerai casse", "10 a 22 XP"}, new String[]{"Pierre cassee", "1 XP"})
         )
      );
      ajouter(new Metier("bucheron", "Bucheron", "\ud83e\ude93", "Abattre des arbres.", List.<String[]>of(new String[]{"Buche coupee", "4 a 9 XP"})));
      ajouter(new Metier("fermier", "Fermier", "\ud83c\udf3e", "Recolter des cultures arrivees a maturite.", List.<String[]>of(new String[]{"Recolte", "5 a 9 XP"})));
      ajouter(new Metier("chasseur", "Chasseur", "\ud83c\udff9", "Abattre des creatures.", List.<String[]>of(new String[]{"Creature tuee", "8 XP"})));
      ajouter(new Metier("pecheur", "Pecheur", "\ud83c\udfa3", "Sortir des prises de l'eau.", List.<String[]>of(new String[]{"Prise", "12 a 28 XP"})));
      ajouter(
         new Metier(
            "cuisinier",
            "Cuisinier",
            "\ud83c\udf72",
            "Cuisiner des plats, en decouvrir de nouveaux, monter de palier.",
            List.of(new String[]{"Plat cuisine", "5 XP"}, new String[]{"Recette decouverte", "40 XP"}, new String[]{"Par cran de qualite", "15 XP"})
         )
      );
   }
}
