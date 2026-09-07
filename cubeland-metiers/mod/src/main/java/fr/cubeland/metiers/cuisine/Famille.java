package fr.cubeland.metiers.cuisine;

import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffects;

/** Les sept familles de plats. Chacune donne un effet, et un second en qualité Signature. */
public enum Famille {
   FECULENT("feculent", 0xE8B4FA, MobEffects.DIG_SPEED, MobEffects.NIGHT_VISION),
   VIANDE("viande", 0xE86A7B, MobEffects.DAMAGE_BOOST, MobEffects.FIRE_RESISTANCE),
   POISSON("poisson", 0x6FBFC7, MobEffects.MOVEMENT_SPEED, MobEffects.WATER_BREATHING),
   SOUPE("soupe", 0xF08B3C, MobEffects.SATURATION, MobEffects.REGENERATION),
   LEGUME("legume", 0x6FBF8E, MobEffects.DAMAGE_RESISTANCE, MobEffects.ABSORPTION),
   DESSERT("dessert", 0xC79CE8, MobEffects.LUCK, MobEffects.LUCK),
   BOISSON("boisson", 0xB5A3EF, MobEffects.MOVEMENT_SPEED, MobEffects.JUMP);

   private final String id;
   private final int couleur;
   private final MobEffect effet;
   private final MobEffect bonus;

   Famille(String id, int couleur, MobEffect effet, MobEffect bonus) {
      this.id = id;
      this.couleur = couleur;
      this.effet = effet;
      this.bonus = bonus;
   }

   public String id() {
      return this.id;
   }

   /** Couleur d'accent (RVB sans alpha). */
   public int couleur() {
      return this.couleur;
   }

   public MobEffect effet() {
      return this.effet;
   }

   /** Le second effet, ajouté en qualité Signature. Peut être le même que {@link #effet()}. */
   public MobEffect bonus() {
      return this.bonus;
   }

   public boolean aUnBonus() {
      return this.bonus != this.effet;
   }

   public Component nom() {
      return Component.translatable("cubelandmetiers.famille." + this.id);
   }

   /** À quoi sert cette famille, en deux mots (« Miner », « Combattre »…). */
   public Component sert() {
      return Component.translatable("cubelandmetiers.famille." + this.id + ".sert");
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
