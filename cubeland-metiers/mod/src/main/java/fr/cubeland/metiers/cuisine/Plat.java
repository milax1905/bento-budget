package fr.cubeland.metiers.cuisine;

import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/**
 * Un plat du catalogue.
 *
 * @param objet    l'objet Minecraft
 * @param item     l'objet résolu dans le registre
 * @param famille  sa famille, qui donne son effet
 * @param poste    le poste de cuisine où il se prépare (fourneau, planche, poêle…)
 * @param palier   le palier exigé pour qu'il ait un effet et une valeur
 * @param valeur   son prix de base, multiplié ensuite par la qualité
 * @param variante l'objet dont il n'est qu'une autre forme (la tarte pour une
 *                 part de tarte), ou {@code null} : c'est cette recette-là qui
 *                 s'inscrit dans le carnet
 */
public record Plat(ResourceLocation objet, Item item, Famille famille, String poste, int palier, int valeur, ResourceLocation variante) {

   /** L'identifiant qui compte dans le carnet du joueur. */
   public String recette() {
      return (this.variante == null ? this.objet : this.variante).toString();
   }

   public String id() {
      return this.objet.toString();
   }

   /** Le nom de l'objet, traduit chez celui qui l'affiche. */
   public Component nom() {
      return Component.translatable(this.item.getDescriptionId());
   }

   /** Le nom traduit en texte brut ; côté client seulement, sinon on obtient la clé. */
   public String nomTexte() {
      return new ItemStack(this.item).getHoverName().getString();
   }
}
