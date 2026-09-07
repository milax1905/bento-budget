package fr.cubeland.metiers.metier;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.Reseau;
import java.util.Random;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.NetherWartBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraftforge.event.entity.living.LivingDeathEvent;
import net.minecraftforge.event.entity.player.ItemFishedEvent;
import net.minecraftforge.event.level.BlockEvent.BreakEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

@EventBusSubscriber(
   modid = "cubelandmetiers"
)
public final class EvenementsMetiers {
   private static final Random HASARD = new Random();

   private EvenementsMetiers() {
   }

   private static long tirer(String cle) {
      long[] g = Reglages.get().gains.get(cle);
      if (g != null && g.length != 0) {
         long base = g[0];
         long bonus = g.length > 1 ? g[1] : 0L;
         return bonus > base ? base + (long)HASARD.nextInt((int)Math.max(1L, bonus - base + 1L)) : base;
      } else {
         return 0L;
      }
   }

   @SubscribeEvent
   public static void casser(BreakEvent e) {
      if (Reglages.get().reprendreMetiers) {
         if (e.getPlayer() instanceof ServerPlayer joueur) {
            if (!e.isCanceled() && !joueur.isCreative()) {
               BlockState etat = e.getState();
               Block bloc = etat.getBlock();
               if (etat.is(BlockTags.LOGS)) {
                  gagner(joueur, "bucheron", tirer("bucheron_buche"));
               } else if (mur(etat)) {
                  gagner(joueur, "fermier", tirer("fermier_recolte"));
               } else if (etat.is(BlockTags.MINEABLE_WITH_PICKAXE)) {
                  String nom = bloc.getDescriptionId();
                  boolean minerai = nom.contains("ore")
                     || nom.contains("minerai")
                     || etat.is(BlockTags.COAL_ORES)
                     || etat.is(BlockTags.IRON_ORES)
                     || etat.is(BlockTags.GOLD_ORES)
                     || etat.is(BlockTags.DIAMOND_ORES)
                     || etat.is(BlockTags.EMERALD_ORES)
                     || etat.is(BlockTags.LAPIS_ORES)
                     || etat.is(BlockTags.REDSTONE_ORES)
                     || etat.is(BlockTags.COPPER_ORES);
                  gagner(joueur, "mineur", tirer(minerai ? "mineur_minerai" : "mineur_pierre"));
               }
            }
         }
      }
   }

   private static boolean mur(BlockState etat) {
      Block b = etat.getBlock();
      if (b instanceof CropBlock crop) {
         IntegerProperty age = crop.getAgeProperty();
         return (Integer)etat.getValue(age) >= crop.getMaxAge();
      } else {
         return b instanceof NetherWartBlock ? (Integer)etat.getValue(NetherWartBlock.AGE) >= 3 : false;
      }
   }

   @SubscribeEvent
   public static void tuer(LivingDeathEvent e) {
      if (Reglages.get().reprendreMetiers) {
         if (e.getSource().getEntity() instanceof ServerPlayer joueur) {
            if (!(e.getEntity() instanceof ServerPlayer)) {
               gagner(joueur, "chasseur", tirer("chasseur_tuerie"));
            }
         }
      }
   }

   @SubscribeEvent
   public static void pecher(ItemFishedEvent e) {
      if (Reglages.get().reprendreMetiers) {
         if (e.getEntity() instanceof ServerPlayer joueur) {
            gagner(joueur, "pecheur", tirer("pecheur_prise"));
         }
      }
   }

   public static void gagner(ServerPlayer joueur, String metier, long montant) {
      if (montant > 0L) {
         DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
         int gagnes = donnees.ajouter(joueur.getUUID(), metier, montant);
         if (Reglages.get().refleterVersBoutique) {
            PontBoutique.refleter(joueur.server, joueur.getUUID(), metier, montant);
         }

         if (gagnes > 0) {
            int n = donnees.niveau(joueur.getUUID(), metier);
            joueur.displayClientMessage(Component.literal(Metiers.nomAffiche(metier) + " niveau " + n).withStyle(ChatFormatting.GOLD), false);
            String titre = Metiers.titre(metier, n);
            if (!titre.isEmpty() && n % 5 == 0) {
               joueur.displayClientMessage(Component.literal("  " + titre).withStyle(ChatFormatting.GRAY), false);
            }

            joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.NOTE_BLOCK_CHIME, SoundSource.PLAYERS, 0.5F, 1.2F);
         }

         Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
      }
   }
}
