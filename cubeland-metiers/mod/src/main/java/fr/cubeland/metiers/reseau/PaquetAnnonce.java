package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.client.EtatClient;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.chat.Component;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

/** Un bandeau en haut de l'écran : découverte, palier, niveau, commande remplie. */
public record PaquetAnnonce(Component titre, Component sous, int genre) {
   public static final int DECOUVERTE = 0;
   public static final int PALIER = 1;
   public static final int NIVEAU = 2;
   public static final int COMMANDE = 3;

   public static void ecrire(PaquetAnnonce p, FriendlyByteBuf b) {
      b.writeComponent(p.titre);
      b.writeComponent(p.sous);
      b.writeVarInt(p.genre);
   }

   public static PaquetAnnonce lire(FriendlyByteBuf b) {
      return new PaquetAnnonce(b.readComponent(), b.readComponent(), b.readVarInt());
   }

   public static void traiter(PaquetAnnonce p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoirAnnonce(p)));
      ctx.get().setPacketHandled(true);
   }
}
