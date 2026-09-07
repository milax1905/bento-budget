package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.metier.DonneesMetiers;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent.Context;

public record PaquetDemande(int palier) {
   public static void ecrire(PaquetDemande p, FriendlyByteBuf t) {
      t.writeVarInt(p.palier);
   }

   public static PaquetDemande lire(FriendlyByteBuf t) {
      return new PaquetDemande(t.readVarInt());
   }

   public static void traiter(PaquetDemande p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> {
         ServerPlayer joueur = ctx.get().getSender();
         if (joueur != null) {
            DonneesMetiers donnees = DonneesMetiers.de(joueur.server);
            Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
            Reseau.versJoueur(joueur, PaquetCuisine.pour(joueur, donnees, p.palier()));
         }
      });
      ctx.get().setPacketHandled(true);
   }
}
