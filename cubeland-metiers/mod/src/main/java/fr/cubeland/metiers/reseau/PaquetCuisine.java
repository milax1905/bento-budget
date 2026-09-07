package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.metier.DonneesMetiers;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.UUID;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

/**
 * Le carnet de cuisine du joueur : ce qu'il connaît et combien de fois, ses
 * qualités, ses chances, quelques idées. Le catalogue lui-même est déjà chez le
 * client ; on n'envoie que ce qui lui appartient.
 *
 * @param fournees recette → nombre de fois cuisinée
 * @param idees    identifiants de plats à portée, pas encore connus, les moins chers d'abord
 */
public record PaquetCuisine(
   int palier, int recettes, int seuilSuivant, Map<String, Integer> fournees, List<String> idees, List<String> debloques,
   int[] chances, int[] qualites, int platsCuisines, String favorite, int foisFavorite, int commandesFaites
) {
   private static final int MAX_IDEES = 6;

   public static PaquetCuisine pour(ServerPlayer joueur, DonneesMetiers donnees) {
      UUID u = joueur.getUUID();
      Reglages r = Reglages.get();
      int palier = donnees.palier(u);
      Map<String, Integer> fournees = new LinkedHashMap<>();
      for (String rec : donnees.recettesDe(u)) {
         fournees.put(rec, donnees.fois(u, rec));
      }
      List<Plat> restants = new ArrayList<>();
      List<String> debloques = new ArrayList<>();
      for (Plat p : Catalogue.tous()) {
         if (p.variante() != null) {
            continue;
         }
         if (donnees.debloque(u, p.recette())) {
            debloques.add(p.id());
         }
         if (donnees.aPortee(u, p) && !fournees.containsKey(p.recette())) {
            restants.add(p);
         }
      }
      restants.sort(Comparator.comparingInt(Plat::valeur).thenComparing(Plat::id));
      List<String> idees = new ArrayList<>();
      for (int i = 0; i < restants.size() && idees.size() < MAX_IDEES; i++) {
         idees.add(restants.get(i).id());
      }
      Entry<String, Integer> fav = donnees.favorite(u);
      return new PaquetCuisine(
         palier,
         donnees.nombreRecettes(u),
         r.seuilSuivant(palier),
         fournees,
         idees,
         debloques,
         r.probabilites[Math.max(0, Math.min(4, palier - 1))].clone(),
         donnees.qualites(u),
         donnees.platsCuisines(u),
         fav == null ? "" : fav.getKey(),
         fav == null ? 0 : fav.getValue(),
         donnees.commandesFaites(u)
      );
   }

   public static void ecrire(PaquetCuisine p, FriendlyByteBuf b) {
      b.writeVarInt(p.palier);
      b.writeVarInt(p.recettes);
      b.writeVarInt(p.seuilSuivant);
      b.writeVarInt(p.fournees.size());
      for (Entry<String, Integer> e : p.fournees.entrySet()) {
         b.writeUtf(e.getKey(), 200);
         b.writeVarInt(e.getValue());
      }
      ecrireListe(b, p.idees);
      ecrireListe(b, p.debloques);
      for (int q = 0; q < 5; q++) {
         b.writeVarInt(p.chances[q]);
      }
      for (int q = 0; q < 5; q++) {
         b.writeVarInt(p.qualites[q]);
      }
      b.writeVarInt(p.platsCuisines);
      b.writeUtf(p.favorite, 200);
      b.writeVarInt(p.foisFavorite);
      b.writeVarInt(p.commandesFaites);
   }

   private static void ecrireListe(FriendlyByteBuf b, List<String> l) {
      b.writeVarInt(l.size());
      for (String s : l) {
         b.writeUtf(s, 200);
      }
   }

   private static List<String> lireListe(FriendlyByteBuf b) {
      int n = b.readVarInt();
      List<String> l = new ArrayList<>(n);
      for (int i = 0; i < n; i++) {
         l.add(b.readUtf(200));
      }
      return l;
   }

   public static PaquetCuisine lire(FriendlyByteBuf b) {
      int palier = b.readVarInt();
      int recettes = b.readVarInt();
      int seuil = b.readVarInt();
      int nf = b.readVarInt();
      Map<String, Integer> fournees = new LinkedHashMap<>();
      for (int i = 0; i < nf; i++) {
         fournees.put(b.readUtf(200), b.readVarInt());
      }
      List<String> idees = lireListe(b);
      List<String> debloques = lireListe(b);
      int[] chances = new int[5];
      int[] qualites = new int[5];
      for (int q = 0; q < 5; q++) {
         chances[q] = b.readVarInt();
      }
      for (int q = 0; q < 5; q++) {
         qualites[q] = b.readVarInt();
      }
      return new PaquetCuisine(palier, recettes, seuil, fournees, idees, debloques, chances, qualites, b.readVarInt(), b.readUtf(200), b.readVarInt(), b.readVarInt());
   }

   public static void traiter(PaquetCuisine p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoirCuisine(p)));
      ctx.get().setPacketHandled(true);
   }

   // --- lecture côté client -------------------------------------------------

   public boolean connue(Plat p) {
      return this.fournees.containsKey(p.recette());
   }

   public int fois(Plat p) {
      Integer n = this.fournees.get(p.recette());
      return n == null ? 0 : n;
   }

   public boolean aPortee(Plat p) {
      return p.palier() <= this.palier || this.debloques.contains(p.id());
   }

   public int manque() {
      return this.seuilSuivant <= 0 ? 0 : Math.max(0, this.seuilSuivant - this.recettes);
   }

   public float progression() {
      return this.seuilSuivant <= 0 ? 1.0F : Math.max(0.0F, Math.min(1.0F, (float) this.recettes / this.seuilSuivant));
   }
}
