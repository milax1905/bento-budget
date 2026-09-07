package fr.cubeland.metiers.metier;

import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Progression;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.quete.PremiersPas;
import fr.cubeland.metiers.quete.Quete;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.UUID;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.StringTag;
import net.minecraft.nbt.Tag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.saveddata.SavedData;

/**
 * Tout ce que le serveur sait des joueurs : XP par métier, carnet de recettes,
 * qualités obtenues, commandes en cours, premiers pas.
 *
 * <p>Format de sauvegarde compatible avec la 1.4 : les nouveaux champs
 * s'ajoutent à côté des anciens, jamais à leur place.</p>
 */
public class DonneesMetiers extends SavedData {
   public static final String FICHIER = "cubelandmetiers_donnees";

   private final Map<UUID, Map<String, Long>> experience = new HashMap<>();
   /** Recette → nombre de fournées. L'ordre d'insertion est l'ordre de découverte. */
   private final Map<UUID, Map<String, Integer>> recettes = new HashMap<>();
   private final Map<UUID, int[]> qualites = new HashMap<>();
   private final Map<UUID, Integer> dernierPalier = new HashMap<>();
   private final Map<UUID, Integer> palierForce = new HashMap<>();
   private final Map<UUID, Set<String>> debloques = new HashMap<>();
   private final Map<UUID, List<Quete>> quetes = new HashMap<>();
   private final Map<UUID, Integer> premiersPas = new HashMap<>();
   private final Map<UUID, Integer> commandesFaites = new HashMap<>();
   private boolean importFait;

   public static DonneesMetiers de(MinecraftServer serveur) {
      ServerLevel monde = serveur.getLevel(Level.OVERWORLD);
      if (monde == null) {
         monde = serveur.overworld();
      }
      return monde.getDataStorage().computeIfAbsent(DonneesMetiers::charger, DonneesMetiers::new, FICHIER);
   }

   // --- métiers -------------------------------------------------------------

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

   /** Ajoute de l'XP et retourne le nombre de niveaux gagnés. */
   public int ajouter(UUID joueur, String metier, long montant) {
      if (montant <= 0L || !Metiers.existe(metier)) {
         return 0;
      }
      Map<String, Long> m = this.experience.computeIfAbsent(joueur, k -> new HashMap<>());
      long avant = m.getOrDefault(metier, 0L);
      int niveauAvant = Reglages.get().niveauPour(avant);
      long apres = avant + montant;
      m.put(metier, apres);
      this.setDirty();
      return Math.max(0, Reglages.get().niveauPour(apres) - niveauAvant);
   }

   public void definir(UUID joueur, String metier, long montant) {
      this.experience.computeIfAbsent(joueur, k -> new HashMap<>()).put(metier, Math.max(0L, montant));
      this.setDirty();
   }

