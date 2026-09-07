package fr.cubeland.metiers.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiComponent;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

public final class Dessin {
   private static final Dessin.Pinceau PINCEAU = new Dessin.Pinceau();
   public static final int COUPE = 4;

   private Dessin() {
   }

   public static void rect(PoseStack pile, int x, int y, int l, int h, int couleur) {
      GuiComponent.fill(pile, x, y, x + l, y + h, couleur);
   }

   public static void degrade(PoseStack pile, int x, int y, int l, int h, int haut, int bas) {
      PINCEAU.degrade(pile, x, y, x + l, y + h, haut, bas);
   }

   public static void trait(PoseStack pile, int x, int y, int l, int couleur) {
      rect(pile, x, y, l, 1, couleur);
   }

   public static void panneau(PoseStack pile, int x, int y, int l, int h, int coupe, int couleur) {
      if (l > 0 && h > 0) {
         coupe = Math.max(0, Math.min(coupe, Math.min(l, h) / 2));
         rect(pile, x, y + coupe, l, h - 2 * coupe, couleur);

         for (int i = 0; i < coupe; i++) {
            int marge = coupe - i;
            rect(pile, x + marge, y + i, l - 2 * marge, 1, couleur);
            rect(pile, x + marge, y + h - i - 1, l - 2 * marge, 1, couleur);
         }
      }
   }

   public static void panneauBorde(PoseStack pile, int x, int y, int l, int h, int coupe, int bord, int fond) {
      panneau(pile, x, y, l, h, coupe, bord);
      panneau(pile, x + 1, y + 1, l - 2, h - 2, Math.max(0, coupe - 1), fond);
   }

   public static void carte(PoseStack pile, int x, int y, int l, int h, int fond, int bord) {
      panneau(pile, x, y, l, h, 4, bord);
      panneau(pile, x + 1, y + 1, l - 2, h - 2, 3, fond);
      degrade(pile, x + 1, y + 4, l - 2, h - 8, eclaircir(fond, 16), fond);
   }

   public static void carteMate(PoseStack pile, int x, int y, int l, int h, int fond, int bord) {
      panneau(pile, x, y, l, h, 4, bord);
      if (fond >>> 24 != 0) {
         panneau(pile, x + 1, y + 1, l - 2, h - 2, 3, fond);
      }
   }

   public static void ombre(PoseStack pile, int x, int y, int l, int h) {
      panneau(pile, x + 3, y + 3, l, h, 4, 1711276032);
   }

   public static int eclaircir(int couleur, int cran) {
      int a = couleur >>> 24 & 0xFF;
      int r = couleur >> 16 & 0xFF;
      int v = couleur >> 8 & 0xFF;
      int b = couleur & 0xFF;
      r = Math.min(255, r + cran);
      v = Math.min(255, v + cran);
      b = Math.min(255, b + cran);
      return a << 24 | r << 16 | v << 8 | b;
   }

   public static void barre(PoseStack pile, int x, int y, int l, int h, float part, int fond, int remplissage) {
      rect(pile, x, y, l, h, fond);
      int rempli = Math.max(0, Math.min(l, Math.round((float)l * Math.max(0.0F, Math.min(1.0F, part)))));
      if (rempli > 0) {
         degrade(pile, x, y, rempli, h, eclaircir(remplissage, 30), remplissage);
         if (rempli > 2) {
            rect(pile, x + rempli - 1, y, 1, h, eclaircir(remplissage, 70));
         }
      }
   }

   public static void texte(PoseStack pile, String t, int x, int y, int couleur) {
      police().draw(pile, t, (float)x, (float)y, couleur);
   }

   public static void texteOmbre(PoseStack pile, String t, int x, int y, int couleur) {
      police().drawShadow(pile, t, (float)x, (float)y, couleur);
   }

   public static void texteDroite(PoseStack pile, String t, int droite, int y, int couleur) {
      police().draw(pile, t, (float)(droite - police().width(t)), (float)y, couleur);
   }

