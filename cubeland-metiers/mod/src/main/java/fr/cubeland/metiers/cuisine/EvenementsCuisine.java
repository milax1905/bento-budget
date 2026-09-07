package fr.cubeland.metiers.cuisine;

import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.quete.Quetes;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.Reseau;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.TickEvent.Phase;
import net.minecraftforge.event.TickEvent.PlayerTickEvent;
import net.minecraftforge.event.entity.living.LivingEntityUseItemEvent;
import net.minecraftforge.event.entity.player.EntityItemPickupEvent;
import net.minecraftforge.event.entity.player.ItemTooltipEvent;
import net.minecraftforge.event.entity.player.PlayerContainerEvent;
import net.minecraftforge.event.entity.player.PlayerEvent;
import net.minecraftforge.event.entity.player.PlayerInteractEvent.RightClickBlock;
import net.minecraftforge.eventbus.api.EventPriority;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

/** Les événements qui font vivre la cuisine côté serveur, et l'infobulle côté client. */
@EventBusSubscriber(modid = CubelandMetiers.MODID)
public final class EvenementsCuisine {
   private static final int PERIODE_INVENTAIRE = 10;
   private static final int PERIODE_COMMANDES = 100;

   private EvenementsCuisine() {
   }

   /** Toutes les demi-secondes : marque les plats que le serveur n'a pas encore vus. */
   @SubscribeEvent
   public static void inventaire(PlayerTickEvent e) {
      if (e.phase != Phase.END || !(e.player instanceof ServerPlayer joueur)) {
         return;
      }
      if (joueur.tickCount % PERIODE_COMMANDES == 0 && Catalogue.pret()) {
         Quetes.tick(joueur, DonneesMetiers.de(joueur.server));
      }
      if (joueur.tickCount % PERIODE_INVENTAIRE != 0 || !Catalogue.pret()) {
         return;
      }
      DonneesMetiers donnees = null;
      String origine = null;
      boolean change = false;
      for (ItemStack pile : joueur.getInventory().items) {
         if (Catalogue.estUnPlat(pile) && !Qualite.marque(pile)) {
            if (donnees == null) {
               donnees = DonneesMetiers.de(joueur.server);
               origine = Provenance.origineProbable(joueur);
            }
            change |= Cuisine.traiterNouveau(joueur, pile, donnees, origine);
         }
      }
      for (ItemStack pile : joueur.getInventory().offhand) {
         if (Catalogue.estUnPlat(pile) && !Qualite.marque(pile)) {
            if (donnees == null) {
               donnees = DonneesMetiers.de(joueur.server);
               origine = Provenance.origineProbable(joueur);
            }
            change |= Cuisine.traiterNouveau(joueur, pile, donnees, origine);
         }
      }
      if (change) {
         Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
      }
   }

   /** Un clic sur un poste : on retient que le joueur y travaille (poêle, feu de camp rendent le plat en main). */
   @SubscribeEvent
   public static void toucherUnPoste(RightClickBlock e) {
      if (e.getLevel().isClientSide || !(e.getEntity() instanceof ServerPlayer joueur)) {
         return;
      }
      if (Postes.estUnPoste(e.getLevel().getBlockState(e.getPos()))) {
         Provenance.noterProduction(joueur);
         if (Catalogue.pret()) {
            Quetes.surPoste(joueur, DonneesMetiers.de(joueur.server));
         }
      }
   }

   /** Établi, et tout ce qui passe par l'événement de fabrication. */
   @SubscribeEvent(priority = EventPriority.HIGH)
   public static void fabriquer(PlayerEvent.ItemCraftedEvent e) {
      if (!(e.getEntity() instanceof ServerPlayer joueur)) {
         return;
      }
      Plat plat = Catalogue.de(e.getCrafting());
      if (plat == null) {
         return;
      }
      Provenance.noterProduction(joueur);
      if (Reglages.get().bloquerFabricationHorsPalier) {
         DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
         if (!donnees.aPortee(joueur.getUUID(), plat)) {
            e.getCrafting().setCount(0);
            joueur.displayClientMessage(
               Component.translatable("cubelandmetiers.msg.fabrication_bloquee", plat.palier(), donnees.palier(joueur.getUUID())).withStyle(ChatFormatting.RED), true
            );
            return;
         }
      }
      Cuisine.produit(joueur, e.getCrafting());
   }

