package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.cuisine.Catalogue;
import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

/**
 * Réglages et catalogue du serveur, envoyés à la connexion et après
 * {@code /metiers recharger}. Le client n'a plus rien à lire sur son disque.
 */
public record PaquetSync(String reglages, String catalogue) {
   public static PaquetSync courant() {
      return new PaquetSync(Reglages.exporter(), Catalogue.exporter());
   }

   public static void ecrire(PaquetSync p, FriendlyByteBuf b) {
      b.writeByteArray(p.reglages.getBytes(StandardCharsets.UTF_8));
      b.writeByteArray(p.catalogue.getBytes(StandardCharsets.UTF_8));
   }

   public static PaquetSync lire(FriendlyByteBuf b) {
      return new PaquetSync(new String(b.readByteArray(), StandardCharsets.UTF_8), new String(b.readByteArray(), StandardCharsets.UTF_8));
   }

   public static void traiter(PaquetSync p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> {
         Reglages.appliquerDistant(p.reglages());
         Catalogue.appliquerDistant(p.catalogue());
         EtatClient.synchronise();
      }));
      ctx.get().setPacketHandled(true);
   }
}
