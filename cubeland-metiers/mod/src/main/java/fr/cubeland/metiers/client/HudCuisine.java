package fr.cubeland.metiers.client;

import com.mojang.blaze3d.vertex.PoseStack;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.metier.Metier;
import fr.cubeland.metiers.quete.PremiersPas;
import fr.cubeland.metiers.quete.Quete;
import fr.cubeland.metiers.quete.TextesQuete;
import fr.cubeland.metiers.quete.TypeQuete;
import fr.cubeland.metiers.reseau.PaquetAnnonce;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetRepas;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.client.gui.overlay.ForgeGui;
import net.minecraftforge.client.gui.overlay.IGuiOverlay;

/**
 * Le HUD : un bandeau d'annonce en haut, la carte du repas en cours, la carte
 * du cuisinier avec la commande suivie, quand il y a quelque chose à dire.
 */
public final class HudCuisine implements IGuiOverlay {
   public static final HudCuisine INSTANCE = new HudCuisine();
   private static final long PERSISTANCE = 6000L;
   private static final int X = 8;
   private static final int L = 148;

   private HudCuisine() {
   }

   @Override
   public void render(ForgeGui gui, PoseStack pile, float delta, int largeur, int hauteur) {
      Minecraft mc = Minecraft.getInstance();
      if (mc.options.hideGui || mc.screen != null) {
         return;
      }
      LocalPlayer joueur = mc.player;
      if (joueur == null || !EtatClient.pret()) {
         return;
      }
      Dessin.melange(true);
      int y = 8;
      y = this.bandeau(pile, largeur, y);
      y = this.repas(pile, y);
      this.cuisinier(pile, joueur, y);
      Dessin.melange(false);
   }

   private int bandeau(PoseStack pile, int largeur, int y) {
      PaquetAnnonce a = EtatClient.annonce();
      if (a == null) {
         return y;
      }
      float part = EtatClient.partAnnonce();
      int alpha = (int) (Math.min(1.0F, part * 3.0F) * 224.0F);
      int accent = switch (a.genre()) {
         case PaquetAnnonce.PALIER -> Palette.AMBRE;
         case PaquetAnnonce.NIVEAU -> Palette.JADE;
         case PaquetAnnonce.COMMANDE -> Palette.CIEL;
         default -> Palette.AMBRE_CLAIR;
      };
      String titre = Txt.c(a.titre());
      String sous = Txt.c(a.sous());
      boolean deuxLignes = !sous.isBlank();
      int l = Math.max(Dessin.largeur(titre), deuxLignes ? Dessin.largeur(sous) : 0) + 28;
      int h = deuxLignes ? 34 : 24;
      int x = (largeur - l) / 2;
      Dessin.carte(pile, x, y, l, h, Palette.voile(Palette.CARTE, alpha), Palette.voile(accent, alpha));
      Dessin.rect(pile, x, y, 2, h, Palette.voile(accent, alpha));
      Dessin.texteCentre(pile, titre, x + l / 2, y + 7, accent);
      if (deuxLignes) {
         Dessin.texteCentre(pile, sous, x + l / 2, y + 20, Palette.TEXTE_DOUX);
      }
      return y + h + 6;
   }

   private int repas(PoseStack pile, int y) {
      PaquetRepas r = EtatClient.repas();
      if (r == null) {
         return y;
      }
      Plat plat = Catalogue.parId(r.plat());
      String nom = plat == null ? r.plat() : plat.nomTexte();
      String effet = plat == null ? "" : Ateliers.effet(plat.famille().effet());
      int h = 36;
      Dessin.carte(pile, X, y, L, h, Palette.voile(Palette.CARTE, 208), Palette.voile(Palette.JADE, 80));
      Dessin.rect(pile, X, y, 2, h, Palette.JADE);
      String et = Qualite.etoilesPleines(r.qualite());
      Dessin.texte(pile, Dessin.tronquer(nom, L - 20 - Dessin.largeur(et)), X + 8, y + 5, Palette.TEXTE);
      Dessin.texteDroite(pile, et, X + L - 8, y + 5, Palette.qualite(r.qualite()));
      Dessin.texte(pile, Dessin.tronquer(effet, L - 52), X + 8, y + 16, Palette.JADE);
      Dessin.texteDroite(pile, EtatClient.secondesRepas() + " s", X + L - 8, y + 16, Palette.TEXTE_DOUX);
      Dessin.barre(pile, X + 8, y + 27, L - 16, 3, EtatClient.partRepas(), Palette.voile(Palette.VIOLET, 176), Palette.JADE);
      return y + h + 6;
   }

