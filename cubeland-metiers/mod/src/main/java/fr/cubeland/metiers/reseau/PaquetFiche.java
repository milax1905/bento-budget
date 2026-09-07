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

public record PaquetFiche(String plat, List<Recettes.Facon> facons, List<String> utileA) {
   public static void ecrire(PaquetFiche p, FriendlyByteBuf t) {
      t.writeUtf(p.plat, 200);
      t.writeVarInt(p.utileA.size());

      for (String u : p.utileA) {
         t.writeUtf(u, 200);
      }

      t.writeVarInt(p.facons.size());

      for (Recettes.Facon f : p.facons) {
         t.writeUtf(f.type(), 200);
         t.writeVarInt(f.rendement());
         t.writeVarInt(f.ingredients().size());

         for (int i = 0; i < f.ingredients().size(); i++) {
            t.writeUtf(f.ingredients().get(i), 200);
            t.writeVarInt(f.combien().get(i));
         }
      }
   }

   public static PaquetFiche lire(FriendlyByteBuf t) {
      String plat = t.readUtf(200);
      int nu = t.readVarInt();
      List<String> utileA = new ArrayList<>(nu);

      for (int i = 0; i < nu; i++) {
         utileA.add(t.readUtf(200));
      }

      int n = t.readVarInt();
      List<Recettes.Facon> facons = new ArrayList<>(n);

      for (int i = 0; i < n; i++) {
         String type = t.readUtf(200);
         int rendement = t.readVarInt();
         int ni = t.readVarInt();
         List<String> ing = new ArrayList<>(ni);
         List<Integer> cb = new ArrayList<>(ni);

         for (int k = 0; k < ni; k++) {
            ing.add(t.readUtf(200));
            cb.add(t.readVarInt());
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
