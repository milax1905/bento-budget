package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.client.EtatClient;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

public record PaquetAnnonce(String titre, String sous, int genre) {
   public static final int DECOUVERTE = 0;
   public static final int PALIER = 1;
   public static final int NIVEAU = 2;

   public static void ecrire(PaquetAnnonce p, FriendlyByteBuf t) {
      t.writeUtf(p.titre, 128);
      t.writeUtf(p.sous, 160);
      t.writeVarInt(p.genre);
   }

   public static PaquetAnnonce lire(FriendlyByteBuf t) {
      return new PaquetAnnonce(t.readUtf(128), t.readUtf(160), t.readVarInt());
   }

   public static void traiter(PaquetAnnonce p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoirAnnonce(p)));
      ctx.get().setPacketHandled(true);
   }
}