   public static void texteCentre(PoseStack pile, String t, int centre, int y, int couleur) {
      police().draw(pile, t, (float)centre - (float)police().width(t) / 2.0F, (float)y, couleur);
   }

   public static int largeur(String t) {
      return police().width(t);
   }

   public static void texteGrand(PoseStack pile, String t, int x, int y, float echelle, int couleur) {
      pile.pushPose();
      pile.translate((double)x, (double)y, 0.0);
      pile.scale(echelle, echelle, 1.0F);
      police().draw(pile, t, 0.0F, 0.0F, couleur);
      pile.popPose();
   }

   public static void texteGrandCentre(PoseStack pile, String t, int centre, int y, float echelle, int couleur) {
      texteGrand(pile, t, Math.round((float)centre - (float)police().width(t) * echelle / 2.0F), y, echelle, couleur);
   }

   public static void pastille(PoseStack pile, int x, int y, int couleur) {
      rect(pile, x, y, 3, 3, couleur);
   }

   public static Font police() {
      return Minecraft.getInstance().font;
   }

   public static void arc(PoseStack pile, int cx, int cy, int rayon, int epaisseur, int couleur, float degDebut, float degBalayage) {
      if (rayon > 0 && epaisseur > 0 && degBalayage != 0.0F) {
         int r0 = rayon - epaisseur / 2;

         for (int r = r0; r < r0 + epaisseur; r++) {
            if (r > 0) {
               float pas = (float)Math.toDegrees(1.0 / (double)r) * 0.8F;
               int n = Math.max(1, Math.round(Math.abs(degBalayage) / pas));
               float sens = Math.signum(degBalayage);

               for (int i = 0; i <= n; i++) {
                  double a = Math.toRadians((double)(degDebut + sens * (float)i * pas));
                  rect(pile, cx + (int)Math.round(Math.cos(a) * (double)r), cy + (int)Math.round(Math.sin(a) * (double)r), 1, 1, couleur);
               }
            }
         }
      }
   }

   public static void anneau(PoseStack pile, int cx, int cy, int rayon, int ep, int couleur) {
      arc(pile, cx, cy, rayon, ep, couleur, -90.0F, 360.0F);
   }

   public static void disque(PoseStack pile, int cx, int cy, int rayon, int couleur) {
      for (int dy = -rayon; dy <= rayon; dy++) {
         int demi = (int)Math.round(Math.sqrt((double)rayon * (double)rayon - (double)dy * (double)dy));
         if (demi > 0) {
            rect(pile, cx - demi, cy + dy, demi * 2, 1, couleur);
         }
      }
   }

   public static void trait(PoseStack pile, int x1, int y1, int x2, int y2, int couleur) {
      int n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      if (n != 0) {
         for (int i = 0; i <= n; i++) {
            int x = x1 + (x2 - x1) * i / n;
            int y = y1 + (y2 - y1) * i / n;
            rect(pile, x, y, 1, 1, couleur);
         }
      }
   }

   public static void graduations(PoseStack pile, int cx, int cy, int rayon, int nb, int petite, int grande, int cFin, int cFort) {
      for (int k = 0; k < nb; k++) {
         double a = Math.toRadians((double)k * 360.0 / (double)nb - 90.0);
         boolean fort = k % 5 == 0;
         int r1 = rayon + (fort ? grande : petite);
         trait(
            pile,
            cx + (int)(Math.cos(a) * (double)rayon),
            cy + (int)(Math.sin(a) * (double)rayon),
            cx + (int)(Math.cos(a) * (double)r1),
            cy + (int)(Math.sin(a) * (double)r1),
            fort ? cFort : cFin
         );
      }
   }

   public static void lueur(PoseStack pile, int cx, int cy, int rayon, int couleur, int couches) {
      anneau(pile, cx, cy, rayon + 3, 1, voileAlpha(couleur, 80));
   }

   private static int voileAlpha(int couleur, int alpha) {
      return couleur & 16777215 | (alpha & 0xFF) << 24;
   }

