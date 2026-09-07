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

public final class Reglages {
   private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
   private static final Path DOSSIER = Paths.get("config", "cubeland-metiers");
   private static final Path FICHIER = DOSSIER.resolve("reglages.json");
   private static Reglages courant = new Reglages();
   public long xpBase = 120L;
   public int niveauMax = 50;
   public boolean reprendreMetiers = true;
   public boolean importerBoutique = true;
   public boolean refleterVersBoutique = true;
   public Map<String, long[]> gains = new LinkedHashMap<>();
   public long xpPlat = 5L;
   public long xpDecouverte = 40L;
   public long xpQualite = 15L;
   public int[] palierRecettes = new int[]{0, 4, 10, 18, 28};
   public int[] palierBonusXp = new int[]{0, 5, 12, 20, 30};
   public String[] palierNom = new String[]{"Apprenti cuisinier", "Cuisinier en herbe", "Cuisinier confirme", "Artisan cuisinier", "Maitre cuisinier"};
   public String[] palierGeste = new String[]{"Cuire", "Assembler", "Mijoter", "Infuser", "Signer"};
   public String[] palierRecompense = new String[]{
      "",
      "Un couteau en fer et le tablier de cuisinier",
      "L'acces aux commandes du ravitailleur",
      "Le livre de recettes, vendu par la boutique",
      "La toque du maitre : un artefact porte, visible de tout le serveur"
   };
   public int[][] probabilites = new int[][]{{70, 25, 5, 0, 0}, {45, 38, 15, 2, 0}, {25, 38, 28, 8, 1}, {12, 30, 35, 20, 3}, {5, 20, 35, 30, 10}};
   public double[] multiplicateurs = new double[]{1.0, 1.4, 2.2, 3.2, 4.5};
   public int[] dureeEffet = new int[]{20, 45, 90, 180, 300};
   public Map<String, Integer> postes = new LinkedHashMap<>();
   public int[] couteauTemps = new int[]{10, 20, 30, 40, 45};
   public int[] couteauQualite = new int[]{0, 3, 6, 10, 12};
   public boolean platHorsPalierInerte = true;
   public boolean bloquerFabricationHorsPalier = false;
   public int commissionVente = 5;
   public int fenetrePoste = 180;

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

   public long seuil(int niveau) {
      return niveau <= 0 ? 0L : this.xpBase * (long)niveau * (long)niveau;
   }

   public int niveauPour(long xp) {
      int n = 0;

      while (n < this.niveauMax && xp >= this.seuil(n + 1)) {
         n++;
      }

      return n;
   }

   public float progression(long xp) {
      int n = this.niveauPour(xp);
      if (n >= this.niveauMax) {
         return 1.0F;
      } else {
         long bas = this.seuil(n);
         long haut = this.seuil(n + 1);
         return haut <= bas ? 1.0F : Math.max(0.0F, Math.min(1.0F, (float)(xp - bas) / (float)(haut - bas)));
      }
   }

   public int palierPour(int recettes) {
      int p = 1;

      for (int i = 1; i < this.palierRecettes.length; i++) {
         if (recettes >= this.palierRecettes[i]) {
            p = i + 1;
         }
      }

      return p;
   }

   public int bonusXpDe(int palier) {
      int i = Math.max(0, Math.min(this.palierBonusXp.length - 1, palier - 1));
      return this.palierBonusXp[i];
   }

   public int palierDuPoste(String poste) {
      Integer v = this.postes.get(poste);
      return v == null ? 1 : Math.max(1, Math.min(5, v));
   }

   public static void charger() {
      try {
         Files.createDirectories(DOSSIER);
         if (Files.exists(FICHIER)) {
            try (Reader r = Files.newBufferedReader(FICHIER, StandardCharsets.UTF_8)) {
               Reglages lu = (Reglages)GSON.fromJson(r, Reglages.class);
               if (lu != null) {
                  courant = lu;
                  courant.reparer();
                  return;
               }
            }
         }
      } catch (JsonSyntaxException | IOException var5) {
         CubelandMetiers.LOG.error("Reglages illisibles, valeurs par defaut : {}", var5.toString());
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
      } catch (IOException var5) {
         CubelandMetiers.LOG.error("Impossible d'ecrire les reglages : {}", var5.toString());
      }
   }

   private void reparer() {
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

      if (this.palierRecettes == null || this.palierRecettes.length != 5) {
         this.palierRecettes = d.palierRecettes;
      }

      if (this.palierBonusXp == null || this.palierBonusXp.length != 5) {
         this.palierBonusXp = d.palierBonusXp;
      }

      if (this.palierNom == null || this.palierNom.length != 5) {
         this.palierNom = d.palierNom;
      }

      if (this.palierGeste == null || this.palierGeste.length != 5) {
         this.palierGeste = d.palierGeste;
      }

      if (this.palierRecompense == null || this.palierRecompense.length != 5) {
         this.palierRecompense = d.palierRecompense;
      }

      if (this.multiplicateurs == null || this.multiplicateurs.length != 5) {
         this.multiplicateurs = d.multiplicateurs;
      }

      if (this.dureeEffet == null || this.dureeEffet.length != 5) {
         this.dureeEffet = d.dureeEffet;
      }

      if (this.couteauTemps == null || this.couteauTemps.length != 5) {
         this.couteauTemps = d.couteauTemps;
      }

      if (this.couteauQualite == null || this.couteauQualite.length != 5) {
         this.couteauQualite = d.couteauQualite;
      }

      if (this.probabilites == null || this.probabilites.length != 5) {
         this.probabilites = d.probabilites;
      }

      for (int i = 0; i < 5; i++) {
         if (this.probabilites[i] == null || this.probabilites[i].length != 5) {
            this.probabilites[i] = d.probabilites[i];
         }
      }
   }
}
