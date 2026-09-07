package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.client.EtatClient;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

public record PaquetRepas(String plat, String effet, int qualite, int secondes) {
   public static void ecrire(PaquetRepas p, FriendlyByteBuf t) {
      t.writeUtf(p.plat, 128);
      t.writeUtf(p.effet, 128);
      t.writeVarInt(p.qualite);
      t.writeVarInt(p.secondes);
   }

   public static PaquetRepas lire(FriendlyByteBuf t) {
      return new PaquetRepas(t.readUtf(128), t.readUtf(128), t.readVarInt(), t.readVarInt());
   }

   public static void traiter(PaquetRepas p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoirRepas(p)));
      ctx.get().setPacketHandled(true);
   }
}
