package fr.cubeland.metiers.metier;

import fr.cubeland.metiers.CubelandMetiers;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;

/**
 * Le pont vers la boutique {@code cubeboutique}, quand elle est chargée.
 *
 * <p>Tout passe par réflexion pour que ce mod démarre avec ou sans elle. La
 * boutique tient l'argent ; ce mod lui demande de créditer, et lui reflète
 * l'expérience des métiers pour ses bonus de prix.</p>
 */
public final class PontBoutique {
   private static final String CL_METIERS = "fr.cubeland.boutique.economie.Metiers";
   private static final String CL_COMPTES = "fr.cubeland.boutique.economie.Comptes";
   private static Boolean presente;

   private PontBoutique() {
   }

   public static boolean presente() {
      if (presente == null) {
         try {
            Class.forName(CL_METIERS);
            presente = Boolean.TRUE;
         } catch (Throwable t) {
            presente = Boolean.FALSE;
         }
      }
      return presente;
   }

   /** Le solde du joueur, ou -1 sans boutique. */
   public static long solde(MinecraftServer serveur, UUID joueur) {
      Object c = comptes(serveur);
      if (c == null) {
         return -1L;
      }
      try {
         Method m = c.getClass().getMethod("solde", UUID.class);
         return ((Number) m.invoke(c, joueur)).longValue();
      } catch (Throwable t) {
         return -1L;
      }
   }

   /** Crédite le joueur. Retourne faux si la boutique est absente ou refuse : rien ne doit alors être retiré. */
   public static boolean crediter(MinecraftServer serveur, UUID joueur, long montant) {
      if (montant <= 0L) {
         return presente();
      }
      Object c = comptes(serveur);
      if (c == null) {
         return false;
      }
      try {
         c.getClass().getMethod("crediter", UUID.class, long.class).invoke(c, joueur, montant);
         return true;
      } catch (Throwable t) {
         CubelandMetiers.LOG.warn("Crédit impossible via la boutique : {}", t.toString());
         return false;
      }
   }

   private static Object comptes(MinecraftServer serveur) {
      if (!presente()) {
         return null;
      }
      try {
         Class<?> k = Class.forName(CL_COMPTES);
         return k.getMethod("de", MinecraftServer.class).invoke(null, serveur);
      } catch (Throwable t) {
         return null;
      }
   }

   public static void refleter(MinecraftServer serveur, UUID joueur, String metier, long montant) {
      if (!presente() || montant <= 0L || Metier.CUISINIER.equals(metier)) {
         return;
      }
      try {
         Class<?> k = Class.forName(CL_METIERS);
         Object src = k.getMethod("de", MinecraftServer.class).invoke(null, serveur);
         if (src != null) {
            k.getMethod("ajouter", UUID.class, String.class, long.class).invoke(src, joueur, metier, montant);
         }
      } catch (Throwable t) {
         CubelandMetiers.LOG.debug("Reflet vers la boutique impossible : {}", t.toString());
      }
   }

   /** Reprise unique de l'expérience enregistrée côté boutique. Retourne le nombre de joueurs repris. */
   @SuppressWarnings("unchecked")
   public static int importer(MinecraftServer serveur, DonneesMetiers cible) {
      if (!presente()) {
         return 0;
      }
      try {
         Class<?> k = Class.forName(CL_METIERS);
         Object src = k.getMethod("de", MinecraftServer.class).invoke(null, serveur);
         if (src == null) {
            return 0;
         }
         Set<UUID> joueurs = (Set<UUID>) k.getMethod("joueursConnus").invoke(src);
         Method xp = k.getMethod("xp", UUID.class, String.class);
         int repris = 0;
         for (UUID u : joueurs) {
            boolean quelqueChose = false;
            for (String metier : Metiers.tous()) {
               if (!Metier.CUISINIER.equals(metier)) {
                  long valeur = ((Number) xp.invoke(src, u, metier)).longValue();
                  if (valeur > 0L) {
                     cible.definir(u, metier, valeur);
                     quelqueChose = true;
                  }
               }
            }
            if (quelqueChose) {
               repris++;
            }
         }
         CubelandMetiers.LOG.info("Expérience reprise depuis la boutique : {} joueurs.", repris);
         return repris;
      } catch (Throwable t) {
         CubelandMetiers.LOG.warn("Reprise depuis la boutique impossible : {}", t.toString());
         return 0;
      }
   }
}