   public static void equerres(PoseStack pile, int x, int y, int l, int h, int taille, int couleur) {
      rect(pile, x, y, taille, 1, couleur);
      rect(pile, x, y, 1, taille, couleur);
      rect(pile, x + l - taille, y, taille, 1, couleur);
      rect(pile, x + l - 1, y, 1, taille, couleur);
      rect(pile, x, y + h - 1, taille, 1, couleur);
      rect(pile, x, y + h - taille, 1, taille, couleur);
      rect(pile, x + l - taille, y + h - 1, taille, 1, couleur);
      rect(pile, x + l - 1, y + h - taille, 1, taille, couleur);
   }

   public static void objet(ItemStack pile, int x, int y) {
      if (pile != null && !pile.isEmpty()) {
         Minecraft mc = Minecraft.getInstance();

         try {
            mc.getItemRenderer().renderAndDecorateItem(pile, x, y);
         } catch (Throwable var5) {
         }
      }
   }

   public static void emplacement(PoseStack pile, int x, int y) {
      panneau(pile, x, y, 18, 18, 2, -15857641);
      panneau(pile, x + 1, y + 1, 16, 16, 1, -15003607);
      rect(pile, x + 2, y + 16, 14, 1, -12965298);
      rect(pile, x + 16, y + 2, 1, 14, -12965298);
   }

   public static void emplacement(PoseStack pile, String id, int x, int y) {
      emplacement(pile, x, y);
      objet(id, x + 1, y + 1);
   }

   public static void objetGrand(String id, int x, int y, float echelle) {
      ResourceLocation rl = ResourceLocation.tryParse(id);
      if (rl != null) {
         Item item = (Item)ForgeRegistries.ITEMS.getValue(rl);
         if (item != null) {
            PoseStack mv = RenderSystem.getModelViewStack();
            mv.pushPose();
            mv.translate((double)x, (double)y, 0.0);
            mv.scale(echelle, echelle, 1.0F);
            RenderSystem.applyModelViewMatrix();
            objet(new ItemStack(item), 0, 0);
            mv.popPose();
            RenderSystem.applyModelViewMatrix();
         }
      }
   }

   public static void objet(String id, int x, int y) {
      ResourceLocation rl = ResourceLocation.tryParse(id);
      if (rl != null) {
         Item item = (Item)ForgeRegistries.ITEMS.getValue(rl);
         if (item != null) {
            objet(new ItemStack(item), x, y);
         }
      }
   }

   public static void melange(boolean actif) {
      if (actif) {
         RenderSystem.enableBlend();
         RenderSystem.defaultBlendFunc();
      } else {
         RenderSystem.disableBlend();
      }
   }

   public static void infobulle(PoseStack pile, String[] lignes, int x, int y, int maxX) {
      if (lignes != null && lignes.length != 0) {
         int l = 0;

         for (String t : lignes) {
            l = Math.max(l, largeur(t));
         }

         l += 10;
         int h = lignes.length * 10 + 6;
         int bx = Math.max(2, Math.min(x + 8, maxX - l - 2));
         int by = Math.max(2, y - h - 4);
         pile.pushPose();
         pile.translate(0.0, 0.0, 300.0);
         carteMate(pile, bx, by, l, h, Palette.voile(Palette.NUIT, 240), Palette.voile(Palette.VIOLET, 224));

         for (int i = 0; i < lignes.length; i++) {
            texte(pile, lignes[i], bx + 5, by + 4 + i * 10, i == 0 ? Palette.TEXTE : Palette.TEXTE_FAIBLE);
         }

         pile.popPose();
      }
   }

   public static String tronquer(String t, int largeurMax) {
      if (largeur(t) <= largeurMax) {
         return t;
      } else {
         String s = t;

         while (s.length() > 1 && largeur(s + "…") > largeurMax) {
            s = s.substring(0, s.length() - 1);
         }

         return s + "…";
      }
   }

   private static final class Pinceau extends GuiComponent {
      void degrade(PoseStack pile, int x, int y, int x2, int y2, int haut, int bas) {
         this.fillGradient(pile, x, y, x2, y2, haut, bas);
      }
   }
}
