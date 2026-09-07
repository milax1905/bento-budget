package fr.cubeland.metiers.metier;

import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Reglages;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.Map.Entry;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.saveddata.SavedData;

public class DonneesMetiers extends SavedData {
   public static final String FICHIER = "cubelandmetiers_donnees";
   private final Map<UUID, Map<String, Long>> experience = new HashMap<>();
   private final Map<UUID, Map<String, Integer>> recettes = new HashMap<>();
   private final Map<UUID, int[]> qualites = new HashMap<>();
   private final Map<UUID, Integer> dernierPalier = new HashMap<>();
   private boolean importFait = false;

   public static DonneesMetiers de(MinecraftServer serveur) {
      ServerLevel monde = serveur.getLevel(Level.OVERWORLD);
      if (monde == null) {
         monde = serveur.overworld();
      }

      return (DonneesMetiers)monde.getDataStorage().computeIfAbsent(DonneesMetiers::charger, DonneesMetiers::new, "cubelandmetiers_donnees");
   }

   public long xp(UUID joueur, String metier) {
      Map<String, Long> m = this.experience.get(joueur);
      return m == null ? 0L : m.getOrDefault(metier, 0L);
   }

   public int niveau(UUID joueur, String metier) {
      return Reglages.get().niveauPour(this.xp(joueur, metier));
   }

   public int niveauTotal(UUID joueur) {
      int t = 0;

      for (String m : Metiers.tous()) {
         t += this.niveau(joueur, m);
      }

      return t;
   }

   public int ajouter(UUID joueur, String metier, long montant) {
      if (montant > 0L && Metiers.existe(metier)) {
         Map<String, Long> m = this.experience.computeIfAbsent(joueur, k -> new HashMap<>());
         long avant = m.getOrDefault(metier, 0L);
         int niveauAvant = Reglages.get().niveauPour(avant);
         long apres = avant + montant;
         m.put(metier, apres);
         this.setDirty();
         return Math.max(0, Reglages.get().niveauPour(apres) - niveauAvant);
      } else {
         return 0;
      }
   }

   public void definir(UUID joueur, String metier, long montant) {
      this.experience.computeIfAbsent(joueur, k -> new HashMap<>()).put(metier, Math.max(0L, montant));
      this.setDirty();
   }

   public Set<UUID> joueursConnus() {
      Set<UUID> s = new HashSet<>(this.experience.keySet());
      s.addAll(this.recettes.keySet());
      s.addAll(this.qualites.keySet());
      return s;
   }

   public List<Entry<UUID, Integer>> classement(String metier, int combien) {
      List<Entry<UUID, Integer>> l = new ArrayList<>();

      for (UUID u : this.joueursConnus()) {
         l.add(Map.entry(u, this.niveau(u, metier)));
      }

      l.sort((a, b) -> Integer.compare(b.getValue(), a.getValue()));
      return l.size() > combien ? l.subList(0, combien) : l;
   }

   public boolean decouvrir(UUID joueur, String platId) {
      Map<String, Integer> m = this.recettes.computeIfAbsent(joueur, k -> new LinkedHashMap<>());
      Integer avant = m.get(platId);
      m.put(platId, avant == null ? 1 : avant + 1);
      this.setDirty();
      return avant == null;
   }

   public boolean connait(UUID joueur, String platId) {
      Map<String, Integer> m = this.recettes.get(joueur);
      return m != null && m.containsKey(platId);
   }

   public int fois(UUID joueur, String platId) {
      Map<String, Integer> m = this.recettes.get(joueur);
      if (m == null) {
         return 0;
      } else {
         Integer n = m.get(platId);
         return n == null ? 0 : n;
      }
   }

   public int nombreRecettes(UUID joueur) {
      Map<String, Integer> m = this.recettes.get(joueur);
      return m == null ? 0 : m.size();
   }

   public int platsCuisines(UUID joueur) {
      Map<String, Integer> m = this.recettes.get(joueur);
      if (m == null) {
         return 0;
      } else {
         int t = 0;

         for (int n : m.values()) {
            t += n;
         }

         return t;
      }
   }

   public Entry<String, Integer> favorite(UUID joueur) {
      Map<String, Integer> m = this.recettes.get(joueur);
      if (m != null && !m.isEmpty()) {
         Entry<String, Integer> meilleur = null;

         for (Entry<String, Integer> e : m.entrySet()) {
            if (meilleur == null || e.getValue() > meilleur.getValue()) {
               meilleur = e;
            }
         }

         return meilleur;
      } else {
         return null;
      }
   }

