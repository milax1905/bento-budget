package fr.cubeland.metiers.cuisine;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.NonNullList;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.item.crafting.Recipe;
import net.minecraftforge.registries.ForgeRegistries;

/** Lecture des recettes du serveur, pour dire où et avec quoi un plat se prépare. */
public final class Recettes {
   private static final int MAX_FACONS = 3;
   private static final int MAX_INGREDIENTS = 9;
   private static final int MAX_UTILE_A = 8;

   private Recettes() {
   }

   /** Une façon de faire un plat : type de recette, ingrédients et quantités, rendement. */
   public record Facon(String type, List<String> ingredients, List<Integer> combien, int rendement) {
   }

   private static ItemStack sortie(Recipe<?> r) {
      try {
         ItemStack s = r.getResultItem();
         return s == null ? ItemStack.EMPTY : s;
      } catch (Throwable t) {
         return ItemStack.EMPTY;
      }
   }

   /** Pour chaque objet produit par une recette, le type de cette recette. */
   public static Map<Item, String> indexerAteliers(MinecraftServer serveur) {
      Map<Item, String> out = new HashMap<>();
      if (serveur == null) {
         return out;
      }
      for (Recipe<?> r : serveur.getRecipeManager().getRecipes()) {
         ItemStack sortie = sortie(r);
         if (sortie.isEmpty() || out.containsKey(sortie.getItem())) {
            continue;
         }
         ResourceLocation type = ForgeRegistries.RECIPE_TYPES.getKey(r.getType());
         if (type != null) {
            out.put(sortie.getItem(), type.toString());
         }
      }
      return out;
   }

   /** Les plats du catalogue dans lesquels cet objet entre comme ingrédient. */
   public static List<String> utileA(MinecraftServer serveur, Item ingredient) {
      List<String> out = new ArrayList<>();
      if (serveur == null || ingredient == null) {
         return out;
      }
      for (Recipe<?> r : serveur.getRecipeManager().getRecipes()) {
         ItemStack sortie = sortie(r);
         if (sortie.isEmpty() || sortie.getItem() == ingredient || Catalogue.de(sortie.getItem()) == null) {
            continue;
         }
         if (contient(r, ingredient)) {
            ResourceLocation id = ForgeRegistries.ITEMS.getKey(sortie.getItem());
            if (id != null && !out.contains(id.toString())) {
               out.add(id.toString());
            }
            if (out.size() >= MAX_UTILE_A) {
               break;
            }
         }
      }
      return out;
   }

   private static boolean contient(Recipe<?> r, Item ingredient) {
      try {
         for (Ingredient i : r.getIngredients()) {
            if (i == null || i.isEmpty()) {
               continue;
            }
            for (ItemStack c : i.getItems()) {
               if (c.getItem() == ingredient) {
                  return true;
               }
            }
         }
      } catch (Throwable t) {
         return false;
      }
      return false;
   }

   /** Jusqu'à trois façons de faire cet objet. */
   public static List<Facon> pour(MinecraftServer serveur, Item resultat) {
      List<Facon> out = new ArrayList<>();
      if (serveur == null || resultat == null) {
         return out;
      }
      for (Recipe<?> r : serveur.getRecipeManager().getRecipes()) {
         ItemStack sortie = sortie(r);
         if (sortie.isEmpty() || sortie.getItem() != resultat) {
            continue;
         }
         Facon f = decrire(r, sortie);
         if (f != null) {
            out.add(f);
         }
         if (out.size() >= MAX_FACONS) {
            break;
         }
      }
      return out;
   }

   private static Facon decrire(Recipe<?> r, ItemStack sortie) {
      NonNullList<Ingredient> liste;
      try {
         liste = r.getIngredients();
      } catch (Throwable t) {
         return null;
      }
      if (liste == null || liste.isEmpty()) {
         return null;
      }
      Map<String, Integer> compte = new LinkedHashMap<>();
      for (Ingredient i : liste) {
         if (i == null || i.isEmpty()) {
            continue;
         }
         ItemStack[] choix;
         try {
            choix = i.getItems();
         } catch (Throwable t) {
            continue;
         }
         if (choix == null || choix.length == 0) {
            continue;
         }
         ResourceLocation id = ForgeRegistries.ITEMS.getKey(choix[0].getItem());
         if (id != null) {
            compte.merge(id.toString(), 1, Integer::sum);
            if (compte.size() >= MAX_INGREDIENTS) {
               break;
            }
         }
      }
      if (compte.isEmpty()) {
         return null;
      }
      ResourceLocation type = ForgeRegistries.RECIPE_TYPES.getKey(r.getType());
      return new Facon(type == null ? "minecraft:crafting" : type.toString(), new ArrayList<>(compte.keySet()), new ArrayList<>(compte.values()), Math.max(1, sortie.getCount()));
   }
}
