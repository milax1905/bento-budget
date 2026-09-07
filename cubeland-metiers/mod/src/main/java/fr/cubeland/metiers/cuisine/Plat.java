package fr.cubeland.metiers.cuisine;

import net.minecraft.resources.ResourceLocation;

public record Plat(ResourceLocation objet, String nom, Famille famille, String poste, int palier, int valeur) {
   public boolean valide() {
      return this.objet != null && this.palier >= 1 && this.palier <= 5;
   }
}