   public Set<String> recettesDe(UUID joueur) {
      Map<String, Integer> m = this.recettes.get(joueur);
      return m == null ? Set.of() : Set.copyOf(m.keySet());
   }

   public void noterQualite(UUID joueur, int qualite) {
      if (qualite >= 1 && qualite <= 5) {
         int[] t = this.qualites.computeIfAbsent(joueur, k -> new int[5]);
         t[qualite - 1]++;
         this.setDirty();
      }
   }

   public int[] qualites(UUID joueur) {
      int[] t = this.qualites.get(joueur);
      return t == null ? new int[5] : (int[])t.clone();
   }

   public int meilleureQualite(UUID joueur) {
      int[] t = this.qualites(joueur);

      for (int q = 5; q >= 1; q--) {
         if (t[q - 1] > 0) {
            return q;
         }
      }

      return 0;
   }

   public int palier(UUID joueur) {
      return Reglages.get().palierPour(this.nombreRecettes(joueur));
   }

   public int palierRecompense(UUID joueur) {
      return this.dernierPalier.getOrDefault(joueur, 1);
   }

   public void marquerPalierRecompense(UUID joueur, int palier) {
      this.dernierPalier.put(joueur, palier);
      this.setDirty();
   }

   public void oublier(UUID joueur) {
      this.experience.remove(joueur);
      this.recettes.remove(joueur);
      this.qualites.remove(joueur);
      this.dernierPalier.remove(joueur);
      this.setDirty();
   }

   public boolean importFait() {
      return this.importFait;
   }

   public void marquerImport() {
      this.importFait = true;
      this.setDirty();
   }

   public static DonneesMetiers charger(CompoundTag tag) {
      DonneesMetiers d = new DonneesMetiers();
      if (!tag.contains("joueurs") && !tag.isEmpty()) {
         CubelandMetiers.LOG
            .error("Le fichier {} ne vient pas de ce mod ({}). On ne le lit pas et on n'y touchera pas.", "cubelandmetiers_donnees", tag.getAllKeys());
         return d;
      } else {
         d.importFait = tag.getBoolean("importFait");
         ListTag joueurs = tag.getList("joueurs", 10);

         for (int i = 0; i < joueurs.size(); i++) {
            CompoundTag j = joueurs.getCompound(i);

            UUID u;
            try {
               u = UUID.fromString(j.getString("uuid"));
            } catch (IllegalArgumentException var12) {
               continue;
            }

            CompoundTag xps = j.getCompound("xp");
            Map<String, Long> m = new HashMap<>();

            for (String cle : xps.getAllKeys()) {
               m.put(cle, xps.getLong(cle));
            }

            if (!m.isEmpty()) {
               d.experience.put(u, m);
            }

            Map<String, Integer> m2 = new LinkedHashMap<>();
            if (j.contains("fournees")) {
               CompoundTag f = j.getCompound("fournees");

               for (String cle : f.getAllKeys()) {
                  m2.put(cle, Math.max(1, f.getInt(cle)));
               }
            } else {
               ListTag rec = j.getList("recettes", 8);

               for (int k = 0; k < rec.size(); k++) {
                  m2.put(rec.getString(k), 1);
               }
            }

            if (!m2.isEmpty()) {
               d.recettes.put(u, m2);
            }

            if (j.contains("qualites")) {
               int[] q = j.getIntArray("qualites");
               if (q.length == 5) {
                  d.qualites.put(u, q);
               }
            }

            if (j.contains("palier")) {
               d.dernierPalier.put(u, j.getInt("palier"));
            }
         }

         CubelandMetiers.LOG.info("Metiers charges : {} joueurs.", d.joueursConnus().size());
         return d;
      }
   }

   public CompoundTag save(CompoundTag tag) {
      tag.putBoolean("importFait", this.importFait);
      ListTag joueurs = new ListTag();

      for (UUID u : this.joueursConnus()) {
         CompoundTag j = new CompoundTag();
         j.putString("uuid", u.toString());
         CompoundTag xps = new CompoundTag();
         Map<String, Long> m = this.experience.get(u);
         if (m != null) {
            m.forEach(xps::putLong);
         }

         j.put("xp", xps);
         CompoundTag f = new CompoundTag();
         Map<String, Integer> m2 = this.recettes.get(u);
         if (m2 != null) {
            m2.forEach(f::putInt);
         }

         j.put("fournees", f);
         int[] q = this.qualites.get(u);
         if (q != null) {
            j.putIntArray("qualites", q);
         }

         Integer p = this.dernierPalier.get(u);
         if (p != null) {
            j.putInt("palier", p);
         }

         joueurs.add(j);
      }

      tag.put("joueurs", joueurs);
      return tag;
   }
}
