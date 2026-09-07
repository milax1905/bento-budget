package fr.cubeland.metiers.client;

import com.mojang.blaze3d.platform.InputConstants;
import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.client.ecran.EcranCubeland;
import fr.cubeland.metiers.reseau.PaquetDemande;
import fr.cubeland.metiers.reseau.Reseau;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.settings.KeyConflictContext;
import net.minecraftforge.event.TickEvent.ClientTickEvent;
import net.minecraftforge.event.TickEvent.Phase;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

/** La touche du panneau (J par défaut). */
public final class Touches {
   public static final KeyMapping PANNEAU = new KeyMapping("key.cubelandmetiers.panneau", KeyConflictContext.IN_GAME, InputConstants.Type.KEYSYM, 74, "key.categories.cubelandmetiers");

   private Touches() {
   }

   @EventBusSubscriber(modid = CubelandMetiers.MODID, value = Dist.CLIENT)
   public static final class Ecoute {
      private Ecoute() {
      }

      @SubscribeEvent
      public static void tic(ClientTickEvent e) {
         if (e.phase != Phase.END) {
            return;
         }
         Minecraft mc = Minecraft.getInstance();
         if (mc.player == null || mc.screen != null) {
            return;
         }
         while (PANNEAU.consumeClick()) {
            Reseau.versServeur(new PaquetDemande());
            mc.setScreen(new EcranCubeland(0));
         }
      }
   }
}
