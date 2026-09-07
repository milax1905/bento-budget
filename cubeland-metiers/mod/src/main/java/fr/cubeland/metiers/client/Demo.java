package fr.cubeland.metiers.client;

import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.cuisine.Recettes;
import fr.cubeland.metiers.metier.Metiers;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetFiche;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.event.TickEvent.ClientTickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

/**
 * Mode demo pour regarder les ecrans sans serveur : lance le jeu avec
 * -Dcubeland.demo=true et le panneau se remplit de donnees factices des le
 * menu titre (touche J impossible ici : ouvre-le avec -Dcubeland.demo.ecran=0,
 * 1 ou 2, ou via la redirection ci-dessous). Sans la propriete, ce fichier ne
 * fait strictement rien : aucun effet en jeu normal.
 */
public final class Demo {
   public static final boolean ACTIF = Boolean.getBoolean("cubeland.demo");
   private static final int ECRAN = Integer.getInteger("cubeland.demo.ecran", -1);
   private static final String FICHE = System.getProperty("cubeland.demo.fiche", "");
   private static boolean fait;

   private Demo() {
   }

   public static boolean horsLigne() {
      return ACTIF && Minecraft.getInstance().getConnection() == null;
   }

   // Sert une fiche factice quand on est en demo hors ligne ; sinon laisse
   // l'ecran demander au serveur comme d'habitude.
   public static boolean fiche(String id) {
      if (!horsLigne()) {
         return false;
      } else {
         Map<String, Integer> ing = new LinkedHashMap<>();
         String type = "minecraft:smelting";
         List<String> utileA = List.of();
         switch (id) {
            case "minecraft:rabbit_stew":
               type = "farmersdelight:cooking";
               ing.put("minecraft:cooked_rabbit", 1);
               ing.put("minecraft:carrot", 1);
               ing.put("minecraft:baked_potato", 1);
               ing.put("minecraft:brown_mushroom", 1);
               ing.put("minecraft:bowl", 1);
               break;
            case "farmersdelight:dumplings":
               type = "farmersdelight:cooking";
               ing.put("minecraft:wheat", 1);
               ing.put("minecraft:carrot", 1);
               ing.put("minecraft:potato", 1);
               ing.put("minecraft:chicken", 1);
               break;
            case "minecraft:mushroom_stew":
               type = "farmersdelight:cooking";
               ing.put("minecraft:brown_mushroom", 1);
               ing.put("minecraft:red_mushroom", 1);
               ing.put("minecraft:bowl", 1);
               break;
            case "minecraft:beetroot_soup":
               type = "farmersdelight:cooking";
               ing.put("minecraft:beetroot", 6);
               ing.put("minecraft:bowl", 1);
               break;
            case "minecraft:pumpkin_pie":
               type = "minecraft:crafting";
               ing.put("minecraft:pumpkin", 1);
               ing.put("minecraft:sugar", 1);
               ing.put("minecraft:egg", 1);
               break;
            case "minecraft:suspicious_stew":
               type = "minecraft:crafting";
               ing.put("minecraft:red_mushroom", 1);
               ing.put("minecraft:brown_mushroom", 1);
               ing.put("minecraft:bowl", 1);
               ing.put("minecraft:oxeye_daisy", 1);
               break;
            case "minecraft:golden_apple":
               type = "minecraft:crafting";
               ing.put("minecraft:apple", 1);
               ing.put("minecraft:gold_ingot", 8);
               break;
            case "minecraft:bread":
               type = "minecraft:crafting";
               ing.put("minecraft:wheat", 3);
               break;
            case "minecraft:baked_potato":
               ing.put("minecraft:potato", 1);
               utileA = List.of("minecraft:rabbit_stew");
               break;
            case "minecraft:cookie":
               type = "minecraft:crafting";
               ing.put("minecraft:wheat", 2);
               ing.put("minecraft:cocoa_beans", 1);
               break;
            case "minecraft:honey_bottle":
               type = "cuisine:kettle";
               ing.put("minecraft:honeycomb", 2);
               ing.put("minecraft:glass_bottle", 1);
               break;
            case "minecraft:golden_carrot":
               type = "minecraft:crafting";
               ing.put("minecraft:carrot", 1);
               ing.put("minecraft:gold_nugget", 8);
               break;
            default:
               ing.put("minecraft:" + (id.contains("cod") || id.contains("salmon") ? id.substring(id.indexOf(58) + 1).replace("cooked_", "") : "beef"), 1);
         }

         Recettes.Facon facon = new Recettes.Facon(type, new ArrayList<>(ing.keySet()), new ArrayList<>(ing.values()), 1);
         EtatClient.recevoirFiche(new PaquetFiche(id, List.of(facon), utileA));
         return true;
      }
   }

