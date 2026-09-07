package fr.cubeland.metiers.metier;

import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.reseau.PaquetAnnonce;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.Reseau;
import java.util.Random;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.NetherWartBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraftforge.common.Tags;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.minecraftforge.event.entity.player.ItemFishedEvent;
import net.minecraftforge.event.level.BlockEvent.BreakEvent;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

/**
 * Les gestes qui font progresser les cinq métiers de terrain.
 *
 * <p>Tout est écouté en priorité basse : si un mod de protection annule la
 * casse ou la mort, on passe après lui et on ne donne rien.</p>
 */
@EventBusSubscriber(modid = CubelandMetiers.MODID)
public final class EvenementsMetiers {
   private static final Random HASARD = new Random();

   private EvenementsMetiers() {
   }

   /** Tire un gain d'XP dans la fourchette réglée pour ce geste. */
   private static long tirer(String cle) {
      long[] g = Reglages.get().gain(cle);
      long base = g[0];
      long haut = g[1];
      return haut > base ? base + HASARD.nextInt((int) Math.max(1L, haut - base + 1L)) : base;
   }

   @SubscribeEvent(priority = EventPriority.LOWEST)
   public static void casser(BreakEvent e) {
      if (e.isCanceled() || !Reglages.get().reprendreMetiers) {
         return;
      }
      if (!(e.getPlayer() instanceof ServerPlayer joueur) || joueur.isCreative()) {
         return;
      }
      BlockState etat = e.getState();
      if (etat.is(BlockTags.LOGS)) {
         gagner(joueur, Metier.BUCHERON, tirer("bucheron_buche"));
      } else if (mur(etat)) {
         gagner(joueur, Metier.FERMIER, tirer("fermier_recolte"));
      } else if (etat.is(BlockTags.MINEABLE_WITH_PICKAXE)) {
         gagner(joueur, Metier.MINEUR, tirer(minerai(etat) ? "mineur_minerai" : "mineur_pierre"));
      }
   }

   private static boolean minerai(BlockState etat) {
      if (etat.is(Tags.Blocks.ORES)) {
         return true;
      }
      Block bloc = etat.getBlock();
      String nom = bloc.getDescriptionId();
      return nom.contains("ore") || nom.contains("minerai");
   }

   private static boolean mur(BlockState etat) {
      Block b = etat.getBlock();
      if (b instanceof CropBlock crop) {
         return etat.getValue(crop.getAgeProperty()) >= crop.getMaxAge();
      }
      return b instanceof NetherWartBlock && etat.getValue(NetherWartBlock.AGE) >= NetherWartBlock.MAX_AGE;
   }

   @SubscribeEvent(priority = EventPriority.LOWEST)
   public static void tuer(LivingDeathEvent e) {
      if (e.isCanceled() || !Reglages.get().reprendreMetiers) {
         return;
      }
      if (!(e.getSource().getEntity() instanceof ServerPlayer joueur) || e.getEntity() instanceof ServerPlayer) {
         return;
      }
      if (e.getEntity() instanceof TamableAnimal apprivoise && apprivoise.isTame()) {
         return;
      }
      gagner(joueur, Metier.CHASSEUR, tirer("chasseur_tuerie"));
   }

   @SubscribeEvent(priority = EventPriority.LOWEST)
   public static void pecher(ItemFishedEvent e) {
      if (!e.isCanceled() && Reglages.get().reprendreMetiers && e.getEntity() instanceof ServerPlayer joueur) {
         gagner(joueur, Metier.PECHEUR, tirer("pecheur_prise"));
      }
   }

   /** Donne de l'XP à un métier, annonce les niveaux gagnés, reflète vers la boutique. */
   public static void gagner(ServerPlayer joueur, String metier, long montant) {
      if (montant <= 0L) {
         return;
      }
      DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
      int gagnes = donnees.ajouter(joueur.getUUID(), metier, montant);
      if (Reglages.get().refleterVersBoutique) {
         PontBoutique.refleter(joueur.server, joueur.getUUID(), metier, montant);
      }
      if (gagnes > 0) {
         int n = donnees.niveau(joueur.getUUID(), metier);
         Component titre = Metiers.aUnTitre(metier, n) && n % 5 == 0 ? Metiers.titre(metier, n) : Component.empty();
         Reseau.versJoueur(joueur, new PaquetAnnonce(Component.translatable("cubelandmetiers.annonce.niveau", Metiers.nom(metier), n), titre, PaquetAnnonce.NIVEAU));
         joueur.displayClientMessage(Component.translatable("cubelandmetiers.annonce.niveau", Metiers.nom(metier), n).withStyle(ChatFormatting.GOLD), true);
         joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.EXPERIENCE_ORB_PICKUP, SoundSource.PLAYERS, 0.5F, 1.2F);
      }
      Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
   }
}
