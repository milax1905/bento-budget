package fr.cubeland.metiers.commande;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.LongArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.cuisine.Vente;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.metier.Metiers;
import fr.cubeland.metiers.metier.PontBoutique;
import fr.cubeland.metiers.quete.Quete;
import fr.cubeland.metiers.quete.Quetes;
import fr.cubeland.metiers.quete.TypeQuete;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetOuvrir;
import fr.cubeland.metiers.reseau.PaquetQuetes;
import fr.cubeland.metiers.reseau.Reseau;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.event.RegisterCommandsEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

/**
 * Les commandes du mod.
 *
 * <pre>
 * /metiers                    ouvre le panneau
 * /metiers cuisine            ouvre le carnet de cuisine
 * /metiers recharger          relit réglages et catalogue (op)
 * /metiers reprendre          reprend l'XP de la boutique (op)
 * /metiers xp joueur métier n donne de l'XP (op)
 * /cuisinier                  ouvre le carnet de cuisine
 * /cuisinier vendre [tout]    vend le plat en main, ou tous les plats
 * /cuisinier prix             estime le plat en main
 * /cuisinier livrer           livre ce qu'on a pour la commande de livraison
 * /cuisinier palier joueur n  force un palier, 0 pour revenir aux recettes (op)
 * </pre>
 */
@EventBusSubscriber(modid = CubelandMetiers.MODID)
public final class Commandes {
   private static final int OP = 3;

   private Commandes() {
   }

   @SubscribeEvent
   public static void enregistrer(RegisterCommandsEvent e) {
      CommandDispatcher<CommandSourceStack> d = e.getDispatcher();
      d.register(
         Commands.literal("metiers")
            .executes(c -> ouvrir(c.getSource(), 0))
            .then(Commands.literal("cuisine").executes(c -> ouvrir(c.getSource(), 1)))
            .then(Commands.literal("recharger").requires(s -> s.hasPermission(OP)).executes(c -> recharger(c.getSource())))
            .then(Commands.literal("reprendre").requires(s -> s.hasPermission(OP)).executes(c -> reprendre(c.getSource())))
            .then(
               Commands.literal("xp")
                  .requires(s -> s.hasPermission(OP))
                  .then(
                     Commands.argument("joueur", EntityArgument.player())
                        .then(
                           Commands.argument("metier", StringArgumentType.word())
                              .then(
                                 Commands.argument("montant", LongArgumentType.longArg(1L))
                                    .executes(
                                       c -> donnerXp(
                                          c.getSource(),
                                          EntityArgument.getPlayer(c, "joueur"),
                                          StringArgumentType.getString(c, "metier"),
                                          LongArgumentType.getLong(c, "montant")
                                       )
                                    )
                              )
                        )
                  )
            )
      );
      d.register(Commands.literal("cubeland").executes(c -> ouvrir(c.getSource(), 0)).then(Commands.literal("cuisine").executes(c -> ouvrir(c.getSource(), 1))));
      d.register(
         Commands.literal("cuisinier")
            .executes(c -> ouvrir(c.getSource(), 1))
            .then(Commands.literal("vendre").executes(c -> vendre(c.getSource())).then(Commands.literal("tout").executes(c -> vendreTout(c.getSource()))))
            .then(Commands.literal("prix").executes(c -> prix(c.getSource())))
            .then(Commands.literal("livrer").executes(c -> livrer(c.getSource())))
            .then(
               Commands.literal("palier")
                  .requires(s -> s.hasPermission(OP))
                  .then(
                     Commands.argument("joueur", EntityArgument.player())
                        .then(
                           Commands.argument("palier", IntegerArgumentType.integer(0, 5))
                              .executes(c -> forcerPalier(c.getSource(), EntityArgument.getPlayer(c, "joueur"), IntegerArgumentType.getInteger(c, "palier")))
                        )
                  )
            )
      );
   }

