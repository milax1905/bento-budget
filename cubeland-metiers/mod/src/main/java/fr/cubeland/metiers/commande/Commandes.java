package fr.cubeland.metiers.commande;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.LongArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.metier.Metiers;
import fr.cubeland.metiers.metier.PontBoutique;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetOuvrir;
import fr.cubeland.metiers.reseau.Reseau;
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

@EventBusSubscriber(
   modid = "cubelandmetiers"
)
public final class Commandes {
   private Commandes() {
   }

   @SubscribeEvent
   public static void enregistrer(RegisterCommandsEvent e) {
      CommandDispatcher<CommandSourceStack> d = e.getDispatcher();
      d.register(
         (LiteralArgumentBuilder)((LiteralArgumentBuilder)((LiteralArgumentBuilder)((LiteralArgumentBuilder)((LiteralArgumentBuilder)Commands.literal(
                           "metiers"
                        )
                        .executes(c -> ouvrir((CommandSourceStack)c.getSource(), 0)))
                     .then(Commands.literal("cuisine").executes(c -> ouvrir((CommandSourceStack)c.getSource(), 1))))
                  .then(
                     ((LiteralArgumentBuilder)Commands.literal("recharger").requires(s -> s.hasPermission(3)))
                        .executes(c -> recharger((CommandSourceStack)c.getSource()))
                  ))
               .then(
                  ((LiteralArgumentBuilder)Commands.literal("reprendre").requires(s -> s.hasPermission(3)))
                     .executes(c -> reprendre((CommandSourceStack)c.getSource()))
               ))
            .then(
               ((LiteralArgumentBuilder)Commands.literal("xp").requires(s -> s.hasPermission(3)))
                  .then(
                     Commands.argument("joueur", EntityArgument.player())
                        .then(
                           Commands.argument("metier", StringArgumentType.word())
                              .then(
                                 Commands.argument("montant", LongArgumentType.longArg())
                                    .executes(
                                       c -> donnerXp(
                                             (CommandSourceStack)c.getSource(),
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
      d.register(
         (LiteralArgumentBuilder)((LiteralArgumentBuilder)Commands.literal("cubeland").executes(c -> ouvrir((CommandSourceStack)c.getSource(), 0)))
            .then(Commands.literal("cuisine").executes(c -> ouvrir((CommandSourceStack)c.getSource(), 1)))
      );
      d.register(
         (LiteralArgumentBuilder)((LiteralArgumentBuilder)((LiteralArgumentBuilder)((LiteralArgumentBuilder)Commands.literal("cuisinier")
                     .executes(c -> ouvrir((CommandSourceStack)c.getSource(), 1)))
                  .then(
                     ((LiteralArgumentBuilder)Commands.literal("vendre").executes(c -> vendre((CommandSourceStack)c.getSource())))
                        .then(Commands.literal("tout").executes(c -> vendreTout((CommandSourceStack)c.getSource())))
                  ))
               .then(Commands.literal("prix").executes(c -> prix((CommandSourceStack)c.getSource()))))
            .then(
               ((LiteralArgumentBuilder)Commands.literal("palier").requires(s -> s.hasPermission(3)))
                  .then(
                     Commands.argument("joueur", EntityArgument.player())
                        .then(
                           Commands.argument("palier", IntegerArgumentType.integer(1, 5))
                              .executes(
                                 c -> forcerPalier(
                                       (CommandSourceStack)c.getSource(), EntityArgument.getPlayer(c, "joueur"), IntegerArgumentType.getInteger(c, "palier")
                                    )
                              )
                        )
                  )
            )
      );
   }

   private static int ouvrir(CommandSourceStack src, int onglet) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
      Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
      Reseau.versJoueur(joueur, new PaquetOuvrir(onglet));
      return 1;
   }

   private static int vendre(CommandSourceStack src) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      ItemStack pile = joueur.getMainHandItem();
      Plat plat = Catalogue.de(pile);
      if (plat == null) {
         src.sendFailure(Component.literal("Tiens le plat a vendre dans ta main principale."));
         return 0;
      } else if (Qualite.horsPalier(pile)) {
         src.sendFailure(Component.literal("Ce plat a ete cuisine hors palier : personne n'en veut."));
         return 0;
      } else {
         int q = Math.max(1, Qualite.de(pile));
         int nombre = pile.getCount();
         long unite = Qualite.prix(plat, q);
         long brut = unite * (long)nombre;
         long commission = brut * (long)Math.max(0, Reglages.get().commissionVente) / 100L;
         long net = Math.max(0L, brut - commission);
         if (!PontBoutique.crediter(joueur.server, joueur.getUUID(), net)) {
            src.sendFailure(Component.literal("La boutique ne repond pas : vente annulee."));
            return 0;
         } else {
            pile.setCount(0);
            src.sendSuccess(
               Component.literal("Vendu ")
                  .append(Component.literal(nombre + " × " + plat.nom()).withStyle(ChatFormatting.WHITE))
                  .append(Component.literal(" (" + Qualite.nom(q) + ") pour "))
                  .append(Component.literal(net + " P").withStyle(ChatFormatting.GOLD))
                  .append(Component.literal(commission > 0L ? "  — commission " + commission + " P" : ""))
                  .withStyle(ChatFormatting.GRAY),
               false
            );
            return 1;
         }
      }
   }

   private static int prix(CommandSourceStack src) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      ItemStack pile = joueur.getMainHandItem();
      Plat plat = Catalogue.de(pile);
      if (plat == null) {
         src.sendFailure(Component.literal("Tiens un plat dans ta main principale."));
         return 0;
      } else {
         int q = Math.max(1, Qualite.de(pile));
         src.sendSuccess(
            Component.literal(plat.nom() + " · ")
               .append(Component.literal(Qualite.nom(q)).withStyle(Qualite.couleur(q)))
               .append(
                  Component.literal(" · " + Qualite.prix(plat, q) + " P l'unite, " + Qualite.prix(plat, q) * (long)pile.getCount() + " P la pile")
                     .withStyle(ChatFormatting.GRAY)
               ),
            false
         );
         return 1;
      }
   }

   private static int vendreTout(CommandSourceStack src) throws CommandSyntaxException {
      ServerPlayer joueur = src.getPlayerOrException();
      long brut = 0L;
      int plats = 0;

      for (ItemStack pile : joueur.getInventory().items) {
         Plat plat = Catalogue.de(pile);
         if (plat != null && !Qualite.horsPalier(pile)) {
            int q = Math.max(1, Qualite.de(pile));
            brut += Qualite.prix(plat, q) * (long)pile.getCount();
            plats += pile.getCount();
            pile.setCount(0);
         }
      }

      if (plats == 0) {
         src.sendFailure(Component.literal("Aucun plat vendable dans ton inventaire."));
         return 0;
      } else {
         long commission = brut * (long)Math.max(0, Reglages.get().commissionVente) / 100L;
         long net = Math.max(0L, brut - commission);
         if (!PontBoutique.crediter(joueur.server, joueur.getUUID(), net)) {
            src.sendFailure(Component.literal("La boutique ne repond pas : rien n'a ete vendu."));
            return 0;
         } else {
            src.sendSuccess(
               Component.literal(plats + " plats vendus pour ")
                  .append(Component.literal(net + " P").withStyle(ChatFormatting.GOLD))
                  .append(Component.literal(commission > 0L ? "  — commission " + commission + " P" : ""))
                  .withStyle(ChatFormatting.GRAY),
               false
            );
            return 1;
         }
      }
   }

   private static int recharger(CommandSourceStack src) {
      Reglages.charger();
      Catalogue.charger();
      src.sendSuccess(
         Component.literal(
               "Cubeland Metiers " + CubelandMetiers.version() + " · recharge : " + Catalogue.nombre() + " plats, " + Metiers.tous().size() + " metiers."
            )
            .withStyle(ChatFormatting.GREEN),
         true
      );
      return 1;
   }

   private static int reprendre(CommandSourceStack src) {
      if (src.getServer() == null) {
         return 0;
      } else {
         DonneesMetiers donnees = DonneesMetiers.de(src.getServer());
         int n = PontBoutique.importer(src.getServer(), donnees);
         donnees.marquerImport();
         src.sendSuccess(Component.literal("Experience reprise depuis la boutique pour " + n + " joueur(s).").withStyle(ChatFormatting.GREEN), true);
         return 1;
      }
   }

   private static int donnerXp(CommandSourceStack src, ServerPlayer cible, String metier, long montant) {
      if (!Metiers.existe(metier)) {
         src.sendFailure(Component.literal("Metier inconnu : " + metier + ". Connus : " + String.join(", ", Metiers.tous())));
         return 0;
      } else {
         DonneesMetiers donnees = DonneesMetiers.de(cible.server);
         donnees.ajouter(cible.getUUID(), metier, montant);
         Reseau.versJoueur(cible, PaquetEtat.pour(cible, donnees));
         src.sendSuccess(Component.literal(montant + " XP " + metier + " pour " + cible.getGameProfile().getName()), true);
         return 1;
      }
   }

   private static int forcerPalier(CommandSourceStack src, ServerPlayer cible, int palier) {
      DonneesMetiers donnees = DonneesMetiers.de(cible.server);
      int besoin = Reglages.get().palierRecettes[Math.max(0, Math.min(4, palier - 1))];
      int actuel = donnees.nombreRecettes(cible.getUUID());
      if (actuel >= besoin) {
         src.sendSuccess(Component.literal(cible.getGameProfile().getName() + " est deja au palier " + donnees.palier(cible.getUUID()) + "."), false);
         return 1;
      } else {
         for (int i = actuel; i < besoin; i++) {
            donnees.decouvrir(cible.getUUID(), "cubelandmetiers:test_" + i);
         }

         donnees.ajouter(cible.getUUID(), "cuisinier", 0L);
         Reseau.versJoueur(cible, PaquetEtat.pour(cible, donnees));
         src.sendSuccess(Component.literal(cible.getGameProfile().getName() + " passe au palier " + donnees.palier(cible.getUUID()) + "."), true);
         return 1;
      }
   }
}
