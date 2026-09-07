package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.metier.DonneesMetiers;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent.Context;

/** Le client demande son état complet (ouverture du panneau). */
public record PaquetDemande() {
   public static void ecrire(PaquetDemande p, FriendlyByteBuf b) {
   }

   public static PaquetDemande lire(FriendlyByteBuf b) {
      return new PaquetDemande();
   }

   public static void traiter(PaquetDemande p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> {
         ServerPlayer joueur = ctx.get().getSender();
         if (joueur != null) {
            DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
            Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
            Reseau.versJoueur(joueur, PaquetCuisine.pour(joueur, donnees));
            Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
         }
      });
      ctx.get().setPacketHandled(true);
   }
}
