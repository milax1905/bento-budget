package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.Reseau;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.TickEvent.Phase;
import net.minecraftforge.event.TickEvent.PlayerTickEvent;
import net.minecraftforge.event.entity.living.LivingEntityUseItemEvent.Finish;
import net.minecraftforge.event.entity.player.ItemTooltipEvent;
import net.minecraftforge.event.entity.player.PlayerEvent.ItemCraftedEvent;
import net.minecraftforge.event.entity.player.PlayerInteractEvent.RightClickBlock;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

@EventBusSubscriber(
   modid = "cubelandmetiers"
)
public final class EvenementsCuisine {
   private static final int PERIODE = 10;

   private EvenementsCuisine() {
   }

   @SubscribeEvent
   public static void inventaire(PlayerTickEvent e) {
      if (e.phase == Phase.END) {
         if (e.player instanceof ServerPlayer joueur) {
            if (joueur.tickCount % 10 == 0) {
               if (Catalogue.nombre() != 0) {
                  DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
                  boolean change = false;

                  for (ItemStack pile : joueur.getInventory().items) {
                     change |= Cuisine.marquerFrais(joueur, pile, donnees);
                  }

                  for (ItemStack pile : joueur.getInventory().offhand) {
                     change |= Cuisine.marquerFrais(joueur, pile, donnees);
                  }

                  if (change) {
                     Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
                  }
               }
            }
         }
      }
   }

   @SubscribeEvent
   public static void toucherUnPoste(RightClickBlock e) {
      if (!e.getLevel().isClientSide()) {
         if (e.getEntity() instanceof ServerPlayer joueur) {
            if (Postes.estUnPoste(e.getLevel().getBlockState(e.getPos()))) {
               Postes.toucher(joueur.getUUID());
            }
         }
      }
   }

   @SubscribeEvent
   public static void manger(Finish e) {
      if (e.getEntity() instanceof ServerPlayer joueur) {
         Cuisine.servir(joueur, e.getItem());
      }
   }

   @SubscribeEvent(
      priority = EventPriority.HIGH
   )
   public static void fabriquer(ItemCraftedEvent e) {
      if (e.getEntity() instanceof ServerPlayer joueur) {
         Plat plat = Catalogue.de(e.getCrafting());
         if (plat != null) {
            Postes.toucher(joueur.getUUID());
            if (Reglages.get().bloquerFabricationHorsPalier) {
               DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
               if (plat.palier() > donnees.palier(joueur.getUUID())) {
                  e.getCrafting().setCount(0);
                  joueur.displayClientMessage(
                     Component.literal("Ce plat demande le palier " + plat.palier() + ". Tu es au palier " + donnees.palier(joueur.getUUID()) + ".")
                        .withStyle(ChatFormatting.RED),
                     true
                  );
               }
            }
         }
      }
   }

   @SubscribeEvent
   public static void infobulle(ItemTooltipEvent e) {
      Plat plat = Catalogue.de(e.getItemStack());
      if (plat != null) {
         int q = Qualite.de(e.getItemStack());
         if (q > 0) {
            e.getToolTip().add(Component.literal(Qualite.nom(q) + "  " + etoiles(q)).withStyle(Qualite.couleur(q)));
         }

         e.getToolTip().add(Component.literal("Palier " + plat.palier() + " · " + plat.famille().nom()).withStyle(ChatFormatting.DARK_GRAY));
         e.getToolTip().add(Component.literal("Sert a " + plat.famille().sert().toLowerCase()).withStyle(ChatFormatting.DARK_GRAY));
         if (Qualite.horsPalier(e.getItemStack())) {
            e.getToolTip().add(Component.literal("Cuisine hors palier : sans effet").withStyle(ChatFormatting.RED));
         } else if (q > 0) {
            e.getToolTip()
               .add(Component.literal("Effet " + Qualite.dureeEffet(q) + " s  ·  " + Qualite.prix(plat, q) + " P").withStyle(ChatFormatting.DARK_GRAY));
         }

         String auteur = Qualite.auteur(e.getItemStack());
         if (!auteur.isEmpty()) {
            e.getToolTip().add(Component.literal("Cuisine par " + auteur).withStyle(ChatFormatting.DARK_GRAY));
         }
      }
   }

   private static String etoiles(int q) {
      StringBuilder b = new StringBuilder();

      for (int i = 0; i < 5; i++) {
         b.append((char)(i < q ? '★' : '☆'));
      }

      return b.toString();
   }

   public static int couteauDe(Player joueur) {
      return Couteaux.palierDuJoueur(joueur);
   }
}
