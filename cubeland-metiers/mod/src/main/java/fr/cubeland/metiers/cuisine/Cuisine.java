package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.reseau.PaquetAnnonce;
import fr.cubeland.metiers.reseau.PaquetRepas;
import fr.cubeland.metiers.reseau.Reseau;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.ItemStack;

public final class Cuisine {
   private Cuisine() {
   }

   public static boolean marquerFrais(ServerPlayer joueur, ItemStack pile, DonneesMetiers donnees) {
      Plat plat = Catalogue.de(pile);
      if (plat != null && !Qualite.marque(pile)) {
         Reglages r = Reglages.get();
         int palier = donnees.palier(joueur.getUUID());
         boolean hors = plat.palier() > palier;
         boolean prepare = r.fenetrePoste <= 0 || Postes.recemment(joueur.getUUID(), r.fenetrePoste);
         if (!prepare) {
            Qualite.poser(pile, 1, plat.palier(), "", hors);
            return true;
         } else {
            int qualite = hors && r.platHorsPalierInerte ? 1 : Qualite.tirer(palier, Couteaux.palierDuJoueur(joueur));
            Qualite.poser(pile, qualite, plat.palier(), joueur.getGameProfile().getName(), hors);
            if (hors && r.platHorsPalierInerte) {
               joueur.displayClientMessage(
                  Component.literal("Ce plat demande le palier " + plat.palier() + " : sans effet et sans valeur tant que tu n'y es pas.")
                     .withStyle(ChatFormatting.GRAY),
                  true
               );
               return true;
            } else {
               String id = plat.objet().toString();
               boolean decouverte = donnees.decouvrir(joueur.getUUID(), id);
               donnees.noterQualite(joueur.getUUID(), qualite);
               long gain = r.xpPlat + (decouverte ? r.xpDecouverte : 0L) + (long)(qualite - 1) * r.xpQualite;
               gain += gain * (long)r.bonusXpDe(palier) / 100L;
               int gagnes = donnees.ajouter(joueur.getUUID(), "cuisinier", gain);
               if (decouverte) {
                  int reste = Math.max(0, r.palierRecettes[Math.min(4, palier)] - donnees.nombreRecettes(joueur.getUUID()));
                  Reseau.versJoueur(
                     joueur,
                     new PaquetAnnonce(
                        "Recette decouverte", plat.nom() + (palier < 5 && reste > 0 ? "  ·  encore " + reste + " avant le palier " + (palier + 1) : ""), 0
                     )
                  );
                  joueur.displayClientMessage(
                     Component.literal("Recette decouverte : ")
                        .withStyle(ChatFormatting.GOLD)
                        .append(Component.literal(plat.nom()).withStyle(ChatFormatting.WHITE))
                        .append(Component.literal("  +" + gain + " XP").withStyle(ChatFormatting.DARK_GRAY)),
                     false
                  );
                  joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.PLAYER_LEVELUP, SoundSource.PLAYERS, 0.35F, 1.8F);
               } else if (qualite >= 4) {
                  joueur.displayClientMessage(
                     Component.literal(Qualite.nom(qualite))
                        .withStyle(Qualite.couleur(qualite))
                        .append(Component.literal(" · " + plat.nom()).withStyle(ChatFormatting.GRAY)),
                     true
                  );
               }

               if (gagnes > 0) {
                  annoncerNiveau(joueur, donnees);
               }

               verifierPalier(joueur, donnees);
               return true;
            }
         }
      } else {
         return false;
      }
   }

   private static void annoncerNiveau(ServerPlayer joueur, DonneesMetiers donnees) {
      int n = donnees.niveau(joueur.getUUID(), "cuisinier");
      Reseau.versJoueur(joueur, new PaquetAnnonce("Cuisinier niveau " + n, "", 2));
      joueur.displayClientMessage(Component.literal("Cuisinier niveau " + n).withStyle(ChatFormatting.GOLD), false);
      joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.NOTE_BLOCK_CHIME, SoundSource.PLAYERS, 0.5F, 1.2F);
   }

   public static void verifierPalier(ServerPlayer joueur, DonneesMetiers donnees) {
      int palier = donnees.palier(joueur.getUUID());
      int deja = donnees.palierRecompense(joueur.getUUID());
      if (palier > deja) {
         Reglages r = Reglages.get();

         for (int p = deja + 1; p <= palier; p++) {
            String nom = r.palierNom[Math.min(4, p - 1)];
            String rec = r.palierRecompense[Math.min(4, p - 1)];
            joueur.displayClientMessage(Component.literal("").append(Component.literal("Palier " + p + " · " + nom).withStyle(ChatFormatting.GOLD)), false);
            if (rec != null && !rec.isBlank()) {
               joueur.displayClientMessage(Component.literal("  " + rec).withStyle(ChatFormatting.GRAY), false);
            }
         }

         Reseau.versJoueur(
            joueur, new PaquetAnnonce("Palier " + palier + " · " + r.palierNom[Math.min(4, palier - 1)], r.palierRecompense[Math.min(4, palier - 1)], 1)
         );
         donnees.marquerPalierRecompense(joueur.getUUID(), palier);
         joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.PLAYER_LEVELUP, SoundSource.PLAYERS, 0.6F, 1.0F);
      }
   }

   public static void servir(ServerPlayer joueur, ItemStack pile) {
      Plat plat = Catalogue.de(pile);
      if (plat != null) {
         if (!Qualite.horsPalier(pile) || !Reglages.get().platHorsPalierInerte) {
            int q = Math.max(1, Qualite.de(pile));
            int duree = Qualite.dureeEffet(q) * 20;
            int force = q >= 4 ? 1 : 0;
            joueur.addEffect(new MobEffectInstance(plat.famille().effet(), duree, force, false, true, true));
            if (q >= 5 && plat.famille().bonus() != plat.famille().effet()) {
               joueur.addEffect(new MobEffectInstance(plat.famille().bonus(), duree, 0, false, true, true));
            }

            Reseau.versJoueur(joueur, new PaquetRepas(plat.nom(), plat.famille().effet().getDisplayName().getString(), q, duree / 20));
         }
      }
   }
}
