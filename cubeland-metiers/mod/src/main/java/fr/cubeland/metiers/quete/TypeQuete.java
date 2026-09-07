package fr.cubeland.metiers.quete;

/** Les trois sortes de commandes, toujours une de chaque dans le carnet. */
public enum TypeQuete {
   /** Cuisiner des plats qu'on ne connaît pas encore : fait monter les paliers. */
   DECOUVERTE,
   /** Livrer des plats connus au ravitailleur : fait gagner de l'argent. */
   LIVRAISON,
   /** Faire mieux, ou pour quelqu'un : qualité, favorite, un autre joueur. */
   MAITRISE;

   public String cle() {
      return this.name().toLowerCase(java.util.Locale.ROOT);
   }

   public static TypeQuete par(String nom) {
      for (TypeQuete t : values()) {
         if (t.name().equalsIgnoreCase(nom)) {
            return t;
         }
      }
      return DECOUVERTE;
   }
}