   private static int ouvrir(CommandSourceStack src, int onglet) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
      Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
      Reseau.versJoueur(joueur, PaquetCuisine.pour(joueur, donnees));
      Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
      Reseau.versJoueur(joueur, new PaquetOuvrir(onglet));
      return 1;
   }

   private static int vendre(CommandSourceStack src) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      ItemStack pile = joueur.getMainHandItem();
      Plat plat = Catalogue.de(pile);
      if (plat == null) {
         src.sendFailure(Component.translatable("cubelandmetiers.cmd.tenir_plat"));
         return 0;
      }
      if (Qualite.horsPalier(pile)) {
         src.sendFailure(Component.translatable("cubelandmetiers.cmd.hors_palier"));
         return 0;
      }
      int q = Math.max(1, Qualite.de(pile));
      int nombre = pile.getCount();
      Vente.Bilan bilan = Vente.vendre(joueur, List.of(pile));
      return conclure(src, joueur, bilan, Component.literal(nombre + " × ").append(plat.nom()).append(" (").append(Qualite.nom(q)).append(")"));
   }

   private static int vendreTout(CommandSourceStack src) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      List<ItemStack> piles = new ArrayList<>(joueur.getInventory().items);
      Vente.Bilan bilan = Vente.vendre(joueur, piles);
      if (bilan == Vente.Bilan.RIEN) {
         src.sendFailure(Component.translatable("cubelandmetiers.cmd.rien_a_vendre"));
         return 0;
      }
      return conclure(src, joueur, bilan, Component.translatable("cubelandmetiers.cmd.n_plats", bilan == null ? 0 : bilan.plats()));
   }

   private static int conclure(CommandSourceStack src, ServerPlayer joueur, Vente.Bilan bilan, Component quoi) {
      if (bilan == null) {
         src.sendFailure(Component.translatable("cubelandmetiers.cmd.boutique_muette"));
         return 0;
      }
      if (bilan == Vente.Bilan.RIEN) {
         src.sendFailure(Component.translatable("cubelandmetiers.cmd.rien_a_vendre"));
         return 0;
      }
      Component message = Component.translatable("cubelandmetiers.cmd.vendu", quoi, Component.literal(bilan.net() + " P").withStyle(ChatFormatting.GOLD)).withStyle(ChatFormatting.GRAY);
      if (bilan.commission() > 0L) {
         message = message.copy().append(Component.translatable("cubelandmetiers.cmd.commission", bilan.commission()).withStyle(ChatFormatting.DARK_GRAY));
      }
      src.sendSuccess(message, false);
      Quetes.surVente(joueur, DonneesMetiers.de(joueur.server));
      return 1;
   }

   private static int prix(CommandSourceStack src) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      ItemStack pile = joueur.getMainHandItem();
      Plat plat = Catalogue.de(pile);
      if (plat == null) {
         src.sendFailure(Component.translatable("cubelandmetiers.cmd.tenir_plat"));
         return 0;
      }
      int q = Math.max(1, Qualite.de(pile));
      long unite = Qualite.prix(plat, q);
      src.sendSuccess(
         plat.nom().copy()
            .append(" · ")
            .append(Qualite.nom(q).copy().withStyle(Qualite.couleur(q)))
            .append(Component.translatable("cubelandmetiers.cmd.prix", unite, unite * pile.getCount()).withStyle(ChatFormatting.GRAY)),
         false
      );
      return 1;
   }

   private static int livrer(CommandSourceStack src) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
      Quete livraison = null;
      for (Quete q : Quetes.assurer(joueur, donnees)) {
         if (q.type() == TypeQuete.LIVRAISON) {
            livraison = q;
         }
      }
      if (livraison == null) {
         src.sendFailure(Component.translatable("cubelandmetiers.cmd.pas_de_livraison"));
         return 0;
      }
      int pris = Quetes.livrer(joueur, donnees, livraison.id());
      if (pris == 0) {
         src.sendFailure(Component.translatable("cubelandmetiers.msg.rien_a_livrer"));
         return 0;
      }
      src.sendSuccess(Component.translatable("cubelandmetiers.msg.livre", pris).withStyle(ChatFormatting.GREEN), false);
      Reseau.versJoueur(joueur, PaquetCuisine.pour(joueur, donnees));
      return 1;
   }

   private static int recharger(CommandSourceStack src) {
      CubelandMetiers.recharger(src.getServer());
      src.sendSuccess(
         Component.translatable("cubelandmetiers.cmd.recharge", CubelandMetiers.version(), Catalogue.nombre(), Metiers.tous().size()).withStyle(ChatFormatting.GREEN), true
      );
      return 1;
   }

   private static int reprendre(CommandSourceStack src) {
      if (src.getServer() == null) {
         return 0;
      }
      DonneesMetiers donnees = DonneesMetiers.de(src.getServer());
      int n = PontBoutique.importer(src.getServer(), donnees);
      donnees.marquerImport();
      src.sendSuccess(Component.translatable("cubelandmetiers.cmd.repris", n).withStyle(ChatFormatting.GREEN), true);
      return 1;
   }

   private static int donnerXp(CommandSourceStack src, ServerPlayer cible, String metier, long montant) {
      if (!Metiers.existe(metier)) {
         src.sendFailure(Component.translatable("cubelandmetiers.cmd.metier_inconnu", metier, String.join(", ", Metiers.tous())));
         return 0;
      }
      DonneesMetiers donnees = DonneesMetiers.de(cible.server);
      donnees.ajouter(cible.getUUID(), metier, montant);
      Reseau.versJoueur(cible, PaquetEtat.pour(cible, donnees));
      src.sendSuccess(Component.translatable("cubelandmetiers.cmd.xp_donnee", montant, Metiers.nom(metier), cible.getGameProfile().getName()), true);
      return 1;
   }

   private static int forcerPalier(CommandSourceStack src, ServerPlayer cible, int palier) {
      DonneesMetiers donnees = DonneesMetiers.de(cible.server);
      donnees.forcerPalier(cible.getUUID(), palier);
      Reseau.versJoueur(cible, PaquetEtat.pour(cible, donnees));
      Reseau.versJoueur(cible, PaquetCuisine.pour(cible, donnees));
      src.sendSuccess(Component.translatable("cubelandmetiers.cmd.palier_force", cible.getGameProfile().getName(), donnees.palier(cible.getUUID())), true);
      return 1;
   }
}
