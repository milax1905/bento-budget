package fr.cubeland.metiers.metier;

import java.util.List;
import net.minecraft.network.chat.Component;

/**
 * Un métier.
 *
 * @param id      identifiant (« mineur », « cuisinier »…)
 * @param embleme l'objet qui le représente dans le panneau
 * @param gestes  les clés de gains ({@code Reglages.gains}) qui le font progresser,
 *                dans l'ordre d'affichage ; vide pour le cuisinier, qui a ses propres règles
 */
public record Metier(String id, String embleme, List<String> gestes) {
   public static final String MINEUR = "mineur";
   public static final String BUCHERON = "bucheron";
   public static final String FERMIER = "fermier";
   public static final String CHASSEUR = "chasseur";
   public static final String PECHEUR = "pecheur";
   public static final String CUISINIER = "cuisinier";

   public Component nom() {
      return Component.translatable("cubelandmetiers.metier." + this.id);
   }

   public Component resume() {
      return Component.translatable("cubelandmetiers.metier." + this.id + ".resume");
   }

   public boolean estLaCuisine() {
      return CUISINIER.equals(this.id);
   }
}
