package fr.cubeland.metiers.client;

import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.client.ecran.EcranCubeland;
import net.minecraft.client.gui.screens.Screen;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

/**
 * Le bouton « Métiers » de l'inventaire appartient à la boutique et ouvre son
 * ancien écran. On le remplace au vol par le panneau de ce mod.
 */
@EventBusSubscriber(modid = CubelandMetiers.MODID, value = Dist.CLIENT)
public final class Redirection {
   private static final String ANCIEN = "fr.cubeland.boutique.client.EcranMetiers";

   private Redirection() {
   }

   @SubscribeEvent
   public static void ouverture(ScreenEvent.Opening e) {
      Screen nouveau = e.getNewScreen();
      if (nouveau != null && ANCIEN.equals(nouveau.getClass().getName())) {
         e.setNewScreen(new EcranCubeland(0));
      }
   }
}
