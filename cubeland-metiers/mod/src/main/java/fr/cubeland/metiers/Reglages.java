package fr.cubeland.metiers;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Les réglages du mod, lus dans {@code config/cubeland-metiers/reglages.json}.
 *
 * <p>Le serveur est le seul à lire le fichier. Il envoie ensuite ses réglages
 * aux joueurs à la connexion ({@code PaquetSync}) ; le client ne touche jamais
 * au disque et affiche exactement ce que le serveur applique.</p>
 *
 * <p>Les textes (noms de paliers, récompenses, titres) ne sont plus ici : ils
 * vivent dans les fichiers de langue. Le fichier ne contient que des nombres
 * et des interrupteurs.</p>
 */
public final class Reglages {
   private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
   private static final Path DOSSIER = Paths.get("config", "cubeland-metiers");
   private static final Path FICHIER = DOSSIER.resolve("reglages.json");
   private static Reglages courant = new Reglages();

   // --- métiers -------------------------------------------------------------
   /** XP du niveau n = xpBase × n². */
   public long xpBase = 120L;
   public int niveauMax = 50;
   public boolean reprendreMetiers = true;
   public boolean importerBoutique = true;
   public boolean refleterVersBoutique = true;
   /** Gain d'XP par geste : [minimum, maximum]. Un maximum à 0 vaut « fixe ». */
   public Map<String, long[]> gains = new LinkedHashMap<>();

   // --- cuisine -------------------------------------------------------------
   public long xpPlat = 5L;
   public long xpDecouverte = 40L;
   public long xpQualite = 15L;
   /** Recettes différentes exigées pour chaque palier (le premier vaut 0). */
   public int[] palierRecettes = new int[]{0, 4, 10, 18, 28};
   /** Bonus d'XP de cuisine par palier, en pourcent. */
   public int[] palierBonusXp = new int[]{0, 5, 12, 20, 30};
   /** Chances (sur 100) de chaque qualité, une ligne par palier. */
   public int[][] probabilites = new int[][]{{70, 25, 5, 0, 0}, {45, 38, 15, 2, 0}, {25, 38, 28, 8, 1}, {12, 30, 35, 20, 3}, {5, 20, 35, 30, 10}};
   /** Multiplicateur de prix par qualité. */
   public double[] multiplicateurs = new double[]{1.0, 1.4, 2.2, 3.2, 4.5};
   /** Durée de l'effet d'un plat, en secondes, par qualité. */
   public int[] dureeEffet = new int[]{20, 45, 90, 180, 300};
   /** Palier auquel chaque poste de cuisine s'ouvre. */
   public Map<String, Integer> postes = new LinkedHashMap<>();
   public int[] couteauTemps = new int[]{10, 20, 30, 40, 45};
   public int[] couteauQualite = new int[]{0, 3, 6, 10, 12};
   public boolean platHorsPalierInerte = true;
   public boolean bloquerFabricationHorsPalier = false;
   public int commissionVente = 5;

   // --- commandes -----------------------------------------------------------
   public boolean commandes = true;
   public boolean premiersPas = true;
   /** Ce que paie une livraison, en pourcent du prix de vente normal. */
   public int livraisonPourcent = 150;
   /** Une commande de livraison non faite est remplacée après ce délai. */
   public int rotationLivraisonMinutes = 20;
   public int xpCommandeDecouverte = 80;
   public int xpCommandeLivraison = 60;
   public int xpCommandeMaitrise = 50;
   public int xpPremiersPas = 30;
   /** Objet offert à la fin des premiers pas (vide pour rien). */
   public String recompensePremiersPas = "farmersdelight:iron_knife";

   public static Reglages get() {
      return courant;
   }

   private Reglages() {
      this.gains.put("mineur_minerai", new long[]{10L, 22L});
      this.gains.put("mineur_pierre", new long[]{1L, 1L});
      this.gains.put("bucheron_buche", new long[]{4L, 9L});
      this.gains.put("fermier_recolte", new long[]{5L, 9L});
      this.gains.put("chasseur_tuerie", new long[]{8L, 0L});
      this.gains.put("pecheur_prise", new long[]{12L, 28L});
      this.postes.put("fourneau", 1);
      this.postes.put("planche", 1);
      this.postes.put("poele", 2);
      this.postes.put("marmite", 3);
      this.postes.put("bouilloire", 4);
      this.postes.put("nether", 5);
   }

   // --- calculs -------------------------------------------------------------

   public long seuil(int niveau) {
      return Progression.seuil(this.xpBase, niveau);
   }

   public int niveauPour(long xp) {
      return Progression.niveauPour(this.xpBase, this.niveauMax, xp);
   }

