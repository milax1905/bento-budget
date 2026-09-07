package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.quete.Quetes;
import java.util.function.Supplier;
import net.minecraft.ChatFormatting;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent.Context;

/** Le joueur livre, depuis le panneau, ce qu'il a pour cette commande. */
public record PaquetLivrer(String quete) {
   public static void ecrire(PaquetLivrer p, FriendlyByteBuf b) {
      b.writeUtf(p.quete, 64);
   }

   public static PaquetLivrer lire(FriendlyByteBuf b) {
      return new PaquetLivrer(b.readUtf(64));
   }

   public static void traiter(PaquetLivrer p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> {
         ServerPlayer joueur = ctx.get().getSender();
         if (joueur == null) {
            return;
         }
         DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
         int pris = Quetes.livrer(joueur, donnees, p.quete());
         if (pris == 0) {
            joueur.displayClientMessage(Component.translatable("cubelandmetiers.msg.rien_a_livrer").withStyle(ChatFormatting.GRAY), true);
         } else {
            joueur.displayClientMessage(Component.translatable("cubelandmetiers.msg.livre", pris).withStyle(ChatFormatting.GREEN), true);
         }
         Reseau.versJoueur(joueur, PaquetCuisine.pour(joueur, donnees));
         Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
      });
      ctx.get().setPacketHandled(true);
   }
}