   /** Four, fumoir, haut fourneau. */
   @SubscribeEvent
   public static void cuire(PlayerEvent.ItemSmeltedEvent e) {
      if (e.getEntity() instanceof ServerPlayer joueur && Catalogue.estUnPlat(e.getSmelting())) {
         Provenance.noterProduction(joueur);
         Cuisine.produit(joueur, e.getSmelting());
      }
   }

   /** Marmite, bouilloire, tonneau : ce qu'on sort d'un menu de cuisine vient d'un atelier. */
   @SubscribeEvent
   public static void fermerMenu(PlayerContainerEvent.Close e) {
      if (e.getEntity() instanceof ServerPlayer joueur && Provenance.menuDeCuisine(e.getContainer())) {
         Provenance.noterProduction(joueur);
      }
   }

   /** Planche à découper, feu de camp : le plat tombe au sol à côté du poste. */
   @SubscribeEvent
   public static void ramasser(EntityItemPickupEvent e) {
      if (!(e.getEntity() instanceof ServerPlayer joueur)) {
         return;
      }
      ItemEntity entite = e.getItem();
      ItemStack pile = entite.getItem();
      if (Catalogue.estUnPlat(pile) && !Qualite.marque(pile) && Postes.pres(entite.level, entite.blockPosition())) {
         Cuisine.produit(joueur, pile);
      }
   }

   @SubscribeEvent
   public static void manger(LivingEntityUseItemEvent.Finish e) {
      if (e.getEntity() instanceof ServerPlayer joueur) {
         Cuisine.servir(joueur, e.getItem());
      }
   }

   @SubscribeEvent
   public static void depart(PlayerEvent.PlayerLoggedOutEvent e) {
      Provenance.oublier(e.getEntity().getUUID());
   }

   /** L'infobulle d'un plat, composée chez le client dans sa langue. */
   @SubscribeEvent
   public static void infobulle(ItemTooltipEvent e) {
      Plat plat = Catalogue.de(e.getItemStack());
      if (plat == null) {
         return;
      }
      ItemStack pile = e.getItemStack();
      int q = Qualite.de(pile);
      if (q > 0) {
         e.getToolTip().add(Qualite.nom(q).copy().append("  " + Qualite.etoiles(q)).withStyle(Qualite.couleur(q)));
      }
      e.getToolTip().add(Component.translatable("cubelandmetiers.bulle.palier_famille", plat.palier(), plat.famille().nom()).withStyle(ChatFormatting.DARK_GRAY));
      e.getToolTip().add(Component.translatable("cubelandmetiers.bulle.sert", plat.famille().sert()).withStyle(ChatFormatting.DARK_GRAY));
      if (Qualite.horsPalier(pile)) {
         e.getToolTip().add(Component.translatable("cubelandmetiers.bulle.hors_palier").withStyle(ChatFormatting.RED));
      } else if (q > 0) {
         e.getToolTip().add(Component.translatable("cubelandmetiers.bulle.effet_prix", Qualite.dureeEffet(q), Qualite.prix(plat, q)).withStyle(ChatFormatting.DARK_GRAY));
      }
      String auteur = Qualite.auteur(pile);
      if (!auteur.isEmpty()) {
         e.getToolTip().add(Component.translatable("cubelandmetiers.bulle.auteur", auteur).withStyle(ChatFormatting.DARK_GRAY));
      } else if (Qualite.marque(pile) && !Qualite.cuisine(pile)) {
         e.getToolTip().add(Component.translatable("cubelandmetiers.bulle.ailleurs").withStyle(ChatFormatting.DARK_GRAY));
      }
   }
}
