package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Recettes;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkEvent.Context;

/** Le client veut la fiche d'un plat : ses façons de faire et à quoi il sert. */
public record PaquetDemandeFiche(String plat) {
   public static void ecrire(PaquetDemandeFiche p, FriendlyByteBuf b) {
      b.writeUtf(p.plat, 200);
   }

   public static PaquetDemandeFiche lire(FriendlyByteBuf b) {
      return new PaquetDemandeFiche(b.readUtf(200));
   }

   public static void traiter(PaquetDemandeFiche p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> {
         ServerPlayer joueur = ctx.get().getSender();
         Plat plat = Catalogue.parId(p.plat());
         if (joueur != null && plat != null) {
            Reseau.versJoueur(joueur, new PaquetFiche(p.plat(), Recettes.pour(joueur.server, plat.item()), Recettes.utileA(joueur.server, plat.item())));
         }
      });
      ctx.get().setPacketHandled(true);
   }
}
