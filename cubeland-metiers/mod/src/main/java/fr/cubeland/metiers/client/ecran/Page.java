package fr.cubeland.metiers.client.ecran;

/** Une page du panneau. Elle se dessine et déclare ses zones ; l'écran fait le reste. */
public interface Page {
   void dessiner(Contexte c);

   /** Appelée quand la page devient visible. */
   default void ouvrir() {
   }

   /** Un clic hors de toute zone : pour désactiver un champ, par exemple. */
   default void clicAilleurs() {
   }

   default boolean caractere(char ch, int mods) {
      return false;
   }

   /** Retourne vrai si la touche a été consommée. Échap est géré par l'écran avant. */
   default boolean touche(int touche, int scan, int mods) {
      return false;
   }

   default boolean molette(double sens) {
      return false;
   }

   /** Retourne vrai si Échap a été absorbé (fermeture d'un sous-état) plutôt que de fermer l'écran. */
   default boolean echap() {
      return false;
   }
}
