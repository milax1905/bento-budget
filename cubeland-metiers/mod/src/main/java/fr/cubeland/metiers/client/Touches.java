package fr.cubeland.metiers.client;

import com.mojang.blaze3d.platform.InputConstants.Type;
import fr.cubeland.metiers.reseau.PaquetDemande;
import fr.cubeland.metiers.reseau.Reseau;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.RegisterKeyMappingsEvent;
import net.minecraftforge.client.settings.KeyConflictContext;
import net.minecraftforge.event.TickEvent.ClientTickEvent;
import net.minecraftforge.event.TickEvent.Phase;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber.Bus;

public final class Touches {
   public static final KeyMapping PANNEAU = new KeyMapping(
      "key.cubelandmetiers.panneau", KeyConflictContext.IN_GAME, Type.KEYSYM, 74, "key.categories.cubelandmetiers"
   );

   private Touches() {
   }

   @EventBusSubscriber(
      modid = "cubelandmetiers",
      value = {Dist.CLIENT}
   )
   public static final class Ecoute {
      private Ecoute() {
      }

      @SubscribeEvent
      public static void tic(ClientTickEvent e) {
         if (e.phase == Phase.END) {
            Minecraft mc = Minecraft.getInstance();
            if (mc.player != null && mc.screen == null) {
               while (Touches.PANNEAU.consumeClick()) {
                  Reseau.versServeur(new PaquetDemande(1));
                  mc.setScreen(new EcranMetiers(0));
               }
            }
         }
      }
   }

   @EventBusSubscriber(
      modid = "cubelandmetiers",
      value = {Dist.CLIENT},
      bus = Bus.MOD
   )
   public static final class Enregistrement {
      private Enregistrement() {
      }

      @SubscribeEvent
      public static void toucher(RegisterKeyMappingsEvent e) {
         e.register(Touches.PANNEAU);
      }
   }
}
