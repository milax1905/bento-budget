package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.client.EtatClient;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

/** Le serveur demande au client d'ouvrir le panneau sur un onglet. */
public record PaquetOuvrir(int onglet) {
   public static void ecrire(PaquetOuvrir p, FriendlyByteBuf b) {
      b.writeVarInt(p.onglet);
   }

   public static PaquetOuvrir lire(FriendlyByteBuf b) {
      return new PaquetOuvrir(b.readVarInt());
   }

   public static void traiter(PaquetOuvrir p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.ouvrirPanneau(p.onglet())));
      ctx.get().setPacketHandled(true);
   }
}
