package fr.cubeland.metiers.client;

import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.ecran.EcranCubeland;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Recettes;
import fr.cubeland.metiers.metier.Metiers;
import fr.cubeland.metiers.quete.Quete;
import fr.cubeland.metiers.quete.TypeQuete;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetFiche;
import fr.cubeland.metiers.reseau.PaquetQuetes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

/**
 * Mode démo, outil de développement : remplit le panneau de données factices
 * depuis le menu titre, sans serveur.
 *
 * <p>Cette classe vit dans {@code src/demo} : elle n'est jamais dans le jar
 * livré aux joueurs. {@code ./gradlew runClient -Pdemo=1} l'active.</p>
 */
public final class Demo {
   private static final boolean ACTIF = Boolean.getBoolean("cubeland.demo");
   private static final int ECRAN = Integer.getInteger("cubeland.demo.ecran", -1);
   private static final String FICHE = System.getProperty("cubeland.demo.fiche", "");
   private static boolean fait;

   private Demo() {
   }

   private static void injecter() {
      EtatClient.activerDemo();
      Catalogue.appliquerDistant("""
         [
          {"id":"minecraft:bread","fam":"feculent","poste":"fourneau","pal":1,"val":25},
          {"id":"minecraft:baked_potato","fam":"legume","poste":"fourneau","pal":1,"val":22},
          {"id":"minecraft:cooked_chicken","fam":"viande","poste":"fourneau","pal":1,"val":28},
          {"id":"minecraft:cooked_cod","fam":"poisson","poste":"fourneau","pal":1,"val":26},
          {"id":"minecraft:cookie","fam":"dessert","poste":"planche","pal":1,"val":20},
          {"id":"minecraft:cooked_salmon","fam":"poisson","poste":"poele","pal":2,"val":32},
          {"id":"minecraft:pumpkin_pie","fam":"dessert","poste":"poele","pal":2,"val":36},
          {"id":"minecraft:cooked_mutton","fam":"viande","poste":"poele","pal":2,"val":34},
          {"id":"minecraft:mushroom_stew","fam":"soupe","poste":"marmite","pal":3,"val":40},
          {"id":"minecraft:rabbit_stew","fam":"soupe","poste":"marmite","pal":3,"val":48},
          {"id":"minecraft:beetroot_soup","fam":"soupe","poste":"marmite","pal":3,"val":38},
          {"id":"minecraft:honey_bottle","fam":"boisson","poste":"bouilloire","pal":4,"val":55},
          {"id":"minecraft:golden_carrot","fam":"legume","poste":"bouilloire","pal":4,"val":52},
          {"id":"minecraft:golden_apple","fam":"dessert","poste":"nether","pal":5,"val":90}
         ]
         """);
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
      Map<String, Integer> fournees = new LinkedHashMap<>();
      fournees.put("minecraft:bread", 19);
      fournees.put("minecraft:baked_potato", 12);
      fournees.put("minecraft:cookie", 7);
      fournees.put("minecraft:cooked_chicken", 9);
      fournees.put("minecraft:cooked_cod", 4);
      fournees.put("minecraft:cooked_salmon", 6);
      fournees.put("minecraft:pumpkin_pie", 5);
      fournees.put("minecraft:mushroom_stew", 8);
      fournees.put("minecraft:rabbit_stew", 17);
      fournees.put("minecraft:beetroot_soup", 1);
      int palier = r.palierPour(fournees.size());
      EtatClient.recevoir(new PaquetEtat(new ArrayList<>(ids), niv, xps, palier, fournees.size(), r.seuilSuivant(palier)));
      EtatClient.recevoirCuisine(new PaquetCuisine(
         palier, fournees.size(), r.seuilSuivant(palier), fournees,
         List.of("minecraft:cooked_mutton", "minecraft:honey_bottle", "minecraft:golden_carrot"),
         List.of(),
         r.probabilites[Math.max(0, Math.min(4, palier - 1))].clone(),
         new int[]{34, 21, 11, 4, 1}, 88, "minecraft:rabbit_stew", 17, 6
      ));
      EtatClient.recevoirQuetes(new PaquetQuetes(List.of(
         new Quete("d1", TypeQuete.DECOUVERTE, "famille:soupe", 2, 1, 1, r.xpCommandeDecouverte, 0L, false, 0L),
         new Quete("l1", TypeQuete.LIVRAISON, "minecraft:rabbit_stew", 6, 4, 2, r.xpCommandeLivraison, 432L, false, 0L),
         new Quete("m1", TypeQuete.MAITRISE, "qualite:4", 1, 0, 4, r.xpCommandeMaitrise, 0L, false, 0L)
      ), 5));
      EtatClient.synchronise();
   }

   private static void fiche(String id) {
      Map<String, Integer> ing = new LinkedHashMap<>();
      String type = "farmersdelight:cooking";
      switch (id) {
         case "minecraft:rabbit_stew" -> {
            ing.put("minecraft:cooked_rabbit", 1);
            ing.put("minecraft:carrot", 1);
            ing.put("minecraft:baked_potato", 1);
            ing.put("minecraft:brown_mushroom", 1);
            ing.put("minecraft:bowl", 1);
         }
         case "minecraft:pumpkin_pie" -> {
            type = "minecraft:crafting";
            ing.put("minecraft:pumpkin", 1);
            ing.put("minecraft:sugar", 1);
            ing.put("minecraft:egg", 1);
         }
         default -> {
            type = "minecraft:smelting";
            ing.put("minecraft:potato", 1);
         }
      }
      EtatClient.recevoirFiche(new PaquetFiche(id, List.of(new Recettes.Facon(type, new ArrayList<>(ing.keySet()), new ArrayList<>(ing.values()), 1)), List.of("minecraft:rabbit_stew")));
   }

   private static void ouvrir() {
      Minecraft mc = Minecraft.getInstance();
      if (FICHE.isBlank()) {
         mc.setScreen(new EcranCubeland(Math.max(0, ECRAN)));
      } else {
         fiche(FICHE);
         mc.setScreen(new EcranCubeland(EcranCubeland.ONGLET_LIVRE, FICHE));
      }
   }

   @EventBusSubscriber(modid = CubelandMetiers.MODID, value = Dist.CLIENT)
   public static final class Ecoute {
      private Ecoute() {
      }

      @SubscribeEvent
      public static void init(ScreenEvent.Init.Post e) {
         if (!ACTIF || !(e.getScreen() instanceof TitleScreen)) {
            return;
         }
         if (!fait) {
            try {
               injecter();
               fait = true;
               CubelandMetiers.LOG.info("Démo : données factices injectées.");
            } catch (Exception ex) {
               CubelandMetiers.LOG.error("Démo : injection impossible", ex);
               return;
            }
         }
         int x = e.getScreen().width / 2 - 100;
         int y = e.getScreen().height / 4 + 48 + 96 + 12;
         e.addListener(new Button(x, y, 200, 20, Component.literal("Métiers (démo)"), b -> ouvrir()));
         if (ECRAN >= 0) {
            ouvrir();
         }
      }
   }
}