   private static void injecter() {
      Reglages r = Reglages.get();
      List<String> ids = Metiers.tous();
      int[] niveaux = new int[]{23, 11, 17, 8, 14, 19};
      List<Integer> niv = new ArrayList<>();
      List<Long> xps = new ArrayList<>();

      for (int i = 0; i < ids.size(); i++) {
         int n = niveaux[i % niveaux.length];
         niv.add(n);
         xps.add(r.seuil(n) + (r.seuil(n + 1) - r.seuil(n)) / 3L);
      }

      List<PaquetCuisine.Ligne> lignes = new ArrayList<>();
      ligne(lignes, "farmersdelight:dumplings", "Dumplings", "feculent", "marmite", 1, 25, false, 0);
      ligne(lignes, "minecraft:bread", "Pain de campagne", "feculent", "fourneau", 1, 25, true, 19);
      ligne(lignes, "minecraft:baked_potato", "Pomme de terre au four", "legume", "fourneau", 1, 22, true, 12);
      ligne(lignes, "minecraft:cookie", "Cookie aux pepites", "dessert", "fourneau", 1, 20, true, 7);
      ligne(lignes, "minecraft:cooked_chicken", "Poulet roti aux herbes", "viande", "fourneau", 1, 28, true, 9);
      ligne(lignes, "minecraft:cooked_cod", "Cabillaud grille", "poisson", "fourneau", 1, 26, true, 4);
      ligne(lignes, "minecraft:cooked_porkchop", "Cotelette grillee", "viande", "fourneau", 1, 30, false, 0);
      ligne(lignes, "minecraft:dried_kelp", "Algue sechee croustillante", "legume", "planche", 1, 12, true, 2);
      ligne(lignes, "minecraft:cooked_salmon", "Saumon poele au beurre", "poisson", "poele", 2, 32, true, 6);
      ligne(lignes, "minecraft:cooked_mutton", "Gigot d'agneau dore", "viande", "poele", 2, 34, true, 3);
      ligne(lignes, "minecraft:pumpkin_pie", "Tarte au potiron de grand-mere", "dessert", "poele", 2, 36, true, 5);
      ligne(lignes, "minecraft:cooked_rabbit", "Lapin saisi au thym", "viande", "poele", 2, 33, false, 0);
      ligne(lignes, "minecraft:melon_slice", "Granite de pasteque", "dessert", "poele", 2, 18, false, 0);
      ligne(lignes, "minecraft:mushroom_stew", "Veloute des sous-bois", "soupe", "marmite", 3, 40, true, 8);
      ligne(lignes, "minecraft:rabbit_stew", "Civet de lapin mijote", "soupe", "marmite", 3, 48, true, 17);
      ligne(lignes, "minecraft:beetroot_soup", "Potage de betterave", "soupe", "marmite", 3, 38, true, 1);
      ligne(lignes, "minecraft:cooked_beef", "Boeuf mijote longuement", "viande", "marmite", 3, 45, false, 0);
      ligne(lignes, "minecraft:sweet_berries", "Confiture de baies", "dessert", "marmite", 3, 30, false, 0);
      ligne(lignes, "minecraft:honey_bottle", "Hydromel doux epice", "boisson", "bouilloire", 4, 55, true, 2);
      ligne(lignes, "minecraft:suspicious_stew", "Bouillon du mysterieux", "soupe", "bouilloire", 4, 60, false, 0);
      ligne(lignes, "minecraft:golden_carrot", "Carotte glacee au miel", "legume", "bouilloire", 4, 52, false, 0);
      ligne(lignes, "minecraft:golden_apple", "Pomme des dieux", "dessert", "nether", 5, 90, false, 0);
      ligne(lignes, "minecraft:glow_berries", "Baies lumineuses confites", "dessert", "nether", 5, 75, false, 0);
      int recettes = 0;
      int fournees = 0;

      for (PaquetCuisine.Ligne l : lignes) {
         if (l.connue()) {
            recettes++;
            fournees += l.fois();
         }
      }

      int palier = r.palierPour(recettes);
      int seuil = palier >= 5 ? 0 : r.palierRecettes[palier];
      List<PaquetCuisine.Compte> familles = new ArrayList<>();

      for (String fam : new String[]{"feculent", "viande", "poisson", "soupe", "legume", "dessert", "boisson"}) {
         int connues = 0;
         int total = 0;

         for (PaquetCuisine.Ligne l : lignes) {
            if (l.famille().equals(fam) && l.palier() <= palier) {
               total++;
               if (l.connue()) {
                  connues++;
               }
            }
         }

         if (total > 0) {
            familles.add(new PaquetCuisine.Compte(fam, connues, total));
         }
      }

      List<PaquetCuisine.Compte> parPalier = new ArrayList<>();

      for (int p = 1; p <= 5; p++) {
         int connues = 0;
         int total = 0;

         for (PaquetCuisine.Ligne l : lignes) {
            if (l.palier() == p) {
               total++;
               if (l.connue()) {
                  connues++;
               }
            }
         }

         parPalier.add(new PaquetCuisine.Compte(String.valueOf(p), connues, total));
      }

      List<PaquetCuisine.Idee> idees = new ArrayList<>();

      for (PaquetCuisine.Ligne l : lignes) {
         if (!l.connue() && l.palier() <= palier && idees.size() < 6) {
            idees.add(new PaquetCuisine.Idee(l.id(), l.nom(), l.famille(), l.poste(), l.valeur()));
         }
      }

      String poste = "";

      for (Map.Entry<String, Integer> e : r.postes.entrySet()) {
         if (e.getValue() != null && e.getValue() == palier + 1) {
            poste = e.getKey();
            break;
         }
      }

      EtatClient.recevoir(new PaquetEtat(new ArrayList<>(ids), niv, xps, palier, recettes, seuil, lignes.size(), 0L));
      EtatClient.recevoirCuisine(
         new PaquetCuisine(
            palier,
            recettes,
            seuil,
            r.palierNom[palier - 1],
            r.palierGeste[palier - 1],
            palier >= 5 ? "" : r.palierRecompense[palier],
            poste,
            familles,
            idees,
            1,
            lignes,
            parPalier,
            (int[])r.probabilites[Math.max(0, Math.min(4, palier - 1))].clone(),
            new int[]{34, 21, 11, 4, 1},
            fournees,
            "Civet de lapin mijote",
            17
         )
      );
   }

