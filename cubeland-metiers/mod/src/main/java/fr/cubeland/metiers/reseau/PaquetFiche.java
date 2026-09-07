package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.cuisine.Recettes;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

/** La fiche d'un plat : jusqu'à trois façons de le faire, et les plats où il entre. */
public record PaquetFiche(String plat, List<Recettes.Facon> facons, List<String> utileA) {
   public static void ecrire(PaquetFiche p, FriendlyByteBuf b) {
      b.writeUtf(p.plat, 200);
      b.writeVarInt(p.utileA.size());
      for (String u : p.utileA) {
         b.writeUtf(u, 200);
      }
      b.writeVarInt(p.facons.size());
      for (Recettes.Facon f : p.facons) {
         b.writeUtf(f.type(), 200);
         b.writeVarInt(f.rendement());
         b.writeVarInt(f.ingredients().size());
         for (int i = 0; i < f.ingredients().size(); i++) {
            b.writeUtf(f.ingredients().get(i), 200);
            b.writeVarInt(f.combien().get(i));
         }
      }
   }

   public static PaquetFiche lire(FriendlyByteBuf b) {
      String plat = b.readUtf(200);
      int nu = b.readVarInt();
      List<String> utileA = new ArrayList<>(nu);
      for (int i = 0; i < nu; i++) {
         utileA.add(b.readUtf(200));
      }
      int n = b.readVarInt();
      List<Recettes.Facon> facons = new ArrayList<>(n);
      for (int i = 0; i < n; i++) {
         String type = b.readUtf(200);
         int rendement = b.readVarInt();
         int ni = b.readVarInt();
         List<String> ing = new ArrayList<>(ni);
         List<Integer> cb = new ArrayList<>(ni);
         for (int k = 0; k < ni; k++) {
            ing.add(b.readUtf(200));
            cb.add(b.readVarInt());
         }
         facons.add(new Recettes.Facon(type, ing, cb, rendement));
      }
      return new PaquetFiche(plat, facons, utileA);
   }

   public static void traiter(PaquetFiche p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoirFiche(p)));
      ctx.get().setPacketHandled(true);
   }
}
