package fr.cubeland.metiers.client;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

public final class Ateliers {
   private Ateliers() {
   }

   public static String nom(String type) {
      if (type == null) {
         return "quelque part";
      } else {
         String t = type.toLowerCase(Locale.ROOT);
         switch (t) {
            case "fourneau":
               return "au fourneau";
            case "planche":
               return "sur la planche a decouper";
            case "poele":
               return "a la poele";
            case "marmite":
               return "dans la marmite";
            case "bouilloire":
               return "a la bouilloire";
            case "nether":
               return "dans le nether";
         }

         if (t.startsWith("minecraft:crafting")) {
            return "a l'etabli";
         } else if (t.equals("minecraft:smelting")) {
            return "au four";
         } else if (t.equals("minecraft:smoking")) {
            return "au fumoir";
         } else if (t.equals("minecraft:blasting")) {
            return "au haut fourneau";
         } else if (t.equals("minecraft:campfire_cooking")) {
            return "au feu de camp";
         } else if (t.equals("minecraft:stonecutting")) {
            return "a la scie";
         } else if (t.contains("cutting")) {
            return "sur la planche a decouper";
         } else if (t.contains("cooking")) {
            return "dans la marmite";
         } else if (t.contains("brewing") || t.contains("kettle")) {
            return "a la bouilloire";
         } else if (t.contains("skillet") || t.contains("pan")) {
            return "a la poele";
         } else if (t.contains("fermenting") || t.contains("keg")) {
            return "au tonneau";
         } else if (!t.contains("smelting") && !t.contains("furnace")) {
            int p = t.indexOf(58);
            return (p >= 0 ? t.substring(p + 1) : t).replace('_', ' ');
         } else {
            return "au four";
         }
      }
   }

   /** Nom court du bloc, pour le titre "LE POSTE". */
   public static String bloc(String type) {
      String t = type == null ? "" : type.toLowerCase(Locale.ROOT);
      if (t.contains("cutting") || t.equals("planche")) {
         return "planche a decouper";
      } else if (t.contains("skillet") || t.contains("pan") || t.equals("poele")) {
         return "poele";
      } else if (t.contains("kettle") || t.contains("brewing") || t.equals("bouilloire")) {
         return "bouilloire";
      } else if (t.contains("campfire")) {
         return "feu de camp";
      } else if (t.contains("smoker") || t.equals("minecraft:smoking")) {
         return "fumoir";
      } else if (t.contains("blast")) {
         return "haut fourneau";
      } else if (t.contains("smelting") || t.contains("furnace") || t.equals("fourneau")) {
         return "four / fourneau";
      } else if (t.contains("crafting") || t.contains("etabli")) {
         return "etabli";
      } else if (t.contains("keg") || t.contains("ferment")) {
         return "tonneau";
      } else if (t.contains("nether")) {
         return "poste du nether";
      } else if (t.contains("cooking") || t.contains("marmite") || t.equals("marmite")) {
         return "marmite";
      } else {
         return nom(type).replaceFirst("^au |^a la |^a l'|dans la |dans le |sur la ", "");
      }
   }

