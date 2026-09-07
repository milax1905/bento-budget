package fr.cubeland.metiers.client;

import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

/** Les textes de l'interface, traduits chez le joueur. Toutes les clés commencent par {@code cubelandmetiers.}. */
public final class Txt {
   private static final String PREFIXE = "cubelandmetiers.";

   private Txt() {
   }

   /** Traduit une clé courte : {@code t("ui.retour")} lit {@code cubelandmetiers.ui.retour}. */
   public static String t(String cle, Object... args) {
      return I18n.get(PREFIXE + cle, args);
   }

   /** Le texte d'un composant, traduit. */
   public static String c(Component composant) {
      return composant == null ? "" : composant.getString();
   }

   public static String maj(String s) {
      return s.toUpperCase(java.util.Locale.ROOT);
   }
}
