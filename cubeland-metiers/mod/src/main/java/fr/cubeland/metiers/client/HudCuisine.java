package fr.cubeland.metiers.client;

import com.mojang.blaze3d.vertex.PoseStack;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.reseau.PaquetAnnonce;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetRepas;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.client.gui.overlay.ForgeGui;
import net.minecraftforge.client.gui.overlay.IGuiOverlay;

public final class HudCuisine implements IGuiOverlay {
   public static final HudCuisine INSTANCE = new HudCuisine();
   private static final long PERSISTANCE = 6000L;

   private HudCuisine() {
   }

   public void render(ForgeGui gui, PoseStack pile, float delta, int largeur, int hauteur) {
      Minecraft mc = Minecraft.getInstance();
      if (!mc.options.hideGui && mc.screen == null) {
         LocalPlayer joueur = mc.player;
         if (joueur != null && EtatClient.pret()) {
            Dessin.melange(true);
            int y = 8;
            y = this.bandeau(pile, largeur, y);
            y = this.repas(pile, y);
            this.cuisinier(pile, joueur, y);
            Dessin.melange(false);
         }
      }
   }

   private int bandeau(PoseStack pile, int largeur, int y) {
      PaquetAnnonce a = EtatClient.annonce();
      if (a == null) {
         return y;
      } else {
         float part = EtatClient.partAnnonce();
         int alpha = (int)(Math.min(1.0F, part * 3.0F) * 224.0F);

         int accent = switch (a.genre()) {
            case 1 -> -19874;
            case 2 -> -9453682;
            default -> -13951;
         };
         boolean sous = a.sous() != null && !a.sous().isBlank();
         int l = Math.max(Dessin.largeur(a.titre()), sous ? Dessin.largeur(a.sous()) : 0) + 28;
         int h = sous ? 34 : 24;
         int x = (largeur - l) / 2;
         Dessin.carte(pile, x, y, l, h, Palette.voile(-14411724, alpha), Palette.voile(accent, alpha));
         Dessin.rect(pile, x, y, 2, h, Palette.voile(accent, alpha));
         Dessin.texteCentre(pile, a.titre(), x + l / 2, y + 7, Palette.voile(accent, 255));
         if (sous) {
            Dessin.texteCentre(pile, a.sous(), x + l / 2, y + 20, -4873290);
         }

         return y + h + 6;
      }
   }

   private int repas(PoseStack pile, int y) {
      PaquetRepas r = EtatClient.repas();
      if (r == null) {
         return y;
      } else {
         int x = 8;
         int l = 148;
         int h = 36;
         Dessin.carte(pile, x, y, l, h, Palette.voile(-14411724, 208), Palette.voile(-9453682, 80));
         Dessin.rect(pile, x, y, 2, h, -9453682);
         String et = etoiles(r.qualite());
         Dessin.texte(pile, Dessin.tronquer(r.plat(), l - 20 - Dessin.largeur(et)), x + 8, y + 5, -791838);
         Dessin.texteDroite(pile, et, x + l - 8, y + 5, Palette.qualite(r.qualite()));
         Dessin.texte(pile, Dessin.tronquer(r.effet(), l - 52), x + 8, y + 16, -9453682);
         Dessin.texteDroite(pile, EtatClient.secondesRepas() + " s", x + l - 8, y + 16, -4873290);
         Dessin.barre(pile, x + 8, y + 27, l - 16, 3, EtatClient.partRepas(), Palette.voile(-11916715, 176), -9453682);
         return y + h + 6;
      }
   }

   private void cuisinier(PoseStack pile, LocalPlayer joueur, int y) {
      PaquetEtat etat = EtatClient.etat();
      ItemStack main = joueur.getMainHandItem();
      ItemStack autre = joueur.getOffhandItem();
      boolean platEnMain = Catalogue.estUnPlat(main) || Catalogue.estUnPlat(autre);
      boolean frais = EtatClient.depuisActivite() < 6000L;
      if (platEnMain || frais) {
         int x = 8;
         int l = 148;
         int h = platEnMain ? 52 : 40;
         Dessin.carte(pile, x, y, l, h, Palette.voile(-14411724, 208), Palette.voile(-19874, 64));
         Dessin.rect(pile, x, y, 2, h, -1013188);
         Dessin.texte(pile, "Cuisinier", x + 8, y + 5, -19874);
         Dessin.texteDroite(pile, "niv. " + etat.niveauDe("cuisinier"), x + l - 8, y + 5, -4873290);
         Dessin.barre(pile, x + 8, y + 16, l - 16, 3, Reglages.get().progression(etat.xpDe("cuisinier")), Palette.voile(-11916715, 176), -1013188);
         Dessin.texte(pile, "Palier " + etat.palier(), x + 8, y + 24, -791838);
         if (etat.recettesPourSuivant() > 0) {
            Dessin.texteDroite(pile, etat.recettes() + " / " + etat.recettesPourSuivant(), x + l - 8, y + 24, -8491387);
            Dessin.barre(
               pile, x + 8, y + 34, l - 16, 2, (float)etat.recettes() / (float)Math.max(1, etat.recettesPourSuivant()), Palette.voile(-11916715, 128), -9453682
            );
         } else {
            Dessin.texteDroite(pile, etat.recettes() + " recettes", x + l - 8, y + 24, -9453682);
         }

         if (platEnMain) {
            ItemStack plat = Catalogue.estUnPlat(main) ? main : autre;
            int q = Qualite.de(plat);
            String et = q > 0 ? etoiles(q) : "";
            Dessin.texte(pile, Dessin.tronquer(plat.getHoverName().getString(), l - 20 - Dessin.largeur(et)), x + 8, y + 41, -4873290);
            if (q > 0) {
               Dessin.texteDroite(pile, et, x + l - 8, y + 41, Palette.qualite(q));
            }
         }
      }
   }

   private static String etoiles(int q) {
      StringBuilder b = new StringBuilder();

      for (int i = 0; i < Math.max(0, q); i++) {
         b.append('★');
      }

      return b.toString();
   }
}
