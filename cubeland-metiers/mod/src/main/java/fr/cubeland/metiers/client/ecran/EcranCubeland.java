package fr.cubeland.metiers.client.ecran;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.client.Dessin;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.client.Palette;
import fr.cubeland.metiers.client.Txt;
import fr.cubeland.metiers.reseau.PaquetDemande;
import fr.cubeland.metiers.reseau.PaquetDemandeFiche;
import fr.cubeland.metiers.reseau.Reseau;
import java.util.Random;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Le panneau Cubeland : un cadre de 430 × 230 mis à l'échelle, trois onglets,
 * et des pages qui se dessinent dedans.
 *
 * <p>L'écran ne connaît aucune coordonnée des pages. Chaque page déclare ses
 * zones cliquables en se dessinant ; le clic retrouve la zone sous la souris.</p>
 */
public class EcranCubeland extends Screen {
   public static final int LARGEUR = 430;
   public static final int HAUTEUR = 230;
   public static final int MARGE = 10;
   public static final int ONGLET_METIERS = 0;
   public static final int ONGLET_CUISINE = 1;
   public static final int ONGLET_LIVRE = 2;
   private static final int[] ETOILES = new int[300];
   private static final int TOUCHE_ECHAP = 256;

   static {
      Random r = new Random(20260903L);
      int[] teintes = new int[]{0xFF2C1F3C, 0xFF3A2A4E, 0xFF4A3A5E};
      for (int i = 0; i < ETOILES.length; i += 3) {
         ETOILES[i] = r.nextInt(LARGEUR);
         ETOILES[i + 1] = r.nextInt(HAUTEUR);
         ETOILES[i + 2] = teintes[r.nextInt(3)];
      }
   }

   private final PageMetiers pageMetiers = new PageMetiers(this);
   private final PageCuisine pageCuisine = new PageCuisine(this);
   private final PageLivre pageLivre = new PageLivre(this);
   private PageFiche fiche;
   private PageGuide guide;
   private int onglet;
   private String platADemander;
   private float echelle = 1.0F;
   private int decX;
   private int decY;
   private Contexte dernier;

   public EcranCubeland(int onglet) {
      this(onglet, null);
   }

   public EcranCubeland(int onglet, String plat) {
      super(Component.translatable("cubelandmetiers.ui.titre"));
      this.onglet = Math.max(ONGLET_METIERS, Math.min(ONGLET_LIVRE, onglet));
      if (plat != null && !plat.isBlank()) {
         this.platADemander = plat;
      }
   }

   // --- cycle de vie ---------------------------------------------------------

   @Override
   protected void init() {
      float e = Math.min(this.width * 0.92F / LARGEUR, this.height * 0.92F / HAUTEUR);
      this.echelle = Math.max(1.0F, Math.min(3.0F, (float) Math.floor(e)));
      this.decX = (int) ((this.width - LARGEUR * this.echelle) / 2.0F);
      this.decY = (int) ((this.height - HAUTEUR * this.echelle) / 2.0F);
      if (this.platADemander != null) {
         this.ouvrirFiche(this.platADemander);
         this.platADemander = null;
      }
      if (this.dernier == null && !EtatClient.horsLigne()) {
         Reseau.versServeur(new PaquetDemande());
      }
   }

   @Override
   public boolean isPauseScreen() {
      return false;
   }

   private double mx(double sx) {
      return (sx - this.decX) / this.echelle;
   }

   private double my(double sy) {
      return (sy - this.decY) / this.echelle;
   }

   private Page courante() {
      if (this.fiche != null) {
         return this.fiche;
      }
      if (this.guide != null) {
         return this.guide;
      }
      return switch (this.onglet) {
         case ONGLET_METIERS -> this.pageMetiers;
         case ONGLET_CUISINE -> this.pageCuisine;
         default -> this.pageLivre;
      };
   }

   // --- navigation, appelée par les pages -----------------------------------

   public void allerA(int onglet) {
      this.onglet = onglet;
      this.fiche = null;
      this.guide = null;
      this.courante().ouvrir();
   }

   public void ouvrirFiche(String platId) {
      this.onglet = ONGLET_LIVRE;
      this.guide = null;
      this.fiche = new PageFiche(this, platId);
      EtatClient.oublierFiche();
      if (!EtatClient.horsLigne()) {
         Reseau.versServeur(new PaquetDemandeFiche(platId));
      }
      this.fiche.ouvrir();
   }

   public void ouvrirGuide(int section) {
      this.onglet = ONGLET_LIVRE;
      this.fiche = null;
      this.guide = new PageGuide(this, section);
   }