   public Set<UUID> joueursConnus() {
      Set<UUID> s = new HashSet<>(this.experience.keySet());
      s.addAll(this.recettes.keySet());
      s.addAll(this.qualites.keySet());
      s.addAll(this.quetes.keySet());
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

   // --- carnet de recettes --------------------------------------------------

   /** Note une fournée de cette recette. Retourne vrai si c'est une découverte. */
   public boolean decouvrir(UUID joueur, String recette) {
      String cle = Catalogue.recetteDe(recette);
      Map<String, Integer> m = this.recettes.computeIfAbsent(joueur, k -> new LinkedHashMap<>());
      Integer avant = m.get(cle);
      m.put(cle, avant == null ? 1 : avant + 1);
      this.setDirty();
      return avant == null;
   }

   public boolean connait(UUID joueur, String recette) {
      Map<String, Integer> m = this.recettes.get(joueur);
      return m != null && m.containsKey(Catalogue.recetteDe(recette));
   }

   public int fois(UUID joueur, String recette) {
      Map<String, Integer> m = this.recettes.get(joueur);
      if (m == null) {
         return 0;
      }
      Integer n = m.get(Catalogue.recetteDe(recette));
      return n == null ? 0 : n;
   }

   public int nombreRecettes(UUID joueur) {
      Map<String, Integer> m = this.recettes.get(joueur);
      return m == null ? 0 : m.size();
   }

   public int platsCuisines(UUID joueur) {
      Map<String, Integer> m = this.recettes.get(joueur);
      if (m == null) {
         return 0;
      }
      int t = 0;
      for (int n : m.values()) {
         t += n;
      }
      return t;
   }

   /** La recette la plus cuisinée, ou {@code null}. */
   public Entry<String, Integer> favorite(UUID joueur) {
      Map<String, Integer> m = this.recettes.get(joueur);
      if (m == null || m.isEmpty()) {
         return null;
      }
      Entry<String, Integer> meilleur = null;
      for (Entry<String, Integer> e : m.entrySet()) {
         if (meilleur == null || e.getValue() > meilleur.getValue()) {
            meilleur = e;
         }
      }
      return meilleur;
   }

   public Set<String> recettesDe(UUID joueur) {
      Map<String, Integer> m = this.recettes.get(joueur);
      return m == null ? Set.of() : Set.copyOf(m.keySet());
   }

   // --- qualités ------------------------------------------------------------

   public void noterQualite(UUID joueur, int qualite) {
      if (qualite >= 1 && qualite <= 5) {
         int[] t = this.qualites.computeIfAbsent(joueur, k -> new int[5]);
         t[qualite - 1]++;
         this.setDirty();
      }
   }

   public int[] qualites(UUID joueur) {
      int[] t = this.qualites.get(joueur);
      return t == null ? new int[5] : t.clone();
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

   // --- paliers -------------------------------------------------------------

   /** Le palier de cuisine : celui des recettes, ou celui forcé par un administrateur s'il est plus haut. */
   public int palier(UUID joueur) {
      int p = Reglages.get().palierPour(this.nombreRecettes(joueur));
      return Math.max(p, this.palierForce.getOrDefault(joueur, 0));
   }

   public int palierForce(UUID joueur) {
      return this.palierForce.getOrDefault(joueur, 0);
   }

   public void forcerPalier(UUID joueur, int palier) {
      if (palier <= 0) {
         this.palierForce.remove(joueur);
      } else {
         this.palierForce.put(joueur, Progression.bornerPalier(palier));
      }
      this.setDirty();
   }

   /** Dernier palier dont la récompense a été annoncée. */
   public int palierRecompense(UUID joueur) {
      return this.dernierPalier.getOrDefault(joueur, 1);
   }

   public void marquerPalierRecompense(UUID joueur, int palier) {
      this.dernierPalier.put(joueur, palier);
      this.setDirty();
   }

   /** Un plat débloqué par un défi : il compte comme étant à portée, quel que soit le palier. */
   public boolean debloque(UUID joueur, String recette) {
      Set<String> s = this.debloques.get(joueur);
      return s != null && s.contains(Catalogue.recetteDe(recette));
   }

   public void debloquer(UUID joueur, String recette) {
      this.debloques.computeIfAbsent(joueur, k -> new LinkedHashSet<>()).add(Catalogue.recetteDe(recette));
      this.setDirty();
   }

   /** Vrai si ce plat est à la portée du joueur : palier atteint, ou plat débloqué. */
   public boolean aPortee(UUID joueur, fr.cubeland.metiers.cuisine.Plat plat) {
      return plat.palier() <= this.palier(joueur) || this.debloque(joueur, plat.recette());
   }

   // --- commandes -----------------------------------------------------------

   public List<Quete> quetes(UUID joueur) {
      List<Quete> l = this.quetes.get(joueur);
      return l == null ? List.of() : List.copyOf(l);
   }

   public void definirQuetes(UUID joueur, List<Quete> liste) {
      this.quetes.put(joueur, new ArrayList<>(liste));
      this.setDirty();
   }

   public int premiersPas(UUID joueur) {
      return this.premiersPas.getOrDefault(joueur, PremiersPas.POSTE);
   }

   public void definirPremiersPas(UUID joueur, int etape) {
      this.premiersPas.put(joueur, PremiersPas.borner(etape));
      this.setDirty();
   }

   public int commandesFaites(UUID joueur) {
      return this.commandesFaites.getOrDefault(joueur, 0);
   }

   public void noterCommandeFaite(UUID joueur) {
      this.commandesFaites.merge(joueur, 1, Integer::sum);
      this.setDirty();
   }

   // --- divers --------------------------------------------------------------

   public void oublier(UUID joueur) {
      this.experience.remove(joueur);
      this.recettes.remove(joueur);
      this.qualites.remove(joueur);
      this.dernierPalier.remove(joueur);
      this.palierForce.remove(joueur);
      this.debloques.remove(joueur);
      this.quetes.remove(joueur);
      this.premiersPas.remove(joueur);
      this.commandesFaites.remove(joueur);
      this.setDirty();
   }

   public boolean importFait() {
      return this.importFait;
   }

   public void marquerImport() {
      this.importFait = true;
      this.setDirty();
   }

   // --- sauvegarde ----------------------------------------------------------

   public static DonneesMetiers charger(CompoundTag tag) {
      DonneesMetiers d = new DonneesMetiers();
      if (!tag.contains("joueurs") && !tag.isEmpty()) {
         CubelandMetiers.LOG.error("Le fichier {} ne vient pas de ce mod ({}). On ne le lit pas et on n'y touchera pas.", FICHIER, tag.getAllKeys());
         return d;
      }
      d.importFait = tag.getBoolean("importFait");
      ListTag joueurs = tag.getList("joueurs", Tag.TAG_COMPOUND);
      for (int i = 0; i < joueurs.size(); i++) {
         CompoundTag j = joueurs.getCompound(i);
         UUID u;
         try {
            u = UUID.fromString(j.getString("uuid"));
         } catch (IllegalArgumentException e) {
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
               m2.merge(Catalogue.recetteDe(cle), Math.max(1, f.getInt(cle)), Integer::sum);
            }
         } else {
            ListTag rec = j.getList("recettes", Tag.TAG_STRING);
            for (int k = 0; k < rec.size(); k++) {
               m2.merge(Catalogue.recetteDe(rec.getString(k)), 1, Integer::sum);
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
         if (j.contains("palierForce")) {
            d.palierForce.put(u, j.getInt("palierForce"));
         }
         if (j.contains("debloques")) {
            ListTag deb = j.getList("debloques", Tag.TAG_STRING);
            Set<String> s = new LinkedHashSet<>();
            for (int k = 0; k < deb.size(); k++) {
               s.add(deb.getString(k));
            }
            d.debloques.put(u, s);
         }
         if (j.contains("quetes")) {
            ListTag qs = j.getList("quetes", Tag.TAG_COMPOUND);
            List<Quete> l = new ArrayList<>();
            for (int k = 0; k < qs.size(); k++) {
               l.add(Quete.lire(qs.getCompound(k)));
            }
            d.quetes.put(u, l);
         }
         if (j.contains("premiersPas")) {
            d.premiersPas.put(u, j.getInt("premiersPas"));
         }
         if (j.contains("commandesFaites")) {
            d.commandesFaites.put(u, j.getInt("commandesFaites"));
         }
      }
      CubelandMetiers.LOG.info("Métiers chargés : {} joueurs.", d.joueursConnus().size());
      return d;
   }

   @Override
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
         Integer pf = this.palierForce.get(u);
         if (pf != null) {
            j.putInt("palierForce", pf);
         }
         Set<String> deb = this.debloques.get(u);
         if (deb != null && !deb.isEmpty()) {
            ListTag l = new ListTag();
            for (String s : deb) {
               l.add(StringTag.valueOf(s));
            }
            j.put("debloques", l);
         }
         List<Quete> qs = this.quetes.get(u);
         if (qs != null && !qs.isEmpty()) {
            ListTag l = new ListTag();
            for (Quete quete : qs) {
               l.add(quete.ecrire());
            }
            j.put("quetes", l);
         }
         Integer pp = this.premiersPas.get(u);
         if (pp != null) {
            j.putInt("premiersPas", pp);
         }
         Integer cf = this.commandesFaites.get(u);
         if (cf != null) {
            j.putInt("commandesFaites", cf);
         }
         joueurs.add(j);
      }
      tag.put("joueurs", joueurs);
      return tag;
   }
}
