package fr.cubeland.metiers.client;

import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.RegisterGuiOverlaysEvent;
import net.minecraftforge.client.gui.overlay.VanillaGuiOverlay;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber.Bus;

@EventBusSubscriber(
   modid = "cubelandmetiers",
   value = {Dist.CLIENT},
   bus = Bus.MOD
)
public final class ClientSetup {
   private ClientSetup() {
   }

   @SubscribeEvent
   public static void calques(RegisterGuiOverlaysEvent e) {
      e.registerAbove(VanillaGuiOverlay.PLAYER_LIST.id(), "cubeland_cuisine", HudCuisine.INSTANCE);
   }
}
