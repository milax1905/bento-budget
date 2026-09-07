package fr.cubeland.metiers.cuisine;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Reglages;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.Writer;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

public final class Catalogue {
   private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
   private static final Path FICHIER = Paths.get("config", "cubeland-metiers", "plats.json");
   private static Map<Item, Plat> parObjet = Map.of();
   private static Map<Item, String> ateliers = Map.of();
   private static List<Plat> tous = List.of();
   private static int ignores;

   private Catalogue() {
   }

   public static void charger() {
      List<Catalogue.Ligne> lignes = lire();
      Map<Item, Plat> table = new HashMap<>();
      List<Plat> liste = new ArrayList<>();
      int perdus = 0;

      for (Catalogue.Ligne l : lignes) {
         if (l != null && l.id != null) {
            ResourceLocation rl = ResourceLocation.tryParse(l.id);
            if (rl == null) {
               perdus++;
            } else {
               Item item = (Item)ForgeRegistries.ITEMS.getValue(rl);
               if (item != null && ForgeRegistries.ITEMS.containsKey(rl)) {
                  int plancher = Reglages.get().palierDuPoste(l.poste == null ? "fourneau" : l.poste);
                  int palier = Math.max(plancher, Math.max(1, Math.min(5, l.pal)));
                  Plat p = new Plat(
                     rl, l.nom == null ? rl.getPath() : l.nom, Famille.par(l.fam), l.poste == null ? "fourneau" : l.poste, palier, Math.max(0, l.val)
                  );
                  table.put(item, p);
                  liste.add(p);
               } else {
                  perdus++;
               }
            }
         }
      }

      parObjet = Map.copyOf(table);
      tous = List.copyOf(liste);
      ignores = perdus;
      CubelandMetiers.LOG.info("Catalogue cuisine : {} plats charges, {} ignores (objet absent).", tous.size(), ignores);
   }

   private static List<Catalogue.Ligne> lire() {
      Type type = (new TypeToken<List<Catalogue.Ligne>>() {
      }).getType();

      try {
         if (Files.exists(FICHIER)) {
            try (Reader r = Files.newBufferedReader(FICHIER, StandardCharsets.UTF_8)) {
               List<Catalogue.Ligne> l = (List<Catalogue.Ligne>)GSON.fromJson(r, type);
               if (l != null && !l.isEmpty()) {
                  return l;
               }
            }
         }
      } catch (Exception var10) {
         CubelandMetiers.LOG.error("plats.json illisible : {}", var10.toString());

         try {
            Path casse = FICHIER.resolveSibling("plats.json.casse");
            Files.deleteIfExists(casse);
            Files.move(FICHIER, casse);
            CubelandMetiers.LOG.warn("Ancien plats.json mis de cote dans {}. Un catalogue neuf va etre ecrit.", casse.getFileName());
         } catch (Exception var5) {
            CubelandMetiers.LOG.error("Impossible de mettre plats.json de cote : {}", var5.toString());
         }
      }

      try {
         List var3;
         try (InputStream in = Catalogue.class.getResourceAsStream("/data/cubelandmetiers/plats.json")) {
            if (in == null) {
               return List.of();
            }

            List<Catalogue.Ligne> l = (List<Catalogue.Ligne>)GSON.fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), type);
            ecrireSiAbsent(l);
            var3 = l == null ? List.of() : l;
         }

         return var3;
      } catch (Exception var8) {
         CubelandMetiers.LOG.error("Catalogue livre illisible : {}", var8.toString());
         return List.of();
      }
   }

   private static void ecrireSiAbsent(List<Catalogue.Ligne> l) {
      if (l != null && !Files.exists(FICHIER)) {
         try {
            Files.createDirectories(FICHIER.getParent());

            try (Writer w = Files.newBufferedWriter(FICHIER, StandardCharsets.UTF_8)) {
               GSON.toJson(l, w);
            }
         } catch (Exception var6) {
            CubelandMetiers.LOG.warn("Catalogue non recopie dans config : {}", var6.toString());
         }
      }
   }

   public static void relierAuxRecettes(Map<Item, String> index) {
      ateliers = Map.copyOf(index);
      int trouves = 0;

      for (Item i : parObjet.keySet()) {
         if (ateliers.containsKey(i)) {
            trouves++;
         }
      }

      CubelandMetiers.LOG.info("Ateliers releves dans les recettes : {} plats sur {}.", trouves, parObjet.size());
   }

   public static String atelierDe(Plat p) {
      if (p == null) {
         return "";
      } else {
         Item i = (Item)ForgeRegistries.ITEMS.getValue(p.objet());
         String t = i == null ? null : ateliers.get(i);
         return t == null ? "" : t;
      }
   }

   public static Plat de(ItemStack pile) {
      return pile != null && !pile.isEmpty() ? parObjet.get(pile.getItem()) : null;
   }

   public static Plat de(Item item) {
      return item == null ? null : parObjet.get(item);
   }

   public static boolean estUnPlat(ItemStack pile) {
      return de(pile) != null;
   }

   public static List<Plat> tous() {
      return tous;
   }

   public static int nombre() {
      return tous.size();
   }

   public static int ignores() {
      return ignores;
   }

   public static Plat parId(String id) {
      for (Plat p : tous) {
         if (p.objet().toString().equals(id)) {
            return p;
         }
      }

      return null;
   }

   public static List<Plat> duPalier(int palier) {
      List<Plat> l = new ArrayList<>();

      for (Plat p : tous) {
         if (p.palier() == palier) {
            l.add(p);
         }
      }

      Collections.sort(l, (a, b) -> a.nom().compareToIgnoreCase(b.nom()));
      return l;
   }

   private static final class Ligne {
      String id;
      String nom;
      String fam;
      String poste;
      int pal;
      int val;
   }
}
