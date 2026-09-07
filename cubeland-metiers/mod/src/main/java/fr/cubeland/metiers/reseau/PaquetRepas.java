package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.client.EtatClient;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

/** Le joueur vient de manger un plat : le HUD affiche l'effet qui court. */
public record PaquetRepas(String plat, int qualite, int secondes) {
   public static void ecrire(PaquetRepas p, FriendlyByteBuf b) {
      b.writeUtf(p.plat, 200);
      b.writeVarInt(p.qualite);
      b.writeVarInt(p.secondes);
   }

   public static PaquetRepas lire(FriendlyByteBuf b) {
      return new PaquetRepas(b.readUtf(200), b.readVarInt(), b.readVarInt());
   }

   public static void traiter(PaquetRepas p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoirRepas(p)));
      ctx.get().setPacketHandled(true);
   }
}
