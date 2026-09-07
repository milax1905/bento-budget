package fr.cubeland.metiers;

import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Postes;
import fr.cubeland.metiers.cuisine.Recettes;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.metier.PontBoutique;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.Reseau;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.event.entity.player.PlayerEvent.PlayerLoggedInEvent;
import net.minecraftforge.event.entity.player.PlayerEvent.PlayerLoggedOutEvent;
import net.minecraftforge.event.entity.player.PlayerEvent.PlayerRespawnEvent;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.ModList;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;
import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Mod("cubelandmetiers")
public class CubelandMetiers {
   public static final String MODID = "cubelandmetiers";
   public static final Logger LOG = LoggerFactory.getLogger("CubelandMetiers");

   public static String version() {
      return ModList.get().getModContainerById("cubelandmetiers").map(c -> c.getModInfo().getVersion().toString()).orElse("?");
   }

   public CubelandMetiers() {
      Reglages.charger();
      FMLJavaModLoadingContext.get().getModEventBus().addListener(this::commun);
   }

   private void commun(FMLCommonSetupEvent e) {
      e.enqueueWork(() -> {
         Reseau.enregistrer();
         Catalogue.charger();
      });
      LOG.info("Cubeland Metiers {} demarre.", version());
   }

   @EventBusSubscriber(
      modid = "cubelandmetiers"
   )
   public static final class Cycle {
      private Cycle() {
      }

      @SubscribeEvent
      public static void serveurPret(ServerStartedEvent e) {
         Catalogue.charger();
         DonneesMetiers donnees = DonneesMetiers.de(e.getServer());
         if (Reglages.get().importerBoutique && !donnees.importFait()) {
            int n = PontBoutique.importer(e.getServer(), donnees);
            donnees.marquerImport();
            CubelandMetiers.LOG.info("Reprise unique depuis la boutique : {} joueur(s).", n);
         }

         Catalogue.relierAuxRecettes(Recettes.indexerAteliers(e.getServer()));
         CubelandMetiers.LOG.info("Cuisine : {} plats, {} ignores.", Catalogue.nombre(), Catalogue.ignores());
      }

      @SubscribeEvent
      public static void arrivee(PlayerLoggedInEvent e) {
         if (e.getEntity() instanceof ServerPlayer joueur) {
            DonneesMetiers var3 = DonneesMetiers.de(joueur.server);
            Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, var3));
            accueillir(joueur, var3);
         }
      }

      private static void accueillir(ServerPlayer joueur, DonneesMetiers donnees) {
         if (donnees.niveauTotal(joueur.getUUID()) <= 0 && donnees.nombreRecettes(joueur.getUUID()) <= 0) {
            joueur.sendSystemMessage(Component.literal(""));
            joueur.sendSystemMessage(Component.literal("Les metiers de Cubeland").withStyle(ChatFormatting.GOLD));
            joueur.sendSystemMessage(Component.literal("  Mine, coupe, cultive, chasse, peche : chaque geste te fait monter.").withStyle(ChatFormatting.GRAY));
            joueur.sendSystemMessage(Component.literal("  Cuisine aussi — et la, ce sont les recettes differentes qui comptent,").withStyle(ChatFormatting.GRAY));
            joueur.sendSystemMessage(Component.literal("  pas la quantite. Cinq paliers, du feu de camp aux plats a effet.").withStyle(ChatFormatting.GRAY));
            joueur.sendSystemMessage(
               Component.literal("  Touche J, ou /metiers, pour tout voir : ta progression et le livre des plats.").withStyle(ChatFormatting.WHITE)
            );
            joueur.sendSystemMessage(Component.literal(""));
         }
      }

      @SubscribeEvent
      public static void depart(PlayerLoggedOutEvent e) {
         Postes.oublier(e.getEntity().getUUID());
      }

      @SubscribeEvent
      public static void reapparition(PlayerRespawnEvent e) {
         if (e.getEntity() instanceof ServerPlayer joueur) {
            DonneesMetiers var3 = DonneesMetiers.de(joueur.server);
            Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, var3));
         }
      }
   }
}