   private void cuisinier(PoseStack pile, LocalPlayer joueur, int y) {
      PaquetEtat etat = EtatClient.etat();
      ItemStack main = joueur.getMainHandItem();
      ItemStack autre = joueur.getOffhandItem();
      boolean platEnMain = Catalogue.estUnPlat(main) || Catalogue.estUnPlat(autre);
      boolean frais = EtatClient.depuisActivite() < PERSISTANCE;
      String suivi = this.ligneSuivie();
      boolean commande = suivi != null;
      if (!platEnMain && !frais && !commande) {
         return;
      }
      int h = 40 + (platEnMain ? 12 : 0) + (commande ? 12 : 0);
      Dessin.carte(pile, X, y, L, h, Palette.voile(Palette.CARTE, 208), Palette.voile(Palette.AMBRE, 64));
      Dessin.rect(pile, X, y, 2, h, Palette.AMBRE_CHAUD);
      Dessin.texte(pile, Txt.t("metier.cuisinier"), X + 8, y + 5, Palette.AMBRE);
      Dessin.texteDroite(pile, Txt.t("hud.niveau", etat.niveauDe(Metier.CUISINIER)), X + L - 8, y + 5, Palette.TEXTE_DOUX);
      Dessin.barre(pile, X + 8, y + 16, L - 16, 3, Reglages.get().progression(etat.xpDe(Metier.CUISINIER)), Palette.voile(Palette.VIOLET, 176), Palette.AMBRE_CHAUD);
      Dessin.texte(pile, Txt.t("hud.palier", etat.palier()), X + 8, y + 24, Palette.TEXTE);
      if (etat.recettesPourSuivant() > 0) {
         Dessin.texteDroite(pile, etat.recettes() + " / " + etat.recettesPourSuivant(), X + L - 8, y + 24, Palette.TEXTE_FAIBLE);
         Dessin.barre(pile, X + 8, y + 34, L - 16, 2, (float) etat.recettes() / Math.max(1, etat.recettesPourSuivant()), Palette.voile(Palette.VIOLET, 128), Palette.JADE);
      } else {
         Dessin.texteDroite(pile, Txt.t("hud.recettes", etat.recettes()), X + L - 8, y + 24, Palette.JADE);
      }
      int ly = y + 41;
      if (commande) {
         Dessin.rect(pile, X + 8, ly + 3, 3, 3, Palette.CIEL);
         Dessin.texte(pile, Dessin.tronquer(suivi, L - 22), X + 14, ly, Palette.TEXTE_DOUX);
         ly += 12;
      }
      if (platEnMain) {
         ItemStack plat = Catalogue.estUnPlat(main) ? main : autre;
         int q = Qualite.de(plat);
         String et = q > 0 ? Qualite.etoilesPleines(q) : "";
         Dessin.texte(pile, Dessin.tronquer(plat.getHoverName().getString(), L - 20 - Dessin.largeur(et)), X + 8, ly, Palette.TEXTE_DOUX);
         if (q > 0) {
            Dessin.texteDroite(pile, et, X + L - 8, ly, Palette.qualite(q));
         }
      }
   }

   /** La ligne suivie sous la carte : l'étape des premiers pas, sinon la livraison en cours. */
   private String ligneSuivie() {
      if (EtatClient.premiersPasEnCours()) {
         int etape = EtatClient.premiersPas();
         return Txt.t("hud.premiers_pas", etape + 1, PremiersPas.FINI, Txt.c(TextesQuete.premiersPas(etape)));
      }
      Quete q = EtatClient.quete(TypeQuete.LIVRAISON);
      if (q == null) {
         return null;
      }
      Plat plat = Catalogue.parId(q.cible());
      String nom = plat == null ? q.cible() : plat.nomTexte();
      String qualite = q.qualiteMin() > 1 ? " " + Qualite.etoilesPleines(q.qualiteMin()) : "";
      return nom + " " + q.progres() + "/" + q.objectif() + qualite;
   }
}
