package fr.cubeland.metiers.client.ecran;

import com.mojang.blaze3d.vertex.PoseStack;
import java.util.ArrayList;
import java.util.List;

/**
 * Ce qu'une page reçoit pour se dessiner : la pile de rendu, la souris en
 * coordonnées du panneau, et de quoi déclarer ses zones cliquables.
 *
 * <p>Une zone se déclare pendant le dessin, au même endroit que ce qu'elle
 * couvre. Le clic la retrouve ensuite sans recopier une seule coordonnée.</p>
 */
public final class Contexte {
   public final PoseStack pile;
   public final int sx;
   public final int sy;
   private final List<Zone> zones = new ArrayList<>();
   private String[] bulle;
   private int bulleX;
   private int bulleY;

   Contexte(PoseStack pile, int sx, int sy) {
      this.pile = pile;
      this.sx = sx;
      this.sy = sy;
   }

   /** Vrai si la souris est sur ce rectangle. */
   public boolean survol(int x, int y, int l, int h) {
      return this.sx >= x && this.sx <= x + l && this.sy >= y && this.sy <= y + h;
   }

   /** Vrai si la souris est dans ce disque. */
   public boolean survolDisque(int cx, int cy, int rayon) {
      int dx = this.sx - cx;
      int dy = this.sy - cy;
      return dx * dx + dy * dy <= rayon * rayon;
   }

   /** Déclare un rectangle cliquable. Retourne vrai si la souris le survole, pour dessiner l'état. */
   public boolean zone(int x, int y, int l, int h, Runnable action) {
      this.zones.add(new Zone(x, y, l, h, action));
      return this.survol(x, y, l, h);
   }

   /** Déclare un disque cliquable. */
   public boolean zoneDisque(int cx, int cy, int rayon, Runnable action) {
      this.zones.add(new Zone(cx - rayon, cy - rayon, rayon * 2, rayon * 2, action));
      return this.survolDisque(cx, cy, rayon);
   }

   /** Pose une infobulle, dessinée par-dessus tout à la fin. */
   public void bulle(String... lignes) {
      this.bulle = lignes;
      this.bulleX = this.sx;
      this.bulleY = this.sy;
   }

   String[] bulle() {
      return this.bulle;
   }

   int bulleX() {
      return this.bulleX;
   }

   int bulleY() {
      return this.bulleY;
   }

   /** Trouve la zone sous ce point (la dernière déclarée gagne : elle est dessinée par-dessus). */
   Zone sous(double x, double y) {
      for (int i = this.zones.size() - 1; i >= 0; i--) {
         Zone z = this.zones.get(i);
         if (z.contient(x, y)) {
            return z;
         }
      }
      return null;
   }

   record Zone(int x, int y, int l, int h, Runnable action) {
      boolean contient(double px, double py) {
         return px >= this.x && px <= this.x + this.l && py >= this.y && py <= this.y + this.h;
      }
   }
}
