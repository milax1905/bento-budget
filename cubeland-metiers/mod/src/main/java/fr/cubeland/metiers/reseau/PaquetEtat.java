package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.metier.Metier;
import fr.cubeland.metiers.metier.Metiers;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

/** L'état du joueur : niveaux et XP par métier, palier et recettes de cuisine. */
public record PaquetEtat(List<String> metiers, List<Integer> niveaux, List<Long> xps, int palier, int recettes, int recettesPourSuivant) {
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
      int palier = donnees.palier(joueur.getUUID());
      return new PaquetEtat(ids, niv, xp, palier, recettes, Reglages.get().seuilSuivant(palier));
   }

   public static void ecrire(PaquetEtat p, FriendlyByteBuf b) {
      b.writeVarInt(p.metiers.size());
      for (int i = 0; i < p.metiers.size(); i++) {
         b.writeUtf(p.metiers.get(i), 64);
         b.writeVarInt(p.niveaux.get(i));
         b.writeVarLong(p.xps.get(i));
      }
      b.writeVarInt(p.palier);
      b.writeVarInt(p.recettes);
      b.writeVarInt(p.recettesPourSuivant);
   }

   public static PaquetEtat lire(FriendlyByteBuf b) {
      int n = b.readVarInt();
      List<String> ids = new ArrayList<>(n);
      List<Integer> niv = new ArrayList<>(n);
      List<Long> xp = new ArrayList<>(n);
      for (int i = 0; i < n; i++) {
         ids.add(b.readUtf(64));
         niv.add(b.readVarInt());
         xp.add(b.readVarLong());
      }
      return new PaquetEtat(ids, niv, xp, b.readVarInt(), b.readVarInt(), b.readVarInt());
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
      return this.niveauDe(Metier.CUISINIER);
   }
}
