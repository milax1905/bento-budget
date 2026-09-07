package fr.cubeland.metiers.quete;

import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Famille;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Qualite;
import net.minecraft.network.chat.Component;

/**
 * Les phrases des commandes, côté serveur comme côté client.
 *
 * <p>Tout passe par des clés de langue ; le texte final est composé chez celui
 * qui l'affiche, dans sa langue.</p>
 */
public final class TextesQuete {
   private TextesQuete() {
   }

   /** Le titre court : « Découverte », « Livraison », « Maîtrise ». */
   public static Component titre(Quete q) {
      return Component.translatable("cubelandmetiers.quete." + q.type().cle());
   }

   /** La consigne complète. */
   public static Component consigne(Quete q) {
      switch (q.type()) {
         case DECOUVERTE:
            return switch (q.genre()) {
               case "famille" -> Component.translatable("cubelandmetiers.quete.decouverte.famille", q.objectif(), Famille.par(q.valeur()).nom());
               case "poste" -> Component.translatable("cubelandmetiers.quete.decouverte.poste", q.objectif(), poste(q.valeur()));
               default -> Component.translatable("cubelandmetiers.quete.decouverte.palier", q.objectif(), q.valeur());
            };
         case LIVRAISON: {
            Component nom = nomPlat(q.cible());
            if (q.defi()) {
               return Component.translatable("cubelandmetiers.quete.livraison.defi", q.objectif(), nom);
            }
            return q.qualiteMin() > 1
               ? Component.translatable("cubelandmetiers.quete.livraison.qualite", q.objectif(), nom, Qualite.nom(q.qualiteMin()))
               : Component.translatable("cubelandmetiers.quete.livraison", q.objectif(), nom);
         }
         default:
            return switch (q.genre()) {
               case "qualite" -> Component.translatable("cubelandmetiers.quete.maitrise.qualite", Qualite.nom(Integer.parseInt(q.valeur())));
               case "favorite" -> Component.translatable("cubelandmetiers.quete.maitrise.favorite", q.objectif(), nomPlat(q.valeur()));
               case "servir" -> Component.translatable("cubelandmetiers.quete.maitrise.servir");
               default -> Component.translatable("cubelandmetiers.quete.maitrise.repas", q.objectif());
            };
      }
   }

   /** La récompense en une ligne : « +60 XP · 540 P ». */
   public static Component recompense(Quete q) {
      if (q.pieces() > 0L) {
         return Component.translatable("cubelandmetiers.quete.recompense.xp_pieces", q.xp(), q.pieces());
      }
      return Component.translatable("cubelandmetiers.quete.recompense.xp", q.xp());
   }

   public static Component premiersPas(int etape) {
      return Component.translatable("cubelandmetiers.premiers_pas." + PremiersPas.borner(etape));
   }

   public static Component premiersPasDetail(int etape) {
      return Component.translatable("cubelandmetiers.premiers_pas." + PremiersPas.borner(etape) + ".detail");
   }

   public static Component poste(String poste) {
      return Component.translatable("cubelandmetiers.poste." + poste);
   }

   public static Component nomPlat(String id) {
      Plat p = Catalogue.parId(id);
      return p == null ? Component.literal(id) : p.nom();
   }
}
