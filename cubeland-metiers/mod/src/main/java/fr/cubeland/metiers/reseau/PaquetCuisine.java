package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Famille;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.metier.DonneesMetiers;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.Map.Entry;
import java.util.function.Supplier;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.network.NetworkEvent.Context;

public record PaquetCuisine(
   int palier,
   int recettes,
   int seuilSuivant,
   String nomPalier,
   String gestePalier,
   String recompenseSuivante,
   String posteSuivant,
   List<PaquetCuisine.Compte> familles,
   List<PaquetCuisine.Idee> idees,
   int palierAffiche,
   List<PaquetCuisine.Ligne> lignes,
   List<PaquetCuisine.Compte> parPalier,
   int[] chances,
   int[] qualites,
   int platsCuisines,
   String favorite,
   int foisFavorite
) {
   public static PaquetCuisine pour(ServerPlayer joueur, DonneesMetiers donnees, int palierAffiche) {
      Reglages r = Reglages.get();
      Set<String> connues = donnees.recettesDe(joueur.getUUID());
      int recettes = donnees.nombreRecettes(joueur.getUUID());
      int palier = r.palierPour(recettes);
      int seuil = palier >= 5 ? 0 : r.palierRecettes[palier];
      String recompense = palier >= 5 ? "" : r.palierRecompense[palier];
      String poste = "";

      for (Entry<String, Integer> e : r.postes.entrySet()) {
         if (e.getValue() != null && e.getValue() == palier + 1) {
            poste = nomPoste(e.getKey());
            break;
         }
      }

      List<PaquetCuisine.Idee> idees = new ArrayList<>();
      List<Plat> restants = new ArrayList<>();

      for (Plat p : Catalogue.tous()) {
         if (p.palier() <= palier && !connues.contains(p.objet().toString())) {
            restants.add(p);
         }
      }

      restants.sort(Comparator.comparingInt(Plat::valeur).thenComparing(Plat::nom));

      for (int i = 0; i < restants.size() && idees.size() < 6; i++) {
         Plat px = restants.get(i);
         String at = Catalogue.atelierDe(px);
         idees.add(new PaquetCuisine.Idee(px.objet().toString(), px.nom(), px.famille().id(), at.isEmpty() ? nomPoste(px.poste()) : at, px.valeur()));
      }

      List<PaquetCuisine.Compte> familles = new ArrayList<>();

      for (Famille f : Famille.values()) {
         int c = 0;
         int t = 0;

         for (Plat px : Catalogue.tous()) {
            if (px.famille() == f && px.palier() <= palier) {
               t++;
               if (connues.contains(px.objet().toString())) {
                  c++;
               }
            }
         }

         if (t > 0) {
            familles.add(new PaquetCuisine.Compte(f.id(), c, t));
         }
      }

      List<PaquetCuisine.Compte> parPalier = new ArrayList<>();

      for (int niv = 1; niv <= 5; niv++) {
         int c = 0;
         int t = 0;

         for (Plat pxx : Catalogue.tous()) {
            if (pxx.palier() == niv) {
               t++;
               if (connues.contains(pxx.objet().toString())) {
                  c++;
               }
            }
         }

         parPalier.add(new PaquetCuisine.Compte(String.valueOf(niv), c, t));
      }

      List<PaquetCuisine.Ligne> lignes = new ArrayList<>();
      List<Plat> tri = new ArrayList<>(Catalogue.tous());
      tri.sort(Comparator.comparingInt(Plat::palier).thenComparing(pxxx -> pxxx.famille().id()).thenComparing(Plat::nom));

      for (Plat pxxx : tri) {
         long[] prix = new long[5];

         for (int q = 0; q < 5; q++) {
            prix[q] = Qualite.prix(pxxx, q + 1);
         }

         String id = pxxx.objet().toString();
         String atelier = Catalogue.atelierDe(pxxx);
         lignes.add(
            new PaquetCuisine.Ligne(
               id,
               pxxx.nom(),
               pxxx.famille().id(),
               atelier.isEmpty() ? nomPoste(pxxx.poste()) : atelier,
               pxxx.valeur(),
               connues.contains(id),
               donnees.fois(joueur.getUUID(), id),
               pxxx.palier(),
               prix
            )
         );
      }

      int[] chances = (int[])r.probabilites[Math.max(0, Math.min(4, palier - 1))].clone();
      int[] qualites = donnees.qualites(joueur.getUUID());
      Entry<String, Integer> fav = donnees.favorite(joueur.getUUID());
      String nomFav = "";
      int foisFav = 0;
      if (fav != null) {
         foisFav = fav.getValue();

         for (Plat pxxx : Catalogue.tous()) {
            if (pxxx.objet().toString().equals(fav.getKey())) {
               nomFav = pxxx.nom();
               break;
            }
         }
      }

      return new PaquetCuisine(
         palier,
         recettes,
         seuil,
         r.palierNom[palier - 1],
         r.palierGeste[palier - 1],
         recompense,
         poste,
         familles,
         idees,
         Math.max(1, Math.min(5, palierAffiche)),
         lignes,
         parPalier,
         chances,
         qualites,
         donnees.platsCuisines(joueur.getUUID()),
         nomFav,
         foisFav
      );
   }

   private static String nomPoste(String cle) {
      return switch (cle) {
         case "fourneau" -> "fourneau";
         case "planche" -> "planche";
         case "poele" -> "poele";
         case "marmite" -> "marmite";
         case "bouilloire" -> "bouilloire";
         case "nether" -> "nether";
         default -> cle;
      };
   }

   public static void ecrire(PaquetCuisine p, FriendlyByteBuf t) {
      t.writeVarInt(p.palier);
      t.writeVarInt(p.recettes);
      t.writeVarInt(p.seuilSuivant);
      t.writeUtf(p.nomPalier, 64);
      t.writeUtf(p.gestePalier, 64);
      t.writeUtf(p.recompenseSuivante, 256);
      t.writeUtf(p.posteSuivant, 64);
      ecrireComptes(t, p.familles);
      t.writeVarInt(p.idees.size());

      for (PaquetCuisine.Idee i : p.idees) {
         t.writeUtf(i.id(), 200);
         t.writeUtf(i.nom(), 128);
         t.writeUtf(i.famille(), 32);
         t.writeUtf(i.poste(), 32);
         t.writeVarInt(i.valeur());
      }

      t.writeVarInt(p.palierAffiche);
      t.writeVarInt(p.lignes.size());

      for (PaquetCuisine.Ligne l : p.lignes) {
         t.writeUtf(l.id(), 200);
         t.writeUtf(l.nom(), 128);
         t.writeUtf(l.famille(), 32);
         t.writeUtf(l.poste(), 32);
         t.writeVarInt(l.valeur());
         t.writeBoolean(l.connue());
         t.writeVarInt(l.fois());
         t.writeVarInt(l.palier());

         for (int q = 0; q < 5; q++) {
            t.writeVarLong(l.prix()[q]);
         }
      }

      ecrireComptes(t, p.parPalier);

      for (int q = 0; q < 5; q++) {
         t.writeVarInt(p.chances[q]);
      }

      for (int q = 0; q < 5; q++) {
         t.writeVarInt(p.qualites[q]);
      }

      t.writeVarInt(p.platsCuisines);
      t.writeUtf(p.favorite, 128);
      t.writeVarInt(p.foisFavorite);
   }

   private static void ecrireComptes(FriendlyByteBuf t, List<PaquetCuisine.Compte> l) {
      t.writeVarInt(l.size());

      for (PaquetCuisine.Compte c : l) {
         t.writeUtf(c.cle(), 32);
         t.writeVarInt(c.connues());
         t.writeVarInt(c.total());
      }
   }

   private static List<PaquetCuisine.Compte> lireComptes(FriendlyByteBuf t) {
      int n = t.readVarInt();
      List<PaquetCuisine.Compte> l = new ArrayList<>(n);

      for (int i = 0; i < n; i++) {
         l.add(new PaquetCuisine.Compte(t.readUtf(32), t.readVarInt(), t.readVarInt()));
      }

      return l;
   }

   public static PaquetCuisine lire(FriendlyByteBuf t) {
      int palier = t.readVarInt();
      int recettes = t.readVarInt();
      int seuil = t.readVarInt();
      String nom = t.readUtf(64);
      String geste = t.readUtf(64);
      String rec = t.readUtf(256);
      String poste = t.readUtf(64);
      List<PaquetCuisine.Compte> familles = lireComptes(t);
      int ni = t.readVarInt();
      List<PaquetCuisine.Idee> idees = new ArrayList<>(ni);

      for (int i = 0; i < ni; i++) {
         idees.add(new PaquetCuisine.Idee(t.readUtf(200), t.readUtf(128), t.readUtf(32), t.readUtf(32), t.readVarInt()));
      }

      int aff = t.readVarInt();
      int nl = t.readVarInt();
      List<PaquetCuisine.Ligne> lignes = new ArrayList<>(nl);

      for (int i = 0; i < nl; i++) {
         String lid = t.readUtf(200);
         String ln = t.readUtf(128);
         String lf = t.readUtf(32);
         String lp = t.readUtf(32);
         int lv = t.readVarInt();
         boolean lc = t.readBoolean();
         int lfois = t.readVarInt();
         int lpal = t.readVarInt();
         long[] prix = new long[5];

         for (int q = 0; q < 5; q++) {
            prix[q] = t.readVarLong();
         }

         lignes.add(new PaquetCuisine.Ligne(lid, ln, lf, lp, lv, lc, lfois, lpal, prix));
      }

      List<PaquetCuisine.Compte> parPalier = lireComptes(t);
      int[] chances = new int[5];
      int[] qualites = new int[5];

      for (int q = 0; q < 5; q++) {
         chances[q] = t.readVarInt();
      }

      for (int q = 0; q < 5; q++) {
         qualites[q] = t.readVarInt();
      }

      int cuisines = t.readVarInt();
      String fav = t.readUtf(128);
      int foisFav = t.readVarInt();
      return new PaquetCuisine(
         palier, recettes, seuil, nom, geste, rec, poste, familles, idees, aff, lignes, parPalier, chances, qualites, cuisines, fav, foisFav
      );
   }

   public static void traiter(PaquetCuisine p, Supplier<Context> ctx) {
      ctx.get().enqueueWork(() -> DistExecutor.unsafeRunWhenOn(Dist.CLIENT, () -> () -> EtatClient.recevoirCuisine(p)));
      ctx.get().setPacketHandled(true);
   }

   public int manque() {
      return this.seuilSuivant <= 0 ? 0 : Math.max(0, this.seuilSuivant - this.recettes);
   }

   public float progression() {
      return this.seuilSuivant <= 0 ? 1.0F : Math.max(0.0F, Math.min(1.0F, (float)this.recettes / (float)this.seuilSuivant));
   }

   public static record Compte(String cle, int connues, int total) {
   }

   public static record Idee(String id, String nom, String famille, String poste, int valeur) {
   }

   public static record Ligne(String id, String nom, String famille, String poste, int valeur, boolean connue, int fois, int palier, long[] prix) {
   }
}
