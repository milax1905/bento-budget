package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.metier.Metiers;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

public record PaquetEtat(
   List<String> metiers, List<Integer> niveaux, List<Long> xps, int palier, int recettes, int recettesPourSuivant, int catalogue, long solde
) {
   public static PaquetEtat pour(ServerPlayer joueur, DonneesMetiers donnees) {
      List<String> ids = new ArrayList<>();
      List<Integer> niv = new ArrayList<>();
      List<Long> xp = new ArrayList<>();

      for (String m : Metiers.tous()) {
         ids.add(m);
         niv.add(donnees.niveau(joueur.getUUID(), m));
         xp.add(donnees.xp(joueur.getUUID(), m));
      }

      int recettes = donnees.nombreRecettes(joueur.getUUID());
      int palier = Reglages.get().palierPour(recettes);
      int suivant = palier >= 5 ? 0 : Reglages.get().palierRecettes[palier];
      return new PaquetEtat(ids, niv, xp, palier, recettes, suivant, Catalogue.nombre(), 0L);
   }

   public static void ecrire(PaquetEtat p, FriendlyByteBuf tampon) {
      tampon.writeVarInt(p.metiers.size());

      for (int i = 0; i < p.metiers.size(); i++) {
         tampon.writeUtf(p.metiers.get(i), 64);
         tampon.writeVarInt(p.niveaux.get(i));
         tampon.writeVarLong(p.xps.get(i));
      }

      tampon.writeVarInt(p.palier);
      tampon.writeVarInt(p.recettes);
      tampon.writeVarInt(p.recettesPourSuivant);
      tampon.writeVarInt(p.catalogue);
      tampon.writeVarLong(p.solde);
   }

   public static PaquetEtat lire(FriendlyByteBuf tampon) {
      int n = tampon.readVarInt();
      List<String> ids = new ArrayList<>(n);
      List<Integer> niv = new ArrayList<>(n);
      List<Long> xp = new ArrayList<>(n);

      for (int i = 0; i < n; i++) {
         ids.add(tampon.readUtf(64));
         niv.add(tampon.readVarInt());
         xp.add(tampon.readVarLong());
      }

      return new PaquetEtat(ids, niv, xp, tampon.readVarInt(), tampon.readVarInt(), tampon.readVarInt(), tampon.readVarInt(), tampon.readVarLong());
   }

   public static void traiter(PaquetEtat p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoir(p)));
      ctx.get().setPacketHandled(true);
   }

   public int niveauDe(String metier) {
      int i = this.metiers.indexOf(metier);
      return i < 0 ? 0 : this.niveaux.get(i);
   }

   public long xpDe(String metier) {
      int i = this.metiers.indexOf(metier);
      return i < 0 ? 0L : this.xps.get(i);
   }

   public int niveauCuisinier() {
      return this.niveauDe("cuisinier");
   }
}