   /**
    * Gestes concrets pour fabriquer le plat a cet atelier.
    * Textes courts : la colonne de la fiche fait ~160 px.
    */
   public static List<String> gestes(String type) {
      List<String> g = new ArrayList<>();
      String t = type == null ? "" : type.toLowerCase(Locale.ROOT);
      if (t.contains("cutting") || t.equals("planche")) {
         g.add("Pose une planche a decouper.");
         g.add("Clic-droit : pose l'ingredient, puis coupe avec un couteau.");
         g.add("Recupere le resultat sur la planche.");
      } else if (t.contains("skillet") || t.contains("pan") || t.equals("poele")) {
         g.add("Pose une poele sur un fourneau ou un feu.");
         g.add("Clic-droit, mets les ingredients, attends qu'ils dorent.");
         g.add("Prends le plat dans la poele.");
      } else if (t.contains("kettle") || t.contains("brewing") || t.equals("bouilloire")) {
         g.add("Place la bouilloire pres d'une source de chaleur.");
         g.add("Clic-droit, verse les ingredients, attends l'infusion.");
         g.add("Recupere la boisson.");
      } else if (t.contains("campfire")) {
         g.add("Allume un feu de camp.");
         g.add("Clic-droit avec l'ingredient pour le poser dessus.");
         g.add("Attends, puis reclic pour recuperer le plat.");
      } else if (t.contains("smoker") || t.equals("minecraft:smoking")) {
         g.add("Ouvre un fumoir, mets du combustible.");
         g.add("Place l'ingredient dans le haut, attends.");
         g.add("Recupere le plat fume.");
      } else if (t.contains("blast")) {
         g.add("Ouvre un haut fourneau, mets du combustible.");
         g.add("Place l'ingredient, attends, recupere.");
      } else if (t.contains("smelting") || t.contains("furnace") || t.equals("fourneau")) {
         g.add("Ouvre un four, mets du combustible en bas.");
         g.add("Place l'ingredient en haut, attends la cuisson.");
         g.add("Recupere le plat dans le slot de droite.");
      } else if (t.contains("crafting")) {
         g.add("Ouvre un etabli (ou l'inventaire 2x2 si ca tient).");
         g.add("Place les ingredients comme sur le schema a gauche.");
         g.add("Prends le resultat dans le slot de craft.");
      } else if (t.contains("keg") || t.contains("ferment")) {
         g.add("Ouvre le tonneau, mets les ingredients.");
         g.add("Attends la fermentation, puis tire le plat.");
      } else if (t.contains("nether")) {
         g.add("Il se prepare dans le Nether, a l'atelier indique.");
         g.add("Mets les ingredients, attends, recupere le plat.");
      } else if (t.contains("cooking") || t.contains("marmite") || t.equals("marmite")) {
         g.add("Pose une marmite sur un fourneau.");
         g.add("Clic-droit, mets les ingredients (bol si besoin).");
         g.add("Attends, prends le plat, reclic le poste (carnet + XP).");
      } else {
         g.add("Fais cuire le plat " + nom(type) + ".");
         g.add("Clic-droit l'atelier, mets les ingredients, attends.");
         g.add("Recupere le resultat.");
      }

      boolean deja = false;
      for (String s : g) {
         if (s.contains("carnet")) {
            deja = true;
            break;
         }
      }
      if (!deja) {
         g.add("Reclic le poste : carnet + XP + qualite.");
      }

      return g;
   }

   public static String objet(String id) {
      ResourceLocation rl = ResourceLocation.tryParse(id);
      if (rl == null) {
         return id;
      } else {
         Item item = (Item)ForgeRegistries.ITEMS.getValue(rl);
         return item == null ? rl.getPath().replace('_', ' ') : new ItemStack(item).getHoverName().getString();
      }
   }

   public static String effet(MobEffect e) {
      if (e == null) {
         return "";
      } else if (e == MobEffects.DIG_SPEED) {
         return "Hate";
      } else if (e == MobEffects.NIGHT_VISION) {
         return "Vision nocturne";
      } else if (e == MobEffects.DAMAGE_BOOST) {
         return "Force";
      } else if (e == MobEffects.FIRE_RESISTANCE) {
         return "Resistance au feu";
      } else if (e == MobEffects.MOVEMENT_SPEED) {
         return "Vitesse";
      } else if (e == MobEffects.WATER_BREATHING) {
         return "Respiration";
      } else if (e == MobEffects.SATURATION) {
         return "Saturation";
      } else if (e == MobEffects.REGENERATION) {
         return "Regeneration";
      } else if (e == MobEffects.DAMAGE_RESISTANCE) {
         return "Resistance";
      } else if (e == MobEffects.ABSORPTION) {
         return "Absorption";
      } else if (e == MobEffects.LUCK) {
         return "Chance";
      } else if (e == MobEffects.JUMP) {
         return "Saut";
      } else {
         return e.getDisplayName().getString();
      }
   }
}
