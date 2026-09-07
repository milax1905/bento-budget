package fr.cubeland.metiers.client;

import fr.cubeland.metiers.CubelandMetiers;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ClientPlayerNetworkEvent;
import net.minecraftforge.client.event.RegisterGuiOverlaysEvent;
import net.minecraftforge.client.event.RegisterKeyMappingsEvent;
import net.minecraftforge.client.gui.overlay.VanillaGuiOverlay;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber.Bus;

/** Ce que le client enregistre au démarrage : le HUD, la touche du panneau. */
@EventBusSubscriber(modid = CubelandMetiers.MODID, value = Dist.CLIENT, bus = Bus.MOD)
public final class ClientSetup {
   private ClientSetup() {
   }

   @SubscribeEvent
   public static void calques(RegisterGuiOverlaysEvent e) {
      e.registerAbove(VanillaGuiOverlay.PLAYER_LIST.id(), "cubeland_cuisine", HudCuisine.INSTANCE);
   }

   @SubscribeEvent
   public static void touches(RegisterKeyMappingsEvent e) {
      e.register(Touches.PANNEAU);
   }

   /** Événements de jeu côté client. */
   @EventBusSubscriber(modid = CubelandMetiers.MODID, value = Dist.CLIENT)
   public static final class Jeu {
      private Jeu() {
      }

      @SubscribeEvent
      public static void deconnexion(ClientPlayerNetworkEvent.LoggingOut e) {
         EtatClient.oublier();
      }
   }
}
