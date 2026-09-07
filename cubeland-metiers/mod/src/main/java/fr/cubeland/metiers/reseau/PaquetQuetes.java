package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.quete.Quete;
import fr.cubeland.metiers.quete.Quetes;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

/** Les commandes en cours du joueur et l'avancement de ses premiers pas. */
public record PaquetQuetes(List<Quete> quetes, int premiersPas) {
   public static PaquetQuetes pour(ServerPlayer joueur, DonneesMetiers donnees) {
      return new PaquetQuetes(Quetes.assurer(joueur, donnees), donnees.premiersPas(joueur.getUUID()));
   }

   public static void ecrire(PaquetQuetes p, FriendlyByteBuf b) {
      b.writeVarInt(p.quetes.size());
      for (Quete q : p.quetes) {
         q.ecrire(b);
      }
      b.writeVarInt(p.premiersPas);
   }

   public static PaquetQuetes lire(FriendlyByteBuf b) {
      int n = b.readVarInt();
      List<Quete> l = new ArrayList<>(n);
      for (int i = 0; i < n; i++) {
         l.add(Quete.lire(b));
      }
      return new PaquetQuetes(l, b.readVarInt());
   }

   public static void traiter(PaquetQuetes p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoirQuetes(p)));
      ctx.get().setPacketHandled(true);
   }
}
