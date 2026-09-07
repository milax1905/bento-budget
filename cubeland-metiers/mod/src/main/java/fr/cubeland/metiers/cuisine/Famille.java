package fr.cubeland.metiers.cuisine;

import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffects;

public enum Famille {
   FECULENT("feculent", "Feculents", "Miner", 15253626, MobEffects.DIG_SPEED, MobEffects.NIGHT_VISION),
   VIANDE("viande", "Viandes", "Combattre", 15231355, MobEffects.DAMAGE_BOOST, MobEffects.FIRE_RESISTANCE),
   POISSON("poisson", "Poissons", "Explorer l'eau", 7323591, MobEffects.MOVEMENT_SPEED, MobEffects.WATER_BREATHING),
   SOUPE("soupe", "Soupes", "Tenir la duree", 15764028, MobEffects.SATURATION, MobEffects.REGENERATION),
   LEGUME("legume", "Legumes", "Encaisser", 7323534, MobEffects.DAMAGE_RESISTANCE, MobEffects.ABSORPTION),
   DESSERT("dessert", "Desserts", "Chercher", 13081576, MobEffects.LUCK, MobEffects.LUCK),
   BOISSON("boisson", "Boissons", "Voyager", 11897455, MobEffects.MOVEMENT_SPEED, MobEffects.JUMP);

   private final String id;
   private final String nom;
   private final String sert;
   private final int couleur;
   private final MobEffect effet;
   private final MobEffect bonus;

   private Famille(String id, String nom, String sert, int couleur, MobEffect effet, MobEffect bonus) {
      this.id = id;
      this.nom = nom;
      this.sert = sert;
      this.couleur = couleur;
      this.effet = effet;
      this.bonus = bonus;
   }

   public String id() {
      return this.id;
   }

   public String nom() {
      return this.nom;
   }

   public String sert() {
      return this.sert;
   }

   public int couleur() {
      return this.couleur;
   }

   public MobEffect effet() {
      return this.effet;
   }

   public MobEffect bonus() {
      return this.bonus;
   }

   public static Famille par(String id) {
      for (Famille f : values()) {
         if (f.id.equals(id)) {
            return f;
         }
      }

      return FECULENT;
   }
}
