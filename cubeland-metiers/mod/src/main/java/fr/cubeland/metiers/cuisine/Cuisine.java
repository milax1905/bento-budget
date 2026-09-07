package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.metier.Metier;
import fr.cubeland.metiers.quete.Quetes;
import fr.cubeland.metiers.reseau.PaquetAnnonce;
import fr.cubeland.metiers.reseau.PaquetRepas;
import fr.cubeland.metiers.reseau.Reseau;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.ItemStack;

/**
 * Ce qui arrive à un plat quand il rencontre un joueur : la marque à la
 * sortie de l'atelier, l'effet quand on le mange.
 */
public final class Cuisine {
   private Cuisine() {
   }

   /** Un plat vient d'être produit par ce joueur (fabrication, cuisson, ramassage près d'un poste). */
   public static boolean produit(ServerPlayer joueur, ItemStack pile) {
      return traiterNouveau(joueur, pile, DonneesMetiers.de(joueur.server), Provenance.ATELIER);
   }

   /**
    * Marque un plat qui n'a pas encore été vu par le serveur.
    *
    * @return vrai si la pile a été marquée (donc si l'état du joueur a pu changer)
    */
   public static boolean traiterNouveau(ServerPlayer joueur, ItemStack pile, DonneesMetiers donnees, String origine) {
      Plat plat = Catalogue.de(pile);
      if (plat == null || Qualite.marque(pile)) {
         return false;
      }
      UUID u = joueur.getUUID();
      boolean hors = !donnees.aPortee(u, plat);

      if (!Provenance.ATELIER.equals(origine)) {
         // coffre, échange, /give : le plat garde un effet minimal mais n'entre pas au carnet
         Qualite.poser(pile, Qualite.MIN, plat.palier(), "", hors, Provenance.AILLEURS);
         return true;
      }

      Reglages r = Reglages.get();
      int palier = donnees.palier(u);
      String nom = joueur.getGameProfile().getName();
      if (hors && r.platHorsPalierInerte) {
         Qualite.poser(pile, Qualite.MIN, plat.palier(), nom, true, Provenance.ATELIER);
         joueur.displayClientMessage(Component.translatable("cubelandmetiers.msg.hors_palier", plat.palier()).withStyle(ChatFormatting.GRAY), true);
         return true;
      }

      int qualite = Qualite.tirer(palier, Couteaux.palierDuJoueur(joueur));
      Qualite.poser(pile, qualite, plat.palier(), nom, hors, Provenance.ATELIER);

      boolean decouverte = donnees.decouvrir(u, plat.recette());
      donnees.noterQualite(u, qualite);
      long gain = r.xpPlat + (decouverte ? r.xpDecouverte : 0L) + (long) (qualite - 1) * r.xpQualite;
      gain += gain * r.bonusXpDe(palier) / 100L;
      int gagnes = donnees.ajouter(u, Metier.CUISINIER, gain);

      if (decouverte) {
         int reste = Math.max(0, r.seuilSuivant(palier) - donnees.nombreRecettes(u));
         Component sous = palier < 5 && reste > 0
            ? Component.translatable("cubelandmetiers.annonce.decouverte.reste", plat.nom(), reste, palier + 1)
            : plat.nom();
         Reseau.versJoueur(joueur, new PaquetAnnonce(Component.translatable("cubelandmetiers.annonce.decouverte"), sous, PaquetAnnonce.DECOUVERTE));
         joueur.sendSystemMessage(
            Component.translatable("cubelandmetiers.annonce.decouverte").withStyle(ChatFormatting.GOLD)
               .append(Component.literal(" : "))
               .append(plat.nom().copy().withStyle(ChatFormatting.WHITE))
               .append(Component.literal("  +" + gain + " XP").withStyle(ChatFormatting.DARK_GRAY))
         );
         joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.PLAYER_LEVELUP, SoundSource.PLAYERS, 0.35F, 1.8F);
      } else if (qualite >= 4) {
         joueur.displayClientMessage(
            Qualite.nom(qualite).copy().withStyle(Qualite.couleur(qualite)).append(Component.literal(" · ").append(plat.nom()).withStyle(ChatFormatting.GRAY)),
            true
         );
      }

      if (gagnes > 0) {
         annoncerNiveau(joueur, donnees);
      }
      verifierPalier(joueur, donnees);
      Quetes.surCuisine(joueur, donnees, plat, qualite, decouverte);
      return true;
   }

   private static void annoncerNiveau(ServerPlayer joueur, DonneesMetiers donnees) {
      int n = donnees.niveau(joueur.getUUID(), Metier.CUISINIER);
      Component titre = Component.translatable("cubelandmetiers.annonce.niveau", Component.translatable("cubelandmetiers.metier.cuisinier"), n);
      Reseau.versJoueur(joueur, new PaquetAnnonce(titre, Component.empty(), PaquetAnnonce.NIVEAU));
      joueur.sendSystemMessage(titre.copy().withStyle(ChatFormatting.GOLD));
      joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.EXPERIENCE_ORB_PICKUP, SoundSource.PLAYERS, 0.5F, 1.2F);
   }

   /** Annonce les paliers gagnés depuis la dernière fois. */
   public static void verifierPalier(ServerPlayer joueur, DonneesMetiers donnees) {
      UUID u = joueur.getUUID();
      int palier = donnees.palier(u);
      int deja = donnees.palierRecompense(u);
      if (palier <= deja) {
         return;
      }
      for (int p = deja + 1; p <= palier; p++) {
         joueur.sendSystemMessage(Component.translatable("cubelandmetiers.annonce.palier", p, Component.translatable("cubelandmetiers.palier." + p)).withStyle(ChatFormatting.GOLD));
         joueur.sendSystemMessage(Component.literal("  ").append(Component.translatable("cubelandmetiers.palier." + p + ".recompense")).withStyle(ChatFormatting.GRAY));
      }
      Reseau.versJoueur(joueur, new PaquetAnnonce(
         Component.translatable("cubelandmetiers.annonce.palier", palier, Component.translatable("cubelandmetiers.palier." + palier)),
         Component.translatable("cubelandmetiers.palier." + palier + ".recompense"),
         PaquetAnnonce.PALIER
      ));
      donnees.marquerPalierRecompense(u, palier);
      joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.PLAYER_LEVELUP, SoundSource.PLAYERS, 0.6F, 1.0F);
   }

   /** Le joueur mange un plat : effet de sa famille, plus long avec la qualité. */
   public static void servir(ServerPlayer joueur, ItemStack pile) {
      Plat plat = Catalogue.de(pile);
      if (plat == null) {
         return;
      }
      if (Qualite.horsPalier(pile) && Reglages.get().platHorsPalierInerte) {
         return;
      }
      int q = Math.max(Qualite.MIN, Qualite.de(pile));
      int duree = Qualite.dureeEffet(q) * 20;
      int force = q >= 4 ? 1 : 0;
      joueur.addEffect(new MobEffectInstance(plat.famille().effet(), duree, force, false, true, true));
      if (q >= Qualite.SIGNATURE && plat.famille().aUnBonus()) {
         joueur.addEffect(new MobEffectInstance(plat.famille().bonus(), duree, 0, false, true, true));
      }
      Reseau.versJoueur(joueur, new PaquetRepas(plat.id(), q, duree / 20));
      if (Qualite.marque(pile)) {
         Quetes.surRepas(joueur, DonneesMetiers.de(joueur.server), pile);
      }
   }
}
