package fr.cubeland.metiers;

import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Recettes;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.metier.PontBoutique;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetQuetes;
import fr.cubeland.metiers.reseau.PaquetSync;
import fr.cubeland.metiers.reseau.Reseau;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.event.entity.player.PlayerEvent.PlayerLoggedInEvent;
import net.minecraftforge.event.entity.player.PlayerEvent.PlayerRespawnEvent;
import net.minecraftforge.event.server.ServerAboutToStartEvent;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.ModList;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;
import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Cubeland Métiers : les six métiers du serveur, la cuisine en cinq paliers,
 * le carnet et ses commandes.
 *
 * <p>Le serveur décide de tout et lit seul les fichiers de configuration ; le
 * client reçoit réglages, catalogue et état à la connexion, et ne fait
 * qu'afficher.</p>
 */
@Mod(CubelandMetiers.MODID)
public class CubelandMetiers {
   public static final String MODID = "cubelandmetiers";
   public static final Logger LOG = LoggerFactory.getLogger("CubelandMetiers");

   public static String version() {
      return ModList.get().getModContainerById(MODID).map(c -> c.getModInfo().getVersion().toString()).orElse("?");
   }

   public CubelandMetiers() {
      FMLJavaModLoadingContext.get().getModEventBus().addListener(this::commun);
   }

   private void commun(FMLCommonSetupEvent e) {
      e.enqueueWork(Reseau::enregistrer);
      LOG.info("Cubeland Métiers {} démarre.", version());
   }

   /** Recharge réglages et catalogue, puis les renvoie à tous les joueurs connectés. */
   public static void recharger(MinecraftServer serveur) {
      Reglages.charger();
      Catalogue.charger();
      if (serveur != null) {
         Catalogue.relierAuxRecettes(Recettes.indexerAteliers(serveur));
         DonneesMetiers donnees = DonneesMetiers.de(serveur);
         PaquetSync sync = PaquetSync.courant();
         for (ServerPlayer joueur : serveur.getPlayerList().getPlayers()) {
            Reseau.versJoueur(joueur, sync);
            Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
            Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
         }
      }
   }

   @EventBusSubscriber(modid = MODID)
   public static final class Cycle {
      private Cycle() {
      }

      @SubscribeEvent
      public static void avantDemarrage(ServerAboutToStartEvent e) {
         Reglages.charger();
         Catalogue.charger();
      }

      @SubscribeEvent
      public static void serveurPret(ServerStartedEvent e) {
         DonneesMetiers donnees = DonneesMetiers.de(e.getServer());
         if (Reglages.get().importerBoutique && !donnees.importFait()) {
            int n = PontBoutique.importer(e.getServer(), donnees);
            donnees.marquerImport();
            LOG.info("Reprise unique depuis la boutique : {} joueur(s).", n);
         }
         Catalogue.relierAuxRecettes(Recettes.indexerAteliers(e.getServer()));
         LOG.info("Cuisine : {} plats, {} ignorés.", Catalogue.nombre(), Catalogue.ignores());
      }

      @SubscribeEvent
      public static void arrivee(PlayerLoggedInEvent e) {
         if (!(e.getEntity() instanceof ServerPlayer joueur)) {
            return;
         }
         DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
         Reseau.versJoueur(joueur, PaquetSync.courant());
         Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
         Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
         accueillir(joueur, donnees);
      }

      private static void accueillir(ServerPlayer joueur, DonneesMetiers donnees) {
         if (donnees.niveauTotal(joueur.getUUID()) > 0 || donnees.nombreRecettes(joueur.getUUID()) > 0) {
            return;
         }
         joueur.sendSystemMessage(Component.empty());
         joueur.sendSystemMessage(Component.translatable("cubelandmetiers.accueil.titre").withStyle(ChatFormatting.GOLD));
         joueur.sendSystemMessage(Component.translatable("cubelandmetiers.accueil.1").withStyle(ChatFormatting.GRAY));
         joueur.sendSystemMessage(Component.translatable("cubelandmetiers.accueil.2").withStyle(ChatFormatting.GRAY));
         joueur.sendSystemMessage(Component.translatable("cubelandmetiers.accueil.3").withStyle(ChatFormatting.WHITE));
         joueur.sendSystemMessage(Component.empty());
      }

      @SubscribeEvent
      public static void reapparition(PlayerRespawnEvent e) {
         if (e.getEntity() instanceof ServerPlayer joueur) {
            Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, DonneesMetiers.de(joueur.server)));
         }
      }
   }
}
