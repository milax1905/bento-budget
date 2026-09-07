package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Recettes;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.Item;
import net.minecraftforge.network.NetworkEvent.Context;
import net.minecraftforge.registries.ForgeRegistries;

public record PaquetDemandeFiche(String plat) {
   public static void ecrire(PaquetDemandeFiche p, FriendlyByteBuf t) {
      t.writeUtf(p.plat, 200);
   }

   public static PaquetDemandeFiche lire(FriendlyByteBuf t) {
      return new PaquetDemandeFiche(t.readUtf(200));
   }

   public static void traiter(PaquetDemandeFiche p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> {
         ServerPlayer joueur = ctx.get().getSender();
         if (joueur != null) {
            ResourceLocation rl = ResourceLocation.tryParse(p.plat());
            if (rl != null) {
               Item item = (Item)ForgeRegistries.ITEMS.getValue(rl);
               Plat plat = Catalogue.de(item);
               if (plat != null) {
                  Reseau.versJoueur(joueur, new PaquetFiche(p.plat(), Recettes.pour(joueur.server, item), Recettes.utileA(joueur.server, item)));
               }
            }
         }
      });
      ctx.get().setPacketHandled(true);
   }
}
