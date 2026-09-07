package fr.cubeland.metiers.client;

import net.minecraft.client.gui.screens.Screen;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent.Opening;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

@EventBusSubscriber(
   modid = "cubelandmetiers",
   value = {Dist.CLIENT}
)
public final class Redirection {
   private static final String ANCIEN = "fr.cubeland.boutique.client.EcranMetiers";

   private Redirection() {
   }

   @SubscribeEvent
   public static void ouverture(Opening e) {
      Screen nouveau = e.getNewScreen();
      if (nouveau != null && "fr.cubeland.boutique.client.EcranMetiers".equals(nouveau.getClass().getName())) {
         e.setNewScreen(new EcranMetiers(0));
      }
   }
}