   public float progression(long xp) {
      return Progression.progression(this.xpBase, this.niveauMax, xp);
   }

   public int palierPour(int recettes) {
      return Progression.palierPour(this.palierRecettes, recettes);
   }

   /** Recettes exigées pour le palier suivant, 0 au palier maximum. */
   public int seuilSuivant(int palier) {
      return palier >= Progression.PALIER_MAX ? 0 : this.palierRecettes[palier];
   }

   public int bonusXpDe(int palier) {
      return this.palierBonusXp[Progression.bornerPalier(palier) - 1];
   }

   public int palierDuPoste(String poste) {
      Integer v = this.postes.get(poste);
      return v == null ? 1 : Progression.bornerPalier(v);
   }

   public long[] gain(String cle) {
      long[] g = this.gains.get(cle);
      return g == null || g.length == 0 ? new long[]{0L, 0L} : (g.length == 1 ? new long[]{g[0], 0L} : g);
   }

   // --- fichier (serveur seulement) -----------------------------------------

   public static void charger() {
      try {
         Files.createDirectories(DOSSIER);
         if (Files.exists(FICHIER)) {
            try (Reader r = Files.newBufferedReader(FICHIER, StandardCharsets.UTF_8)) {
               Reglages lu = GSON.fromJson(r, Reglages.class);
               if (lu != null) {
                  lu.reparer();
                  courant = lu;
                  sauver();
                  return;
               }
            }
         }
      } catch (JsonSyntaxException | IOException e) {
         CubelandMetiers.LOG.error("Réglages illisibles, valeurs par défaut : {}", e.toString());
      }
      courant = new Reglages();
      sauver();
   }

   public static void sauver() {
      try {
         Files.createDirectories(DOSSIER);
         try (Writer w = Files.newBufferedWriter(FICHIER, StandardCharsets.UTF_8)) {
            GSON.toJson(courant, w);
         }
      } catch (IOException e) {
         CubelandMetiers.LOG.error("Impossible d'écrire les réglages : {}", e.toString());
      }
   }

   // --- synchronisation vers les clients ------------------------------------

   /** Les réglages courants sous forme de JSON, pour le paquet de synchronisation. */
   public static String exporter() {
      return GSON.toJson(courant);
   }

   /** Côté client : adopte les réglages reçus du serveur. */
   public static void appliquerDistant(String json) {
      try {
         Reglages lu = GSON.fromJson(json, Reglages.class);
         if (lu != null) {
            lu.reparer();
            courant = lu;
         }
      } catch (JsonSyntaxException e) {
         CubelandMetiers.LOG.warn("Réglages reçus illisibles, on garde les valeurs par défaut : {}", e.toString());
      }
   }

   /** Remet une valeur par défaut partout où le fichier est absurde. */
   void reparer() {
      Reglages d = new Reglages();
      if (this.xpBase <= 0L) {
         this.xpBase = d.xpBase;
      }
      if (this.niveauMax <= 0) {
         this.niveauMax = d.niveauMax;
      }
      if (this.gains == null || this.gains.isEmpty()) {
         this.gains = d.gains;
      }
      if (this.postes == null || this.postes.isEmpty()) {
         this.postes = d.postes;
      }
      this.palierRecettes = cinq(this.palierRecettes, d.palierRecettes);
      this.palierBonusXp = cinq(this.palierBonusXp, d.palierBonusXp);
      this.dureeEffet = cinq(this.dureeEffet, d.dureeEffet);
      this.couteauTemps = cinq(this.couteauTemps, d.couteauTemps);
      this.couteauQualite = cinq(this.couteauQualite, d.couteauQualite);
      if (this.multiplicateurs == null || this.multiplicateurs.length != 5) {
         this.multiplicateurs = d.multiplicateurs;
      }
      if (this.probabilites == null || this.probabilites.length != 5) {
         this.probabilites = d.probabilites;
      }
      for (int i = 0; i < 5; i++) {
         this.probabilites[i] = cinq(this.probabilites[i], d.probabilites[i]);
      }
      if (this.livraisonPourcent < 100) {
         this.livraisonPourcent = d.livraisonPourcent;
      }
      if (this.rotationLivraisonMinutes <= 0) {
         this.rotationLivraisonMinutes = d.rotationLivraisonMinutes;
      }
      if (this.recompensePremiersPas == null) {
         this.recompensePremiersPas = "";
      }
      this.commissionVente = Math.max(0, Math.min(100, this.commissionVente));
   }

   private static int[] cinq(int[] valeur, int[] defaut) {
      return valeur == null || valeur.length != 5 ? defaut.clone() : valeur;
   }
}