   public void fermerSousPage() {
      this.fiche = null;
      this.guide = null;
   }

   // --- rendu ----------------------------------------------------------------

   @Override
   public void render(PoseStack pile, int sxEcran, int syEcran, float delta) {
      this.renderBackground(pile);
      PoseStack mv = RenderSystem.getModelViewStack();
      mv.pushPose();
      mv.translate(this.decX, this.decY, 0.0);
      mv.scale(this.echelle, this.echelle, 1.0F);
      RenderSystem.applyModelViewMatrix();

      Contexte c = new Contexte(pile, (int) Math.round(this.mx(sxEcran)), (int) Math.round(this.my(syEcran)));
      this.fond(pile);
      this.enTete(c);
      if (EtatClient.pret()) {
         this.courante().dessiner(c);
      } else {
         Dessin.texteCentre(pile, Txt.t("ui.attente"), LARGEUR / 2, HAUTEUR / 2, Palette.TEXTE_FAIBLE);
      }
      if (c.bulle() != null) {
         Dessin.infobulle(pile, c.bulle(), c.bulleX(), c.bulleY(), LARGEUR - 4);
      }
      this.dernier = c;

      mv.popPose();
      RenderSystem.applyModelViewMatrix();
      super.render(pile, sxEcran, syEcran, delta);
   }

   private void fond(PoseStack pile) {
      Dessin.rect(pile, 0, 0, LARGEUR, HAUTEUR, Palette.voile(Palette.NUIT, 242));
      for (int i = 0; i < ETOILES.length; i += 3) {
         Dessin.rect(pile, ETOILES[i], ETOILES[i + 1], 1, 1, ETOILES[i + 2]);
      }
      Dessin.equerres(pile, MARGE, MARGE, LARGEUR - 2 * MARGE, HAUTEUR - 2 * MARGE, 15, Palette.voile(Palette.VIOLET, 192));
   }

   private void enTete(Contexte c) {
      int x0 = Widgets.BORD;
      int y0 = MARGE + 3;
      Dessin.texte(c.pile, "CUBELAND", x0, y0, Palette.AMBRE);
      int x = x0 + Dessin.largeur("CUBELAND") + 8;
      String[] noms = new String[]{Txt.maj(Txt.t("ui.onglet.metiers")), Txt.maj(Txt.t("ui.onglet.cuisine")), Txt.maj(Txt.t("ui.onglet.livre"))};
      for (int i = 0; i < noms.length; i++) {
         int l = Dessin.largeur(noms[i]);
         boolean actif = this.onglet == i;
         int cible = i;
         boolean survol = c.zone(x, y0 - 2, l, 12, () -> this.allerA(cible));
         Dessin.texte(c.pile, noms[i], x, y0, actif ? Palette.AMBRE : (survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE));
         if (actif) {
            Dessin.trait(c.pile, x, y0 + 10, l, Palette.AMBRE);
         }
         x += l + 10;
      }
      Dessin.texteDroite(c.pile, "v" + CubelandMetiers.version(), Widgets.DROITE, y0, Palette.voile(Palette.VIOLET, 255));
      Dessin.trait(c.pile, x0, MARGE + 17, LARGEUR - 2 * Widgets.BORD, Palette.voile(Palette.AMBRE, 40));
   }

   // --- entrées --------------------------------------------------------------

   @Override
   public boolean mouseClicked(double sxEcran, double syEcran, int bouton) {
      if (bouton != 0 || this.dernier == null) {
         return super.mouseClicked(sxEcran, syEcran, bouton);
      }
      Contexte.Zone z = this.dernier.sous(this.mx(sxEcran), this.my(syEcran));
      if (z != null) {
         z.action().run();
         return true;
      }
      this.courante().clicAilleurs();
      return super.mouseClicked(sxEcran, syEcran, bouton);
   }

   @Override
   public boolean charTyped(char ch, int mods) {
      return this.courante().caractere(ch, mods) || super.charTyped(ch, mods);
   }

   @Override
   public boolean keyPressed(int touche, int scan, int mods) {
      if (touche == TOUCHE_ECHAP) {
         if (this.courante().echap()) {
            return true;
         }
         if (this.fiche != null || this.guide != null) {
            this.fermerSousPage();
            return true;
         }
         return super.keyPressed(touche, scan, mods);
      }
      return this.courante().touche(touche, scan, mods) || super.keyPressed(touche, scan, mods);
   }

   @Override
   public boolean mouseScrolled(double sxEcran, double syEcran, double sens) {
      return this.courante().molette(sens) || super.mouseScrolled(sxEcran, syEcran, sens);
   }
}
