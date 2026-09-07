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

public final class Recettes {
   private static final int MAX_FACONS = 3;
   private static final int MAX_INGREDIENTS = 9;

   private Recettes() {
   }

   public static Map<Item, String> indexerAteliers(MinecraftServer serveur) {
      Map<Item, String> out = new HashMap<>();
      if (serveur == null) {
         return out;
      } else {
         for (Recipe<?> r : serveur.getRecipeManager().getRecipes()) {
            ItemStack sortie;
            try {
               sortie = r.getResultItem();
            } catch (Throwable var6) {
               continue;
            }

            if (sortie != null && !sortie.isEmpty() && !out.containsKey(sortie.getItem())) {
               ResourceLocation type = ForgeRegistries.RECIPE_TYPES.getKey(r.getType());
               if (type != null) {
                  out.put(sortie.getItem(), type.toString());
               }
            }
         }

         return out;
      }
   }

   public static List<String> utileA(MinecraftServer serveur, Item ingredient) {
      List<String> out = new ArrayList<>();
      if (serveur != null && ingredient != null) {
         for (Recipe<?> r : serveur.getRecipeManager().getRecipes()) {
            ItemStack sortie;
            try {
               sortie = r.getResultItem();
            } catch (Throwable var13) {
               continue;
            }

            if (sortie != null && !sortie.isEmpty() && sortie.getItem() != ingredient && Catalogue.de(sortie.getItem()) != null) {
               boolean dedans = false;

               try {
                  for (Ingredient i : r.getIngredients()) {
                     if (i != null && !i.isEmpty()) {
                        for (ItemStack c : i.getItems()) {
                           if (c.getItem() == ingredient) {
                              dedans = true;
                              break;
                           }
                        }

                        if (dedans) {
                           break;
                        }
                     }
                  }
               } catch (Throwable var14) {
                  continue;
               }

               if (dedans) {
                  ResourceLocation id = ForgeRegistries.ITEMS.getKey(sortie.getItem());
                  if (id != null && !out.contains(id.toString())) {
                     out.add(id.toString());
                  }

                  if (out.size() >= 8) {
                     break;
                  }
               }
            }
         }

         return out;
      } else {
         return out;
      }
   }

   public static List<Recettes.Facon> pour(MinecraftServer serveur, Item resultat) {
      List<Recettes.Facon> out = new ArrayList<>();
      if (serveur != null && resultat != null) {
         for (Recipe<?> r : serveur.getRecipeManager().getRecipes()) {
            ItemStack sortie;
            try {
               sortie = r.getResultItem();
            } catch (Throwable var7) {
               continue;
            }

            if (sortie != null && !sortie.isEmpty() && sortie.getItem() == resultat) {
               Recettes.Facon f = decrire(r, sortie);
               if (f != null) {
                  out.add(f);
               }

               if (out.size() >= 3) {
                  break;
               }
            }
         }

         return out;
      } else {
         return out;
      }
   }

   private static Recettes.Facon decrire(Recipe<?> r, ItemStack sortie) {
      NonNullList<Ingredient> liste;
      try {
         liste = r.getIngredients();
      } catch (Throwable var8) {
         return null;
      }

      if (liste != null && !liste.isEmpty()) {
         Map<String, Integer> compte = new LinkedHashMap<>();

         for (Ingredient i : liste) {
            if (i != null && !i.isEmpty()) {
               ItemStack[] choix;
               try {
                  choix = i.getItems();
               } catch (Throwable var9) {
                  continue;
               }

               if (choix != null && choix.length != 0) {
                  ResourceLocation id = ForgeRegistries.ITEMS.getKey(choix[0].getItem());
                  if (id != null) {
                     compte.merge(id.toString(), 1, Integer::sum);
                     if (compte.size() >= 9) {
                        break;
                     }
                  }
               }
            }
         }

         if (compte.isEmpty()) {
            return null;
         } else {
            ResourceLocation type = ForgeRegistries.RECIPE_TYPES.getKey(r.getType());
            return new Recettes.Facon(
               type == null ? "minecraft:crafting" : type.toString(),
               new ArrayList<>(compte.keySet()),
               new ArrayList<>(compte.values()),
               Math.max(1, sortie.getCount())
            );
         }
      } else {
         return null;
      }
   }

   public static record Facon(String type, List<String> ingredients, List<Integer> combien, int rendement) {
   }
}
