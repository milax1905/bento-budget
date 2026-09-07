package fr.cubeland.metiers.cuisine;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;
import com.google.gson.reflect.TypeToken;
import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Progression;
import fr.cubeland.metiers.Reglages;
import java.io.IOException;
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
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

/**
 * Le catalogue des plats.
 *
 * <p>Le serveur le lit dans {@code config/cubeland-metiers/plats.json} (recopié
 * depuis le jar la première fois) et l'envoie aux joueurs à la connexion. Le
 * client ne lit aucun fichier : il reçoit la même liste et construit les mêmes
 * tables.</p>
 */
public final class Catalogue {
   private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
   private static final Type TYPE_LISTE = new TypeToken<List<Ligne>>() {}.getType();
   private static final Path FICHIER = Paths.get("config", "cubeland-metiers", "plats.json");
   private static final String RESSOURCE = "/data/cubelandmetiers/plats.json";

   private static List<Ligne> lignes = List.of();
   private static Map<Item, Plat> parObjet = Map.of();
   private static Map<String, Plat> parId = Map.of();
   private static Map<Item, String> ateliers = Map.of();
   private static List<Plat> tous = List.of();
   private static int ignores;

   private Catalogue() {
   }

   // --- chargement (serveur) ------------------------------------------------

   public static void charger() {
      construire(lire());
      CubelandMetiers.LOG.info("Catalogue cuisine : {} plats chargés, {} ignorés (objet absent).", tous.size(), ignores);
   }

   private static List<Ligne> lire() {
      try {
         if (Files.exists(FICHIER)) {
            try (Reader r = Files.newBufferedReader(FICHIER, StandardCharsets.UTF_8)) {
               List<Ligne> l = GSON.fromJson(r, TYPE_LISTE);
               if (l != null && !l.isEmpty()) {
                  return l;
               }
            }
         }
      } catch (JsonSyntaxException | IOException e) {
         CubelandMetiers.LOG.error("plats.json illisible : {}", e.toString());
         mettreDeCote();
      }
      List<Ligne> livre = lireLivre();
      ecrireSiAbsent(livre);
      return livre;
   }

   private static void mettreDeCote() {
      try {
         Path casse = FICHIER.resolveSibling("plats.json.casse");
         Files.deleteIfExists(casse);
         Files.move(FICHIER, casse);
         CubelandMetiers.LOG.warn("Ancien plats.json mis de côté dans {}. Un catalogue neuf va être écrit.", casse.getFileName());
      } catch (IOException e) {
         CubelandMetiers.LOG.error("Impossible de mettre plats.json de côté : {}", e.toString());
      }
   }

