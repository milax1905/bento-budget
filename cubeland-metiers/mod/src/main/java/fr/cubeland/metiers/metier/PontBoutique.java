package fr.cubeland.metiers.metier;

import fr.cubeland.metiers.CubelandMetiers;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;
import net.minecraft.server.MinecraftServer;

public final class PontBoutique {
   private static final String CL_METIERS = "fr.cubeland.boutique.economie.Metiers";
   private static final String CL_COMPTES = "fr.cubeland.boutique.economie.Comptes";
   private static Boolean presente;

   private PontBoutique() {
   }

   public static boolean presente() {
      if (presente == null) {
         try {
            Class.forName("fr.cubeland.boutique.economie.Metiers");
            presente = Boolean.TRUE;
         } catch (Throwable var1) {
            presente = Boolean.FALSE;
         }
      }

      return presente;
   }

   public static long solde(MinecraftServer serveur, UUID joueur) {
      Object c = comptes(serveur);
      if (c == null) {
         return -1L;
      } else {
         try {
            Method m = c.getClass().getMethod("solde", UUID.class);
            return ((Number)m.invoke(c, joueur)).longValue();
         } catch (Throwable var4) {
            return -1L;
         }
      }
   }

   public static boolean crediter(MinecraftServer serveur, UUID joueur, long montant) {
      Object c = comptes(serveur);
      if (c == null) {
         return false;
      } else {
         try {
            c.getClass().getMethod("crediter", UUID.class, long.class).invoke(c, joueur, montant);
            return true;
         } catch (Throwable var6) {
            CubelandMetiers.LOG.warn("Credit impossible via la boutique : {}", var6.toString());
            return false;
         }
      }
   }

   private static Object comptes(MinecraftServer serveur) {
      if (!presente()) {
         return null;
      } else {
         try {
            Class<?> k = Class.forName("fr.cubeland.boutique.economie.Comptes");
            return k.getMethod("de", MinecraftServer.class).invoke(null, serveur);
         } catch (Throwable var2) {
            return null;
         }
      }
   }

   public static void refleter(MinecraftServer serveur, UUID joueur, String metier, long montant) {
      if (presente() && montant > 0L) {
         if (!"cuisinier".equals(metier)) {
            try {
               Class<?> k = Class.forName("fr.cubeland.boutique.economie.Metiers");
               Object src = k.getMethod("de", MinecraftServer.class).invoke(null, serveur);
               if (src == null) {
                  return;
               }

               k.getMethod("ajouter", UUID.class, String.class, long.class).invoke(src, joueur, metier, montant);
            } catch (Throwable var7) {
               CubelandMetiers.LOG.debug("Reflet vers la boutique impossible : {}", var7.toString());
            }
         }
      }
   }

   public static int importer(MinecraftServer serveur, DonneesMetiers cible) {
      if (!presente()) {
         return 0;
      } else {
         try {
            Class<?> k = Class.forName("fr.cubeland.boutique.economie.Metiers");
            Object src = k.getMethod("de", MinecraftServer.class).invoke(null, serveur);
            if (src == null) {
               return 0;
            } else {
               Set<UUID> joueurs = (Set<UUID>)k.getMethod("joueursConnus").invoke(src);
               Method xp = k.getMethod("xp", UUID.class, String.class);
               int repris = 0;

               for (UUID u : joueurs) {
                  boolean quelqueChose = false;

                  for (String metier : Metiers.tous()) {
                     if (!"cuisinier".equals(metier)) {
                        long valeur = ((Number)xp.invoke(src, u, metier)).longValue();
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

               CubelandMetiers.LOG.info("Experience reprise depuis la boutique : {} joueurs.", repris);
               return repris;
            }
         } catch (Throwable var14) {
            CubelandMetiers.LOG.warn("Reprise depuis la boutique impossible : {}", var14.toString());
            return 0;
         }
      }
   }
}