   private static void ligne(List<PaquetCuisine.Ligne> out, String id, String nom, String fam, String poste, int pal, int val, boolean connue, int fois) {
      double[] m = Reglages.get().multiplicateurs;
      long[] prix = new long[5];

      for (int q = 0; q < 5; q++) {
         prix[q] = Math.max(1L, Math.round((double)val * m[Math.min(m.length - 1, q)]));
      }

      out.add(new PaquetCuisine.Ligne(id, nom, fam, poste, val, connue, fois, pal, prix));
   }

   @EventBusSubscriber(
      modid = "cubelandmetiers",
      value = {Dist.CLIENT}
   )
   public static final class Ecoute {
      private Ecoute() {
      }

      @SubscribeEvent
      public static void tic(ClientTickEvent e) {
         tenterOuverture("tic");
      }

      @SubscribeEvent
      public static void rendu(ScreenEvent.Render.Post e) {
         if (e.getScreen() instanceof TitleScreen) {
            tenterOuverture("rendu");
         }
      }

      @SubscribeEvent
      public static void init(ScreenEvent.Init.Post e) {
         if (!Demo.ACTIF || !(e.getScreen() instanceof TitleScreen)) {
            return;
         }

         if (!Demo.fait) {
            try {
               Demo.injecter();
               Demo.fait = true;
            } catch (Exception ex) {
               CubelandMetiers.LOG.error("Demo : injection impossible", ex);
            }
         }

         int x = e.getScreen().width / 2 - 100;
         int y = e.getScreen().height / 4 + 48 + 96 + 12;
         e.addListener(
            new Button(x, y, 200, 20, Component.literal("Metiers (demo)"), btn -> {
               Minecraft.getInstance()
                  .setScreen(Demo.FICHE.isBlank() ? new EcranMetiers(Math.max(0, Demo.ECRAN)) : new EcranMetiers(2, Demo.FICHE));
            })
         );
         tenterOuverture("init");
      }

      private static void tenterOuverture(String depuis) {
         if (!Demo.ACTIF || Demo.ECRAN < 0) {
            return;
         }

         Minecraft mc = Minecraft.getInstance();
         if (!(mc.screen instanceof TitleScreen)) {
            return;
         }

         try {
            if (!Demo.fait) {
               Demo.injecter();
               Demo.fait = true;
               Files.writeString(Path.of("run/demo-ouvert.txt"), depuis, StandardCharsets.UTF_8);
               CubelandMetiers.LOG.info("Demo : donnees factices injectees ({})", depuis);
            }

            mc.setScreen(Demo.FICHE.isBlank() ? new EcranMetiers(Demo.ECRAN) : new EcranMetiers(2, Demo.FICHE));
         } catch (Exception ex) {
            CubelandMetiers.LOG.error("Demo : impossible d'ouvrir le panneau", ex);
         }
      }
   }
}