   private static List<Ligne> lireLivre() {
      try (InputStream in = Catalogue.class.getResourceAsStream(RESSOURCE)) {
         if (in == null) {
            return List.of();
         }
         List<Ligne> l = GSON.fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), TYPE_LISTE);
         return l == null ? List.of() : l;
      } catch (JsonSyntaxException | IOException e) {
         CubelandMetiers.LOG.error("Catalogue livré illisible : {}", e.toString());
         return List.of();
      }
   }

   private static void ecrireSiAbsent(List<Ligne> l) {
      if (l.isEmpty() || Files.exists(FICHIER)) {
         return;
      }
      try {
         Files.createDirectories(FICHIER.getParent());
         try (Writer w = Files.newBufferedWriter(FICHIER, StandardCharsets.UTF_8)) {
            GSON.toJson(l, w);
         }
      } catch (IOException e) {
         CubelandMetiers.LOG.warn("Catalogue non recopié dans config : {}", e.toString());
      }
   }

   // --- synchronisation -----------------------------------------------------

   /** Les lignes du catalogue en JSON, pour le paquet de synchronisation. */
   public static String exporter() {
      return GSON.toJson(lignes, TYPE_LISTE);
   }

   /** Côté client : adopte le catalogue reçu du serveur. */
   public static void appliquerDistant(String json) {
      try {
         List<Ligne> l = GSON.fromJson(json, TYPE_LISTE);
         construire(l == null ? List.of() : l);
      } catch (JsonSyntaxException e) {
         CubelandMetiers.LOG.warn("Catalogue reçu illisible : {}", e.toString());
      }
   }

   // --- construction des tables ---------------------------------------------

   static void construire(List<Ligne> source) {
      Map<Item, Plat> table = new HashMap<>();
      Map<String, Plat> ids = new HashMap<>();
      List<Plat> liste = new ArrayList<>();
      List<Ligne> gardees = new ArrayList<>();
      int perdus = 0;
      for (Ligne l : source) {
         if (l == null || l.id == null) {
            continue;
         }
         ResourceLocation rl = ResourceLocation.tryParse(l.id);
         Item item = rl == null ? null : ForgeRegistries.ITEMS.getValue(rl);
         if (rl == null || item == null || !ForgeRegistries.ITEMS.containsKey(rl)) {
            perdus++;
            continue;
         }
         String poste = l.poste == null || l.poste.isBlank() ? "fourneau" : l.poste;
         int palier = Math.max(Reglages.get().palierDuPoste(poste), Progression.bornerPalier(l.pal));
         ResourceLocation variante = l.variante_de == null || l.variante_de.isBlank() ? null : ResourceLocation.tryParse(l.variante_de);
         Plat p = new Plat(rl, item, Famille.par(l.fam), poste, palier, Math.max(0, l.val), variante);
         table.put(item, p);
         ids.put(p.id(), p);
         liste.add(p);
         gardees.add(l);
      }
      liste.sort(Comparator.comparingInt(Plat::palier).thenComparing(p -> p.famille().id()).thenComparing(Plat::id));
      lignes = List.copyOf(gardees);
      parObjet = Map.copyOf(table);
      parId = Map.copyOf(ids);
      tous = List.copyOf(liste);
      ignores = perdus;
   }

   /** Les types de recette relevés au démarrage du serveur, pour dire où chaque plat se prépare. */
   public static void relierAuxRecettes(Map<Item, String> index) {
      ateliers = Map.copyOf(index);
      int trouves = 0;
      for (Item i : parObjet.keySet()) {
         if (ateliers.containsKey(i)) {
            trouves++;
         }
      }
      CubelandMetiers.LOG.info("Ateliers relevés dans les recettes : {} plats sur {}.", trouves, parObjet.size());
   }

   // --- consultation --------------------------------------------------------

   public static String atelierDe(Plat p) {
      if (p == null) {
         return "";
      }
      String t = ateliers.get(p.item());
      return t == null ? "" : t;
   }

   public static Plat de(ItemStack pile) {
      return pile != null && !pile.isEmpty() ? parObjet.get(pile.getItem()) : null;
   }

   public static Plat de(Item item) {
      return item == null ? null : parObjet.get(item);
   }

   public static Plat parId(String id) {
      return id == null ? null : parId.get(id);
   }

   public static boolean estUnPlat(ItemStack pile) {
      return de(pile) != null;
   }

   /** Tous les plats, triés par palier, famille puis identifiant. */
   public static List<Plat> tous() {
      return tous;
   }

   public static int nombre() {
      return tous.size();
   }

   public static int ignores() {
      return ignores;
   }

   public static boolean pret() {
      return !tous.isEmpty();
   }

   /** L'identifiant de recette (le plat, ou celui dont il est une variante) pour un identifiant d'objet. */
   public static String recetteDe(String id) {
      Plat p = parId.get(id);
      return p == null ? id : p.recette();
   }

   /** Le plat « principal » d'une recette : celui qui n'est la variante de rien. */
   public static Plat principal(String recette) {
      Plat p = parId.get(recette);
      return p;
   }

   /** Nombre de recettes différentes (les variantes ne comptent qu'une fois) au plus à ce palier. */
   public static int recettesJusquA(int palier) {
      return (int) tous.stream().filter(p -> p.variante() == null && p.palier() <= palier).count();
   }

   public static List<Plat> duPalier(int palier) {
      List<Plat> l = new ArrayList<>();
      for (Plat p : tous) {
         if (p.palier() == palier) {
            l.add(p);
         }
      }
      return l;
   }

   /** Une ligne du fichier plats.json. */
   public static final class Ligne {
      public String id;
      public String nom;
      public String fam;
      public String poste;
      public int pal;
      public int val;
      public String variante_de;
   }
}
