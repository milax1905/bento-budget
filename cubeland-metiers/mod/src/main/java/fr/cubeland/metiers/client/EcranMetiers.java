package fr.cubeland.metiers.client;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.cuisine.Famille;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.cuisine.Recettes;
import fr.cubeland.metiers.metier.Metiers;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import fr.cubeland.metiers.reseau.PaquetDemande;
import fr.cubeland.metiers.reseau.PaquetDemandeFiche;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.Reseau;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class EcranMetiers extends Screen {
   private static final int LARGEUR = 430;
   private static final int HAUTEUR = 230;
   private static final int MARGE = 10;
   private static final String[] ONGLETS = new String[]{"METIERS", "CUISINE", "LE LIVRE"};
   private static final String[] GUIDE = new String[]{"Debuter", "Paliers", "Familles", "Qualites", "Vendre"};
   private static final int[] ETOILES = new int[300];

   // grille du livre : 4 colonnes de 94, 3 rangees de 50
   private static final int COLS = 4;
   private static final int CW = 94;
   private static final int CH = 50;
   private static final int PAS_X = 100;
   private static final int PAS_Y = 54;

   private int gauche;
   private int haut;
   private float echelle = 1.0F;
   private int decX;
   private int decY;
   private int onglet;
   private String metierOuvert;
   private String platOuvert;
   private int ficheVolet;
   private int guideSection = -1;
   private int defilement;
   private String recherche = "";
   private String familleFiltre = "";
   private boolean champActif;

   // cache du filtre : recalcule seulement quand recherche, filtre ou paquet changent
   private List<PaquetCuisine.Ligne> cacheLignes;
   private String cacheRecherche = "";
   private String cacheFamille = "";
   private PaquetCuisine cachePaquet;

   // infobulle posee pendant le rendu, dessinee par-dessus tout a la fin
   private String[] bulle;
   private int bulleX;
   private int bulleY;

   public EcranMetiers(int onglet) {
      this(onglet, null);
   }

   public EcranMetiers(int onglet, String plat) {
      super(Component.literal("Metiers"));
      this.onglet = Math.max(0, Math.min(2, onglet));
      if (plat != null && !plat.isBlank()) {
         this.platOuvert = plat;
         this.ficheVolet = 0;
      }
   }

   protected void init() {
      float e = Math.min((float)this.width * 0.92F / 430.0F, (float)this.height * 0.92F / 230.0F);
      this.echelle = Math.max(1.0F, Math.min(3.0F, (float)Math.floor((double)e)));
      this.decX = (int)(((float)this.width - 430.0F * this.echelle) / 2.0F);
      this.decY = (int)(((float)this.height - 230.0F * this.echelle) / 2.0F);
      this.gauche = 0;
      this.haut = 0;
      if (this.platOuvert != null) {
         this.demanderFiche(this.platOuvert);
      }

      if (!Demo.horsLigne()) {
         Reseau.versServeur(new PaquetDemande(1));
      }
   }

   private double mx(double sx) {
      return (sx - (double)this.decX) / (double)this.echelle;
   }

   private double my(double sy) {
      return (sy - (double)this.decY) / (double)this.echelle;
   }

   public boolean isPauseScreen() {
      return false;
   }

   public void render(PoseStack pile, int sxEcran, int syEcran, float delta) {
      this.renderBackground(pile);
      PoseStack mv = RenderSystem.getModelViewStack();
      mv.pushPose();
      mv.translate((double)this.decX, (double)this.decY, 0.0);
      mv.scale(this.echelle, this.echelle, 1.0F);
      RenderSystem.applyModelViewMatrix();
      int sx = (int)Math.round(this.mx((double)sxEcran));
      int sy = (int)Math.round(this.my((double)syEcran));
      this.bulle = null;
      Dessin.rect(pile, this.gauche, this.haut, 430, 230, Palette.voile(Palette.NUIT, 242));

      for (int i = 0; i < ETOILES.length; i += 3) {
         Dessin.rect(pile, this.gauche + ETOILES[i], this.haut + ETOILES[i + 1], 1, 1, ETOILES[i + 2]);
      }

      Dessin.equerres(pile, this.gauche + 10, this.haut + 10, 410, 210, 15, Palette.voile(Palette.VIOLET, 192));
      this.enTete(pile, sx, sy);
      if (EtatClient.pret()) {
         switch (this.onglet) {
            case 0:
               this.pageMetiers(pile, sx, sy);
               break;
            case 1:
               this.pageCuisine(pile, sx, sy);
               break;
            default:
               if (this.guideSection >= 0) {
                  this.guide(pile, sx, sy);
               } else if (this.platOuvert != null) {
                  this.fichePlat(pile, sx, sy);
               } else {
                  this.leLivre(pile, sx, sy);
               }
         }
      } else {
         Dessin.texteCentre(pile, "…", this.gauche + 215, this.haut + 115, Palette.TEXTE_FAIBLE);
      }

      if (this.bulle != null) {
         Dessin.infobulle(pile, this.bulle, this.bulleX, this.bulleY, this.gauche + 426);
      }

      mv.popPose();
      RenderSystem.applyModelViewMatrix();
      super.render(pile, sxEcran, syEcran, delta);
   }

   private void poserBulle(int sx, int sy, String... lignes) {
      this.bulle = lignes;
      this.bulleX = sx;
      this.bulleY = sy;
   }

   private int xOnglet(int i) {
      int x = this.gauche + 10 + 7 + Dessin.largeur("CUBELAND") + 8;

      for (int k = 0; k < i; k++) {
         x += Dessin.largeur(ONGLETS[k]) + 10;
      }

      return x;
   }

   private void enTete(PoseStack pile, int sx, int sy) {
      int x0 = this.gauche + 10 + 7;
      int y0 = this.haut + 10 + 3;
      Dessin.texte(pile, "CUBELAND", x0, y0, Palette.AMBRE);

      for (int i = 0; i < ONGLETS.length; i++) {
         int x = this.xOnglet(i);
         int l = Dessin.largeur(ONGLETS[i]);
         boolean actif = this.onglet == i;
         boolean survol = sx >= x && sx <= x + l && sy >= y0 - 2 && sy <= y0 + 10;
         Dessin.texte(pile, ONGLETS[i], x, y0, actif ? Palette.AMBRE : (survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE));
         if (actif) {
            Dessin.trait(pile, x, y0 + 10, l, Palette.AMBRE);
         }
      }

      Dessin.texteDroite(pile, "v" + CubelandMetiers.version(), this.gauche + 430 - 10 - 7, y0, Palette.voile(Palette.VIOLET, 255));
      Dessin.trait(pile, x0, this.haut + 10 + 17, 396, Palette.voile(Palette.AMBRE, 40));
   }

   private void retour(PoseStack pile, int sx, int sy) {
      Dessin.texte(pile, "‹ retour", this.gauche + 10 + 7, this.haut + 10 + 22, this.surRetour((double)sx, (double)sy) ? Palette.TEXTE : Palette.TEXTE_FAIBLE);
   }

   private boolean surRetour(double sx, double sy) {
      return sx >= (double)(this.gauche + 10 + 7)
         && sx <= (double)(this.gauche + 10 + 55)
         && sy >= (double)(this.haut + 10 + 20)
         && sy <= (double)(this.haut + 10 + 32);
   }

   private int cxCadran() {
      return this.gauche + 129;
   }

   private int cyCadran() {
      return this.haut + 124;
   }

   private void cadran(PoseStack pile, float part, String gros, String sousTitre, int accent) {
      int cx = this.cxCadran();
      int cy = this.cyCadran();
      Dessin.anneau(pile, cx, cy, 47, 1, Palette.voile(Palette.VIOLET, 112));
      Dessin.anneau(pile, cx, cy, 38, 3, Palette.voile(Palette.VIOLET, 192));
      Dessin.arc(pile, cx, cy, 38, 3, accent, -90.0F, 360.0F * Math.max(0.0F, Math.min(1.0F, part)));
      Dessin.anneau(pile, cx, cy, 31, 1, Palette.voile(Palette.VIOLET, 112));
      Dessin.graduations(pile, cx, cy, 42, 60, 2, 4, Palette.voile(Palette.VIOLET, 144), Palette.voile(Palette.AMBRE, 112));
      double a = Math.toRadians((double)(-90.0F + 360.0F * Math.max(0.0F, Math.min(1.0F, part))));
      int bx = cx + (int)(Math.cos(a) * 38.0);
      int by = cy + (int)(Math.sin(a) * 38.0);
      Dessin.disque(pile, bx, by, 3, Palette.voile(accent, 96));
      Dessin.disque(pile, bx, by, 2, Palette.AMBRE_CLAIR);
      if (gros != null) {
         Dessin.texteGrandCentre(pile, gros, cx, cy - 18, 2.4F, Palette.AMBRE);
      }

      if (sousTitre != null) {
         Dessin.trait(pile, cx - 14, cy + 8, 28, Palette.voile(Palette.VIOLET, 224));
         int espace = sousTitre.indexOf(32);
         String court = espace > 0 ? sousTitre.substring(0, espace) : sousTitre;
         Dessin.texteCentre(pile, Dessin.tronquer(court, 72), cx, cy + 13, Palette.AMBRE_CLAIR);
      }
   }

   // Un satellite du cadran : disque + anneau + objet + nom place selon le quadrant
   // pour que deux voisins ne se marchent jamais dessus.
   private void satellite(PoseStack pile, double angleDeg, String id, String nom, String sous, float part, int accent, boolean choisi, boolean survol) {
      int cx = this.cxCadran();
      int cy = this.cyCadran();
      double a = Math.toRadians(angleDeg);
      int sx = cx + (int)(Math.cos(a) * 60.0);
      int sy = cy + (int)(Math.sin(a) * 60.0);
      Dessin.trait(
         pile,
         cx + (int)(Math.cos(a) * 48.0),
         cy + (int)(Math.sin(a) * 48.0),
         sx - (int)(Math.cos(a) * 12.0),
         sy - (int)(Math.sin(a) * 12.0),
         choisi ? Palette.voile(accent, 144) : Palette.voile(Palette.VIOLET, 144)
      );
      Dessin.disque(pile, sx, sy, 12, Palette.CARTE);
      Dessin.anneau(pile, sx, sy, 12, 1, choisi ? accent : Palette.voile(Palette.VIOLET, survol ? 255 : 224));
      if (choisi || survol) {
         Dessin.anneau(pile, sx, sy, 15, 1, Palette.voile(accent, choisi ? 112 : 64));
      }

      Dessin.arc(pile, sx, sy, 11, 2, accent, -90.0F, 360.0F * Math.max(0.0F, Math.min(1.0F, part)));
      if (id != null) {
         Dessin.objet(id, sx - 8, sy - 8);
      } else {
         Dessin.rect(pile, sx - 4, sy - 4, 8, 8, Palette.NUIT);
      }

      // au-dessus du disque pour la moitie haute, en dessous pour la moitie basse ;
      // les satellites lateraux ont moins de place que ceux du haut et du bas
      int maxLabel = Math.abs(sx - cx) < 25 ? 100 : (sous == null ? 88 : 64);
      int couleurNom = choisi || survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE;
      List<String> lignesNom = sous == null ? couper(nom, maxLabel, 2) : List.of(Dessin.tronquer(nom, maxLabel));
      if (sy < cy) {
         int ly = sy - 12 - lignesNom.size() * 10 - (sous != null ? 10 : 0);
         for (String ligne : lignesNom) {
            Dessin.texteCentre(pile, ligne, sx, ly, couleurNom);
            ly += 10;
         }

         if (sous != null) {
            Dessin.texteCentre(pile, sous, sx, ly, choisi ? accent : Palette.voile(Palette.VIOLET, 255));
         }
      } else {
         int ly = sy + 16;
         for (String ligne : lignesNom) {
            Dessin.texteCentre(pile, ligne, sx, ly, couleurNom);
            ly += 10;
         }

         if (sous != null) {
            Dessin.texteCentre(pile, sous, sx, ly, choisi ? accent : Palette.voile(Palette.VIOLET, 255));
         }
      }
   }

   private double[] anglesMetiers(int n) {
      double[] a = new double[n];

      for (int i = 0; i < n; i++) {
         a[i] = -90.0 + (double)i * (360.0 / (double)n);
      }

      return a;
   }

   // Les idees de la page cuisine : quatre positions cardinales au plus,
   // chaque nom garde ainsi une vraie place autour du cadran.
   private double[] anglesIdees(int n) {
      return switch (Math.max(1, Math.min(4, n))) {
         case 1 -> new double[]{-90.0};
         case 2 -> new double[]{180.0, 0.0};
         case 3 -> new double[]{-90.0, 0.0, 180.0};
         default -> new double[]{-90.0, 0.0, 90.0, 180.0};
      };
   }

   private int satelliteSous(double mx, double my, double[] angles) {
      int cx = this.cxCadran();
      int cy = this.cyCadran();

      for (int i = 0; i < angles.length; i++) {
         double a = Math.toRadians(angles[i]);
         int sx = cx + (int)(Math.cos(a) * 60.0);
         int sy = cy + (int)(Math.sin(a) * 60.0);
         if ((mx - (double)sx) * (mx - (double)sx) + (my - (double)sy) * (my - (double)sy) <= 196.0) {
            return i;
         }
      }

      return -1;
   }

   private int xColonne() {
      return this.gauche + 240;
   }

   private int lColonne() {
      return this.gauche + 430 - 10 - 7 - this.xColonne();
   }

   private void filetColonne(PoseStack pile) {
      int x = this.xColonne() - 12;

      for (int y = this.haut + 10 + 24; y < this.haut + 230 - 10 - 14; y += 2) {
         Dessin.rect(pile, x, y, 1, 1, Palette.voile(Palette.VIOLET, 176));
      }
   }

   private int basColonne() {
      return this.haut + 230 - 10 - 12;
   }

   private int titreColonne(PoseStack pile, int y, String t) {
      if (y > this.basColonne()) {
         return y;
      } else {
         Dessin.texte(pile, t, this.xColonne(), y, Palette.AMBRE_CHAUD);
         Dessin.trait(pile, this.xColonne(), y + 11, this.lColonne(), Palette.voile(Palette.VIOLET, 192));
         return y + 19;
      }
   }

   private int ligneColonne(PoseStack pile, int y, String lab, String val, int couleur) {
      if (y > this.basColonne()) {
         return y;
      } else {
         Dessin.texte(pile, lab, this.xColonne(), y, Palette.TEXTE_FAIBLE);
         int place = this.lColonne() - Dessin.largeur(lab) - 8;
         Dessin.texteDroite(pile, Dessin.tronquer(val, place), this.xColonne() + this.lColonne(), y, couleur);
         Dessin.trait(pile, this.xColonne(), y + 12, this.lColonne(), Palette.voile(Palette.VIOLET, 96));
         return y + 17;
      }
   }

   private void pageMetiers(PoseStack pile, int sx, int sy) {
      PaquetEtat etat = EtatClient.etat();
      PaquetCuisine c = EtatClient.cuisine();
      List<String> tous = Metiers.tous();
      String choisi = this.metierOuvert == null ? "cuisinier" : this.metierOuvert;
      int niveau = etat.niveauDe(choisi);
      boolean cuisine = "cuisinier".equals(choisi);
      int accent = cuisine ? Palette.JADE : Palette.AMBRE_CHAUD;
      long xp = etat.xpDe(choisi);
      Reglages r = Reglages.get();
      String titre = Metiers.titre(choisi, niveau);
      this.cadran(pile, r.progression(xp), String.valueOf(niveau), titre.isEmpty() ? null : titre, accent);
      double[] angles = this.anglesMetiers(tous.size());
      int sous = this.satelliteSous((double)sx, (double)sy, angles);

      for (int i = 0; i < tous.size(); i++) {
         String id = tous.get(i);
         int n = etat.niveauDe(id);
         this.satellite(
            pile,
            angles[i],
            embleme(id),
            Metiers.nomAffiche(id).toUpperCase(Locale.ROOT),
            String.valueOf(n),
            Math.min(1.0F, (float)n / 20.0F),
            "cuisinier".equals(id) ? Palette.JADE : Palette.AMBRE_CHAUD,
            id.equals(choisi),
            sous == i
         );
      }

      this.filetColonne(pile);
      int y = this.titreColonne(pile, this.haut + 10 + 26, Metiers.nomAffiche(choisi).toUpperCase(Locale.ROOT));
      y = this.ligneColonne(pile, y, "NIVEAU", String.valueOf(niveau), Palette.AMBRE);
      y = this.ligneColonne(pile, y, "EXPERIENCE", niveau >= r.niveauMax ? xp + " · max" : xp + " / " + r.seuil(niveau + 1), Palette.TEXTE);
      if (!titre.isEmpty()) {
         y = this.ligneColonne(pile, y, "TITRE", titre, Palette.AMBRE_CLAIR);
      }

      y += 4;
      y = this.titreColonne(pile, y, "COMMENT PROGRESSER");

      for (String[] action : Metiers.actions(choisi)) {
         if (action.length >= 2 && y <= this.basColonne()) {
            Dessin.texte(pile, Dessin.tronquer(action[0], this.lColonne() - 64), this.xColonne(), y, Palette.TEXTE_DOUX);
            Dessin.texteDroite(pile, action[1], this.xColonne() + this.lColonne(), y, Palette.AMBRE_CLAIR);
            y += 12;
         }
      }

      if (c != null) {
         y += 4;
         y = this.titreColonne(pile, y, "TA CUISINE");
         y = this.ligneColonne(pile, y, "PALIER", String.valueOf(c.palier()), Palette.JADE);
         y = this.ligneColonne(pile, y, "RECETTES", String.valueOf(c.recettes()), Palette.TEXTE);
      }
   }

   private static String embleme(String id) {
      return switch (id) {
         case "mineur" -> "minecraft:iron_pickaxe";
         case "bucheron" -> "minecraft:iron_axe";
         case "fermier" -> "minecraft:iron_hoe";
         case "chasseur" -> "minecraft:bow";
         case "pecheur" -> "minecraft:fishing_rod";
         default -> "farmersdelight:cooking_pot";
      };
   }

   private void pageCuisine(PoseStack pile, int sx, int sy) {
      PaquetCuisine c = EtatClient.cuisine();
      if (c != null) {
         float part = c.seuilSuivant() > 0 ? Math.min(1.0F, (float)c.recettes() / (float)c.seuilSuivant()) : 1.0F;
         this.cadran(pile, part, String.valueOf(c.palier()), c.gestePalier(), Palette.JADE);
         List<PaquetCuisine.Idee> idees = c.idees();
         int nIdees = Math.min(4, idees.size());
         double[] angles = this.anglesIdees(nIdees);
         int sous = this.satelliteSous((double)sx, (double)sy, angles);

         for (int i = 0; i < nIdees; i++) {
            PaquetCuisine.Idee d = idees.get(i);
            this.satellite(pile, angles[i], d.id(), d.nom(), null, 0.0F, Palette.famille(d.famille()), false, sous == i);
         }

         if (idees.isEmpty()) {
            Dessin.texteCentre(pile, "tout est decouvert a ta portee", this.cxCadran(), this.cyCadran() + 60 + 12 + 8, Palette.JADE);
         } else if (sous >= 0 && sous < nIdees) {
            PaquetCuisine.Idee d = idees.get(sous);
            this.poserBulle(sx, sy, d.nom(), "clique : voir la fiche");
         }

         this.filetColonne(pile);
         int y = this.titreColonne(
            pile, this.haut + 10 + 26, Dessin.tronquer(("PALIER " + c.palier() + " · " + c.nomPalier()).toUpperCase(Locale.ROOT), this.lColonne())
         );
         y = this.ligneColonne(
            pile, y, "RECETTES", c.seuilSuivant() > 0 ? c.recettes() + " / " + c.seuilSuivant() : String.valueOf(c.recettes()), Palette.TEXTE
         );
         y += 4;
         if (c.seuilSuivant() > 0) {
            y = this.titreColonne(pile, y, "TU DEBLOQUERAS");
            if (c.manque() > 0) {
               Dessin.texte(pile, "encore " + c.manque() + " recette" + (c.manque() > 1 ? "s" : ""), this.xColonne(), y, Palette.TEXTE_FAIBLE);
               y += 12;
            }

            if (!c.posteSuivant().isEmpty()) {
               Dessin.texte(pile, Dessin.tronquer("un poste : " + c.posteSuivant(), this.lColonne()), this.xColonne(), y, Palette.TEXTE);
               y += 12;
            }

            for (String bout : couper(c.recompenseSuivante(), this.lColonne(), 2)) {
               Dessin.texte(pile, bout, this.xColonne(), y, Palette.AMBRE_CLAIR);
               y += 11;
            }
         } else {
            y = this.titreColonne(pile, y, "PALIER MAXIMUM");
            if (!c.favorite().isEmpty()) {
               Dessin.texte(pile, Dessin.tronquer("ta favorite : " + c.favorite(), this.lColonne()), this.xColonne(), y, Palette.TEXTE);
               y += 12;
               Dessin.texte(pile, "cuisinee " + c.foisFavorite() + " fois", this.xColonne(), y, Palette.TEXTE_FAIBLE);
               y += 12;
            }
         }

         y += 4;
         y = this.titreColonne(pile, y, "TA COLLECTION");
         int demi = (this.lColonne() - 6) / 2;
         List<PaquetCuisine.Compte> fam = c.familles();

         for (int i = 0; i < fam.size(); i++) {
            PaquetCuisine.Compte f = fam.get(i);
            int fx = this.xColonne() + i % 2 * (demi + 6);
            int fy = y + i / 2 * 11;
            if (fy > this.basColonne()) {
               break;
            }

            Dessin.rect(pile, fx, fy + 3, 3, 3, Palette.famille(f.cle()));
            Dessin.texte(pile, Dessin.tronquer(Famille.par(f.cle()).nom(), Math.max(24, demi - 24)), fx + 7, fy, Palette.TEXTE_DOUX);
            Dessin.texteDroite(pile, f.connues() + "/" + f.total(), fx + demi, fy, f.connues() == f.total() ? Palette.JADE : Palette.TEXTE_FAIBLE);
         }
      }
   }

   private static List<String> couper(String t, int largeur, int maxLignes) {
      List<String> out = new ArrayList<>();
      if (t != null && !t.isBlank()) {
         StringBuilder ligne = new StringBuilder();

         for (String mot : t.split(" ")) {
            String essai = ligne.length() == 0 ? mot : ligne + " " + mot;
            if (Dessin.largeur(essai) > largeur && ligne.length() > 0) {
               if (out.size() >= maxLignes - 1) {
                  out.add(Dessin.tronquer(ligne + " " + mot + "…", largeur));
                  return out;
               }

               out.add(ligne.toString());
               ligne = new StringBuilder(mot);
            } else {
               ligne = new StringBuilder(essai);
            }
         }

         if (ligne.length() > 0) {
            out.add(ligne.toString());
         }

         return out;
      } else {
         return out;
      }
   }

   private static String normaliser(String s) {
      String n = Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD);
      StringBuilder b = new StringBuilder(n.length());

      for (int i = 0; i < n.length(); i++) {
         char ch = n.charAt(i);
         if (Character.getType(ch) != Character.NON_SPACING_MARK) {
            b.append(ch);
         }
      }

      return b.toString();
   }

   private List<PaquetCuisine.Ligne> filtrees() {
      PaquetCuisine c = EtatClient.cuisine();
      if (c == null) {
         return List.of();
      } else if (this.cacheLignes != null
         && this.cachePaquet == c
         && this.cacheRecherche.equals(this.recherche)
         && this.cacheFamille.equals(this.familleFiltre)) {
         return this.cacheLignes;
      } else {
         String q = normaliser(this.recherche.trim());
         List<PaquetCuisine.Ligne> out = new ArrayList<>();

         for (PaquetCuisine.Ligne l : c.lignes()) {
            if ((this.familleFiltre.isEmpty() || this.familleFiltre.equals(l.famille())) && (q.isEmpty() || normaliser(l.nom()).contains(q))) {
               out.add(l);
            }
         }

         this.cachePaquet = c;
         this.cacheRecherche = this.recherche;
         this.cacheFamille = this.familleFiltre;
         this.cacheLignes = out;
         return out;
      }
   }

   private PaquetCuisine.Ligne lignePar(String id) {
      PaquetCuisine c = EtatClient.cuisine();
      if (c != null && id != null) {
         for (PaquetCuisine.Ligne l : c.lignes()) {
            if (l.id().equals(id)) {
               return l;
            }
         }
      }

      return null;
   }

   private int xGrille() {
      return this.gauche + 10 + 7;
   }

   private int yGrille() {
      return this.haut + 52;
   }

   private int rangeesVisibles() {
      return Math.max(1, (this.haut + 230 - 10 - 6 - this.yGrille()) / PAS_Y);
   }

   private int xFamilles() {
      return this.xGrille() + 150 + 12;
   }

   private int xBoutonGuide() {
      return this.xFamilles() + Famille.values().length * 13 + 8;
   }

   private void leLivre(PoseStack pile, int sx, int sy) {
      PaquetCuisine c = EtatClient.cuisine();
      int x0 = this.xGrille();
      int y0 = this.haut + 34;
      int lch = 150;

      // champ de recherche, avec curseur clignotant quand il est actif
      Dessin.carteMate(pile, x0, y0, lch, 14, Palette.voile(Palette.NUIT, 192), this.champActif ? Palette.AMBRE : Palette.voile(Palette.VIOLET, 192));
      boolean vide = this.recherche.isEmpty() && !this.champActif;
      String curseur = this.champActif && System.currentTimeMillis() / 500L % 2L == 0L ? "_" : "";
      String aff = vide ? "chercher un plat…" : this.recherche + curseur;
      Dessin.texte(pile, Dessin.tronquer(aff, lch - 10), x0 + 5, y0 + 3, vide ? Palette.TEXTE_FAIBLE : Palette.TEXTE);

      // pastilles des familles, avec infobulle au survol
      int fx = this.xFamilles();

      for (Famille f : Famille.values()) {
         boolean actif = this.familleFiltre.equals(f.id());
         boolean survol = sx >= fx - 2 && sx <= fx + 10 && sy >= y0 && sy <= y0 + 14;
         int cf = Palette.famille(f.id());
         Dessin.disque(pile, fx + 4, y0 + 7, 4, actif ? cf : Palette.voile(Palette.VIOLET, survol ? 255 : 192));
         Dessin.anneau(pile, fx + 4, y0 + 7, 4, 1, cf);
         if (survol && c != null) {
            PaquetCuisine.Compte compte = null;

            for (PaquetCuisine.Compte k : c.familles()) {
               if (k.cle().equals(f.id())) {
                  compte = k;
                  break;
               }
            }

            this.poserBulle(sx, sy, f.nom(), compte == null ? "rien a ta portee" : compte.connues() + "/" + compte.total() + " a ta portee");
         }

         fx += 13;
      }

      // bouton du guide
      int gx = this.xBoutonGuide();
      int gl = Dessin.largeur("GUIDE") + 12;
      boolean surGuide = sx >= gx && sx <= gx + gl && sy >= y0 && sy <= y0 + 14;
      Dessin.carteMate(pile, gx, y0, gl, 14, Palette.voile(Palette.NUIT, 192), surGuide ? Palette.AMBRE : Palette.voile(Palette.AMBRE, 128));
      Dessin.texteCentre(pile, "GUIDE", gx + gl / 2, y0 + 3, surGuide ? Palette.AMBRE : Palette.AMBRE_CHAUD);

      List<PaquetCuisine.Ligne> lignes = this.filtrees();

      // compteur : la progression sans filtre, le nombre de resultats sinon
      String compteur;
      if (this.recherche.isEmpty() && this.familleFiltre.isEmpty()) {
         int connues = 0;

         if (c != null) {
            for (PaquetCuisine.Ligne l : c.lignes()) {
               if (l.connue()) {
                  connues++;
               }
            }
         }

         compteur = connues + "/" + lignes.size();
      } else {
         compteur = lignes.size() + (lignes.size() > 1 ? " plats" : " plat");
      }

      Dessin.texteDroite(pile, compteur, this.gauche + 430 - 10 - 7, y0 + 3, Palette.TEXTE_FAIBLE);
      if (lignes.isEmpty()) {
         Dessin.texteCentre(pile, "aucun plat ne correspond", this.gauche + 215, this.haut + 120, Palette.TEXTE_FAIBLE);
      } else {
         int rangees = this.rangeesVisibles();
         int parPage = rangees * COLS;
         int maxDefil = Math.max(0, (lignes.size() + COLS - 1) / COLS - rangees);
         this.defilement = Math.max(0, Math.min(this.defilement, maxDefil));
         int debut = this.defilement * COLS;

         for (int i = 0; i < parPage && debut + i < lignes.size(); i++) {
            PaquetCuisine.Ligne l = lignes.get(debut + i);
            int cx = this.xGrille() + i % COLS * PAS_X;
            int cy = this.yGrille() + i / COLS * PAS_Y;
            boolean survol = sx >= cx && sx <= cx + CW && sy >= cy && sy <= cy + CH;
            this.vignette(pile, cx, cy, l, c, survol);
            if (survol) {
               String sousTexte = Famille.par(l.famille()).nom().toLowerCase(Locale.ROOT) + " · palier " + l.palier();
               this.poserBulle(sx, sy, l.nom(), sousTexte);
            }
         }

         // barre de defilement fine quand tout ne tient pas
         if (maxDefil > 0) {
            int bx = this.gauche + 430 - 10 - 4;
            int by = this.yGrille();
            int bh = rangees * PAS_Y - 4;
            Dessin.rect(pile, bx, by, 2, bh, Palette.voile(Palette.VIOLET, 96));
            int th = Math.max(10, bh * rangees / (maxDefil + rangees));
            int ty = by + (bh - th) * this.defilement / maxDefil;
            Dessin.rect(pile, bx, ty, 2, th, Palette.voile(Palette.AMBRE, 176));
         }
      }
   }

   private void vignette(PoseStack pile, int x, int y, PaquetCuisine.Ligne l, PaquetCuisine c, boolean survol) {
      int cf = Palette.famille(l.famille());
      Dessin.carteMate(
         pile,
         x,
         y,
         CW,
         CH,
         l.connue() ? Palette.voile(Palette.CARTE, survol ? 240 : 176) : Palette.voile(Palette.NUIT, 192),
         survol ? Palette.voile(cf, 224) : Palette.voile(Palette.VIOLET, l.connue() ? 192 : 128)
      );
      int mx = x + 47;
      int my = y + 15;
      Dessin.disque(pile, mx, my, 11, Palette.voile(Palette.NUIT, 224));
      Dessin.anneau(pile, mx, my, 11, 1, Palette.voile(Palette.VIOLET, 192));
      if (l.connue()) {
         Dessin.arc(pile, mx, my, 10, 2, cf, -90.0F, 360.0F * Math.min(1.0F, (float)l.fois() / 20.0F));
         Dessin.objet(l.id(), mx - 8, my - 8);
         Dessin.rect(pile, x + CW - 7, y + 4, 3, 3, Palette.JADE);
      } else {
         Dessin.texteCentre(pile, "?", mx, my - 4, Palette.voile(Palette.VIOLET, 255));
      }

      Dessin.texteCentre(pile, Dessin.tronquer(l.nom(), 86), mx, y + 28, l.connue() ? Palette.TEXTE : Palette.TEXTE_FAIBLE);
      boolean accessible = c == null || l.palier() <= c.palier();
      Dessin.texte(pile, "P" + l.palier(), x + 5, y + 39, accessible ? cf : Palette.voile(Palette.ROUGE, 224));
      Dessin.texteDroite(pile, l.prix()[0] + " P", x + CW - 5, y + 39, l.connue() ? Palette.AMBRE_CLAIR : Palette.voile(Palette.VIOLET, 255));
   }

   private void fichePlat(PoseStack pile, int sx, int sy) {
      PaquetCuisine c = EtatClient.cuisine();
      PaquetCuisine.Ligne p = this.lignePar(this.platOuvert);
      if (c != null && p != null) {
         Famille f = Famille.par(p.famille());
         int coul = Palette.famille(p.famille());
         this.retour(pile, sx, sy);
         boolean pret = EtatClient.ficheDe(p.id());
         List<Recettes.Facon> facons = pret ? EtatClient.fiche().facons() : List.of();
         List<String> utileA = pret ? EtatClient.fiche().utileA() : List.of();
         boolean liste = !facons.isEmpty() && facons.get(0).ingredients().size() > 4;
         int cx = this.cxCadran();
         int cy = liste ? this.haut + 74 : this.haut + 118;
         int rc = liste ? 18 : 22;
         Dessin.disque(pile, cx, cy, rc, Palette.voile(Palette.NUIT, 224));
         Dessin.anneau(pile, cx, cy, rc, 2, Palette.voile(Palette.VIOLET, 224));
         Dessin.arc(pile, cx, cy, rc - 2, 3, coul, -90.0F, 360.0F * Math.min(1.0F, (float)p.fois() / 20.0F));
         Dessin.objet(p.id(), cx - 8, cy - 8);
         if (facons.isEmpty()) {
            Dessin.texteCentre(pile, pret ? "il ne se fabrique pas" : "…", cx, cy + rc + 12, Palette.TEXTE_FAIBLE);
         } else {
            Recettes.Facon fa = facons.get(0);
            if (liste) {
               this.ingredientsEnListe(pile, fa);
            } else {
               this.ingredientsEnCercle(pile, fa, cx, cy, rc);
            }
         }

         // pied de la zone gauche : etat de decouverte puis usages
         int pied = this.haut + 196;
         if (!p.connue()) {
            Dessin.texteCentre(pile, "pas encore dans ton carnet", cx, pied, Palette.ROSE);
            Dessin.texteCentre(pile, "lis FAIRE : cuisine-la une fois, c'est tout", cx, pied + 11, Palette.TEXTE_FAIBLE);
         } else {
            Dessin.texteCentre(pile, "cuisine " + p.fois() + " fois", cx, pied, Palette.TEXTE_FAIBLE);
            if (!utileA.isEmpty()) {
               StringBuilder b = new StringBuilder("sert aussi pour ");

               for (int i = 0; i < utileA.size() && i < 2; i++) {
                  if (i > 0) {
                     b.append(", ");
                  }

                  b.append(Ateliers.objet(utileA.get(i)));
               }

               if (utileA.size() > 2) {
                  b.append("…");
               }

               Dessin.texteCentre(pile, Dessin.tronquer(b.toString(), 208), cx, pied + 11, Palette.voile(Palette.VIOLET, 255));
            }
         }

         this.filetColonne(pile);
         int y = this.haut + 10 + 26;
         Dessin.texteGrand(pile, Dessin.tronquer(p.nom(), (int)((float)this.lColonne() / 1.4F)), this.xColonne(), y, 1.4F, Palette.TEXTE);
         y += 16;
         Dessin.texte(pile, f.nom().toLowerCase(Locale.ROOT) + " · palier " + p.palier(), this.xColonne(), y, coul);
         y += 12;
         Dessin.trait(pile, this.xColonne(), y, this.lColonne(), Palette.voile(Palette.VIOLET, 192));
         y += 5;
         this.ongletsFiche(pile, sx, sy, y);
         y += 15;
         if (this.ficheVolet == 0) {
            this.ficheFaire(pile, p, c, facons, pret);
         } else {
            this.ficheValeur(pile, y, p, c, f);
         }
      } else {
         this.platOuvert = null;
      }
   }

   private int yFicheOnglets() {
      return this.haut + 69;
   }

   private void ongletsFiche(PoseStack pile, int sx, int sy, int y) {
      int x = this.xColonne();
      String[] noms = new String[]{"FAIRE", "VALEUR"};

      for (int i = 0; i < noms.length; i++) {
         int l = Dessin.largeur(noms[i]);
         boolean actif = this.ficheVolet == i;
         boolean survol = sx >= x && sx <= x + l && sy >= y - 2 && sy <= y + 10;
         Dessin.texte(pile, noms[i], x, y, actif ? Palette.AMBRE : (survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE));
         if (actif) {
            Dessin.trait(pile, x, y + 10, l, Palette.AMBRE);
         }

         x += l + 12;
      }
   }

   private boolean surFicheOnglet(double sx, double sy) {
      int y = this.yFicheOnglets();
      if (sy < (double)(y - 2) || sy > (double)(y + 10)) {
         return false;
      } else {
         int x = this.xColonne();
         String[] noms = new String[]{"FAIRE", "VALEUR"};

         for (int i = 0; i < noms.length; i++) {
            int l = Dessin.largeur(noms[i]);
            if (sx >= (double)x && sx <= (double)(x + l)) {
               this.ficheVolet = i;
               return true;
            }

            x += l + 12;
         }

         return false;
      }
   }

   private void ficheFaire(PoseStack pile, PaquetCuisine.Ligne p, PaquetCuisine c, List<Recettes.Facon> facons, boolean pret) {
      Reglages r = Reglages.get();
      String type = facons.isEmpty() ? p.poste() : facons.get(0).type();
      int y = this.yFicheOnglets() + 14;
      y = this.titreColonne(pile, y, "LE POSTE");
      if (!pret) {
         Dessin.texte(pile, "…", this.xColonne(), y, Palette.TEXTE_FAIBLE);
         return;
      }

      Dessin.texte(pile, Dessin.tronquer(Ateliers.bloc(type), this.lColonne()), this.xColonne(), y, Palette.JADE);
      y += 13;
      y = this.titreColonne(pile, y, "COMMENT FAIRE");
      int n = 1;

      for (String geste : Ateliers.gestes(type)) {
         if (y > this.basColonne() - 8) {
            break;
         }

         y = this.etapeFiche(pile, y, n++, geste);
      }

      if (y <= this.basColonne() - 8 && !p.connue()) {
         y = this.etapeFiche(pile, y, n++, "Premiere fournee : la recette s'ecrit ici toute seule.");
      }

      if (y <= this.basColonne() - 8) {
         y = this.etapeFiche(pile, y, n++, "Touche U (JEI) : le schema exact de la recette.");
      }

      if (y <= this.basColonne() - 8 && p.palier() > c.palier()) {
         this.etapeFiche(pile, y, n, "Palier " + p.palier() + " requis (tu es " + c.palier() + ") : plat sans effet.");
      } else if (y <= this.basColonne() - 8 && r.fenetrePoste > 0 && p.palier() <= c.palier()) {
         this.etapeFiche(pile, y, n, "Sans clic sur le poste : qualite minimale (" + r.fenetrePoste + " s).");
      }
   }

   private int etapeFiche(PoseStack pile, int y, int n, String texte) {
      int largeur = this.lColonne() - 12;
      List<String> lignes = couper(texte, largeur, 3);
      if (y > this.basColonne() - 8 || lignes.isEmpty()) {
         return y;
      } else {
         Dessin.texte(pile, n + ".", this.xColonne(), y, Palette.AMBRE);
         int x = this.xColonne() + 12;

         for (String ligne : lignes) {
            if (y > this.basColonne()) {
               break;
            }

            Dessin.texte(pile, ligne, x, y, Palette.TEXTE_DOUX);
            y += 10;
         }

         return y + 3;
      }
   }

   private void ficheValeur(PoseStack pile, int y, PaquetCuisine.Ligne p, PaquetCuisine c, Famille f) {
      Dessin.texte(pile, "ATELIER", this.xColonne(), y, Palette.AMBRE_CHAUD);
      y += 11;
      String atelier = Ateliers.nom(p.poste());
      Dessin.texte(pile, Dessin.tronquer(atelier, this.lColonne()), this.xColonne(), y, Palette.JADE);
      y += 13;
      Dessin.texte(pile, "EFFET", this.xColonne(), y, Palette.AMBRE_CHAUD);
      y += 11;
      Dessin.texte(pile, Dessin.tronquer(Ateliers.effet(f.effet()), this.lColonne()), this.xColonne(), y, Palette.TEXTE);
      y += 11;
      if (f.bonus() != f.effet()) {
         Dessin.texte(
            pile, Dessin.tronquer("+ " + Ateliers.effet(f.bonus()) + " en qualite 5", this.lColonne()), this.xColonne(), y, Palette.TEXTE_FAIBLE
         );
         y += 11;
      }

      y += 3;
      Dessin.texte(pile, "TES CHANCES", this.xColonne(), y, Palette.AMBRE_CHAUD);
      if (p.palier() > c.palier()) {
         Dessin.texteDroite(pile, "hors palier", this.xColonne() + this.lColonne(), y, Palette.ROUGE);
      }

      y += 11;

      for (int q = 1; q <= 5; q++) {
         int chance = c.chances()[q - 1];
         int cq = Palette.qualite(q);
         Dessin.texte(pile, Dessin.tronquer(Qualite.NOMS[q - 1], 52), this.xColonne(), y, cq);
         int bx = this.xColonne() + 56;
         int bw = 34;
         Dessin.rect(pile, bx, y + 2, bw, 3, Palette.voile(Palette.VIOLET, 160));
         Dessin.rect(pile, bx, y + 2, Math.round((float)(bw * chance) / 100.0F), 3, cq);
         Dessin.texteDroite(pile, chance + "%", this.xColonne() + 118, y, Palette.TEXTE_FAIBLE);
         Dessin.texteDroite(pile, p.prix()[q - 1] + " P", this.xColonne() + this.lColonne(), y, Palette.AMBRE_CLAIR);
         y += 11;
      }
   }

   // Quatre ingredients au plus autour du plat, chacun sur un point cardinal :
   // les noms ne peuvent pas se toucher.
   private void ingredientsEnCercle(PoseStack pile, Recettes.Facon fa, int cx, int cy, int rc) {
      int n = fa.ingredients().size();
      double[] angles = this.anglesIdees(n);

      for (int i = 0; i < n && i < angles.length; i++) {
         double a = Math.toRadians(angles[i]);
         int ix = cx + (int)(Math.cos(a) * 44.0);
         int iy = cy + (int)(Math.sin(a) * 44.0);
         Dessin.trait(
            pile,
            cx + (int)(Math.cos(a) * (double)(rc + 3)),
            cy + (int)(Math.sin(a) * (double)(rc + 3)),
            ix - (int)(Math.cos(a) * 9.0),
            iy - (int)(Math.sin(a) * 9.0),
            Palette.voile(Palette.VIOLET, 160)
         );
         Dessin.disque(pile, ix, iy, 9, Palette.CARTE);
         Dessin.anneau(pile, ix, iy, 9, 1, Palette.voile(Palette.VIOLET, 224));
         Dessin.objet(fa.ingredients().get(i), ix - 8, iy - 8);
         String lab = fa.combien().get(i) + " " + Ateliers.objet(fa.ingredients().get(i));
         int maxLab = Math.abs(ix - cx) < 25 ? 96 : 80;
         int ly = iy < cy ? iy - 21 : iy + 13;
         Dessin.texteCentre(pile, Dessin.tronquer(lab, maxLab), ix, ly, Palette.TEXTE_FAIBLE);
      }
   }

   // Au-dela de quatre ingredients, une liste sur deux colonnes reste lisible.
   private void ingredientsEnListe(PoseStack pile, Recettes.Facon fa) {
      int n = Math.min(fa.ingredients().size(), 10);

      for (int i = 0; i < n; i++) {
         int x = this.gauche + 22 + i % 2 * 104;
         int y = this.haut + 102 + i / 2 * 18;
         Dessin.objet(fa.ingredients().get(i), x, y);
         String lab = fa.combien().get(i) + "× " + Ateliers.objet(fa.ingredients().get(i));
         Dessin.texte(pile, Dessin.tronquer(lab, 82), x + 19, y + 4, Palette.TEXTE_DOUX);
      }
   }

   // ------------------------------------------------------------------
   // Le guide : cinq sections d'aide qui expliquent la cuisine.
   // ------------------------------------------------------------------

   private int xGuide() {
      return this.gauche + 118;
   }

   private int lGuide() {
      return this.gauche + 430 - 10 - 7 - this.xGuide();
   }

   private void guide(PoseStack pile, int sx, int sy) {
      this.retour(pile, sx, sy);
      Dessin.texte(pile, "GUIDE DU CUISINIER", this.gauche + 80, this.haut + 32, Palette.AMBRE);

      for (int i = 0; i < GUIDE.length; i++) {
         int iy = this.haut + 56 + i * 16;
         boolean actif = this.guideSection == i;
         boolean survol = sx >= this.gauche + 17 && sx <= this.gauche + 100 && sy >= iy - 3 && sy <= iy + 10;
         if (actif) {
            Dessin.rect(pile, this.gauche + 17, iy - 1, 2, 9, Palette.AMBRE);
         }

         Dessin.texte(pile, GUIDE[i], this.gauche + 24, iy, actif ? Palette.AMBRE : (survol ? Palette.TEXTE : Palette.TEXTE_FAIBLE));
      }

      int fx = this.gauche + 106;

      for (int fy = this.haut + 52; fy < this.haut + 208; fy += 2) {
         Dessin.rect(pile, fx, fy, 1, 1, Palette.voile(Palette.VIOLET, 176));
      }

      switch (this.guideSection) {
         case 0:
            this.guideDebuter(pile);
            break;
         case 1:
            this.guidePaliers(pile);
            break;
         case 2:
            this.guideFamilles(pile);
            break;
         case 3:
            this.guideQualites(pile);
            break;
         default:
            this.guideVendre(pile);
      }
   }

   private int gTitre(PoseStack pile, int y, String t) {
      Dessin.texte(pile, t, this.xGuide(), y, Palette.AMBRE_CHAUD);
      Dessin.trait(pile, this.xGuide(), y + 11, this.lGuide(), Palette.voile(Palette.VIOLET, 192));
      return y + 17;
   }

   private int gPara(PoseStack pile, int y, String t, int couleur) {
      for (String ligne : couper(t, this.lGuide(), 6)) {
         Dessin.texte(pile, ligne, this.xGuide(), y, couleur);
         y += 10;
      }

      return y + 4;
   }

   private void guideDebuter(PoseStack pile) {
      Reglages r = Reglages.get();
      PaquetCuisine c = EtatClient.cuisine();
      int y = this.gTitre(pile, this.haut + 52, "COMMENT CA MARCHE");
      y = this.gPara(
         pile,
         y,
         "Cuisine pres d'un poste : fourneau, planche, poele, marmite. Chaque plat different reussi s'inscrit dans ton carnet.",
         Palette.TEXTE_DOUX
      );
      y = this.gPara(pile, y, "Ce sont les recettes differentes qui font monter tes paliers, pas la quantite cuisinee.", Palette.TEXTE);
      y += 2;
      y = this.gTitre(pile, y, "L'EXPERIENCE");
      int xg = this.xGuide();
      int xd = xg + this.lGuide();
      Dessin.texte(pile, "plat cuisine", xg, y, Palette.TEXTE_DOUX);
      Dessin.texteDroite(pile, "+" + r.xpPlat + " XP", xd, y, Palette.AMBRE_CLAIR);
      y += 11;
      Dessin.texte(pile, "nouvelle recette", xg, y, Palette.TEXTE_DOUX);
      Dessin.texteDroite(pile, "+" + r.xpDecouverte + " XP", xd, y, Palette.AMBRE_CLAIR);
      y += 11;
      Dessin.texte(pile, "par cran de qualite", xg, y, Palette.TEXTE_DOUX);
      Dessin.texteDroite(pile, "+" + r.xpQualite + " XP", xd, y, Palette.AMBRE_CLAIR);
      y += 11;
      if (c != null && r.bonusXpDe(c.palier()) > 0) {
         Dessin.texte(pile, "bonus de palier " + c.palier(), xg, y, Palette.TEXTE_DOUX);
         Dessin.texteDroite(pile, "+" + r.bonusXpDe(c.palier()) + "%", xd, y, Palette.JADE);
         y += 11;
      }

      y += 4;
      if (r.fenetrePoste > 0) {
         y = this.gPara(
            pile,
            y,
            "Loin d'un poste, le plat sort a la qualite minimale (delai : " + r.fenetrePoste + " s).",
            Palette.TEXTE_FAIBLE
         );
      }

      if (r.platHorsPalierInerte) {
         this.gPara(pile, y, "Un plat au-dessus de ton palier reste inerte.", Palette.TEXTE_FAIBLE);
      }
   }

   private void guidePaliers(PoseStack pile) {
      Reglages r = Reglages.get();
      PaquetCuisine c = EtatClient.cuisine();
      int palier = c == null ? 1 : c.palier();
      int y = this.gTitre(pile, this.haut + 52, "LES CINQ PALIERS");

      // les postes que chaque palier debloque, d'apres les reglages
      Map<Integer, String> postes = new LinkedHashMap<>();

      for (Map.Entry<String, Integer> e : r.postes.entrySet()) {
         if (e.getValue() != null) {
            postes.merge(e.getValue(), e.getKey(), (a, b) -> a + ", " + b);
         }
      }

      for (int p = 1; p <= 5; p++) {
         boolean atteint = p <= palier;
         boolean courant = p == palier;
         if (courant) {
            Dessin.rect(pile, this.xGuide() - 6, y + 1, 3, 3, Palette.AMBRE);
         }

         String besoin = p == 1 ? "des le debut" : r.palierRecettes[p - 1] + " recettes";
         Dessin.texte(pile, p + " · " + r.palierNom[p - 1], this.xGuide(), y, courant ? Palette.AMBRE : (atteint ? Palette.TEXTE : Palette.TEXTE_DOUX));
         Dessin.texteDroite(pile, besoin, this.xGuide() + this.lGuide(), y, atteint ? Palette.JADE : Palette.TEXTE_FAIBLE);
         y += 10;
         String detail = postes.containsKey(p) ? "postes : " + postes.get(p) : "";
         String rec = r.palierRecompense[p - 1];
         if (rec != null && !rec.isBlank()) {
            detail = detail.isEmpty() ? rec : detail + " · " + rec;
         }

         if (!detail.isEmpty()) {
            for (String ligne : couper(detail, this.lGuide(), 2)) {
               Dessin.texte(pile, ligne, this.xGuide(), y, Palette.TEXTE_FAIBLE);
               y += 9;
            }
         }

         y += 3;
      }
   }

   private void guideFamilles(PoseStack pile) {
      int y = this.gTitre(pile, this.haut + 52, "LES FAMILLES DE PLATS");
      y = this.gPara(pile, y, "Manger un plat donne l'effet de sa famille. Plus la qualite est haute, plus l'effet dure.", Palette.TEXTE_DOUX);

      for (Famille f : Famille.values()) {
         Dessin.rect(pile, this.xGuide(), y + 2, 3, 3, Palette.famille(f.id()));
         Dessin.texte(pile, f.nom(), this.xGuide() + 8, y, Palette.famille(f.id()));
         Dessin.texte(pile, Dessin.tronquer(f.sert(), 90), this.xGuide() + 78, y, Palette.TEXTE_FAIBLE);
         Dessin.texteDroite(pile, Dessin.tronquer(Ateliers.effet(f.effet()), 120), this.xGuide() + this.lGuide(), y, Palette.TEXTE_DOUX);
         y += 12;
      }

      y += 2;
      this.gPara(pile, y, "En qualite Signature (5), un second effet propre a la famille s'ajoute au premier.", Palette.TEXTE_FAIBLE);
   }

   private void guideQualites(PoseStack pile) {
      Reglages r = Reglages.get();
      PaquetCuisine c = EtatClient.cuisine();
      int y = this.gTitre(pile, this.haut + 52, "LES CINQ QUALITES");
      y = this.gPara(pile, y, "A chaque plat cuisine, une qualite est tiree au sort. Monter de palier ameliore beaucoup le tirage.", Palette.TEXTE_DOUX);
      Dessin.texte(pile, "qualite", this.xGuide(), y, Palette.TEXTE_FAIBLE);
      Dessin.texteDroite(pile, "effet", this.xGuide() + 128, y, Palette.TEXTE_FAIBLE);
      Dessin.texteDroite(pile, "prix", this.xGuide() + 176, y, Palette.TEXTE_FAIBLE);
      if (c != null) {
         Dessin.texteDroite(pile, "tes chances", this.xGuide() + this.lGuide(), y, Palette.TEXTE_FAIBLE);
      }

      y += 11;

      for (int q = 1; q <= 5; q++) {
         int cq = Palette.qualite(q);
         Dessin.texte(pile, Qualite.NOMS[q - 1], this.xGuide(), y, cq);
         Dessin.texteDroite(pile, r.dureeEffet[q - 1] + " s", this.xGuide() + 128, y, Palette.TEXTE_DOUX);
         Dessin.texteDroite(pile, "×" + r.multiplicateurs[q - 1], this.xGuide() + 176, y, Palette.AMBRE_CLAIR);
         if (c != null) {
            int chance = c.chances()[q - 1];
            int bx = this.xGuide() + 196;
            int bw = this.lGuide() - 196 - 26;
            Dessin.rect(pile, bx, y + 2, bw, 3, Palette.voile(Palette.VIOLET, 160));
            Dessin.rect(pile, bx, y + 2, Math.max(chance > 0 ? 1 : 0, bw * chance / 100), 3, cq);
            Dessin.texteDroite(pile, chance + "%", this.xGuide() + this.lGuide(), y, Palette.TEXTE_FAIBLE);
         }

         y += 12;
      }

      y += 3;
      this.gPara(
         pile,
         y,
         "Garde un couteau sur toi pour aider le tirage : fer +" + r.couteauQualite[1] + "%, diamant ou or +" + r.couteauQualite[2] + "%, netherite +" + r.couteauQualite[3] + "%, neptunium +" + r.couteauQualite[4] + "% de chance de monter d'un cran.",
         Palette.TEXTE_FAIBLE
      );
   }

   private void guideVendre(PoseStack pile) {
      Reglages r = Reglages.get();
      int y = this.gTitre(pile, this.haut + 52, "VENDRE TES PLATS");
      y = this.gPara(pile, y, "Chaque plat a une valeur de base, visible dans le livre, multipliee par sa qualite :", Palette.TEXTE_DOUX);
      int xg = this.xGuide();

      for (int q = 1; q <= 5; q++) {
         Dessin.texte(pile, Qualite.NOMS[q - 1], xg, y, Palette.qualite(q));
         Dessin.texteDroite(pile, "×" + r.multiplicateurs[q - 1], xg + 110, y, Palette.AMBRE_CLAIR);
         y += 11;
      }

      y += 4;
      y = this.gPara(pile, y, "/cuisinier vendre — vend la pile de plats en main", Palette.TEXTE);
      y = this.gPara(pile, y, "/cuisinier vendre tout — vend tous les plats de l'inventaire", Palette.TEXTE);
      y = this.gPara(pile, y, "/cuisinier prix — estime le plat en main sans le vendre", Palette.TEXTE);
      if (r.commissionVente > 0) {
         y = this.gPara(pile, y, "La boutique garde une commission de " + r.commissionVente + "% sur chaque vente.", Palette.TEXTE_FAIBLE);
      }

      this.gPara(pile, y, "Les plats cuisines hors palier ne trouvent aucun acheteur.", Palette.TEXTE_FAIBLE);
   }

   // ------------------------------------------------------------------
   // Souris et clavier
   // ------------------------------------------------------------------

   private void demanderFiche(String id) {
      EtatClient.oublierFiche();
      if (!Demo.fiche(id)) {
         Reseau.versServeur(new PaquetDemandeFiche(id));
      }
   }

   private void ouvrirFiche(String id) {
      this.onglet = 2;
      this.guideSection = -1;
      this.platOuvert = id;
      this.ficheVolet = 0;
      this.demanderFiche(id);
   }

   public boolean mouseClicked(double sxEcran, double syEcran, int bouton) {
      if (bouton != 0) {
         return super.mouseClicked(sxEcran, syEcran, bouton);
      } else {
         double sx = this.mx(sxEcran);
         double sy = this.my(syEcran);
         this.champActif = false;
         int y0 = this.haut + 10 + 3;
         if (sy >= (double)(y0 - 2) && sy <= (double)(y0 + 10)) {
            for (int i = 0; i < ONGLETS.length; i++) {
               int x = this.xOnglet(i);
               if (sx >= (double)x && sx <= (double)(x + Dessin.largeur(ONGLETS[i]))) {
                  this.onglet = i;
                  this.metierOuvert = null;
                  this.platOuvert = null;
                  this.guideSection = -1;
                  this.defilement = 0;
                  return true;
               }
            }
         }

         if (this.onglet == 2 && this.guideSection >= 0) {
            if (this.surRetour(sx, sy)) {
               this.guideSection = -1;
               return true;
            } else {
               for (int i = 0; i < GUIDE.length; i++) {
                  int iy = this.haut + 56 + i * 16;
                  if (sx >= (double)(this.gauche + 17) && sx <= (double)(this.gauche + 100) && sy >= (double)(iy - 3) && sy <= (double)(iy + 10)) {
                     this.guideSection = i;
                     return true;
                  }
               }

               return true;
            }
         } else if (this.platOuvert != null && this.surRetour(sx, sy)) {
            this.platOuvert = null;
            return true;
         } else if (this.platOuvert != null && this.surFicheOnglet(sx, sy)) {
            return true;
         } else {
            if (this.onglet == 0) {
               List<String> tous = Metiers.tous();
               int ix = this.satelliteSous(sx, sy, this.anglesMetiers(tous.size()));
               if (ix >= 0) {
                  this.metierOuvert = tous.get(ix);
                  return true;
               }
            }

            if (this.onglet == 1) {
               PaquetCuisine c = EtatClient.cuisine();
               if (c != null && !c.idees().isEmpty()) {
                  int nIdees = Math.min(4, c.idees().size());
                  int ix = this.satelliteSous(sx, sy, this.anglesIdees(nIdees));
                  if (ix >= 0 && ix < nIdees) {
                     this.ouvrirFiche(c.idees().get(ix).id());
                     return true;
                  }
               }
            }

            if (this.onglet == 2 && this.platOuvert == null) {
               int gx = this.xGrille();
               int gy = this.haut + 34;
               if (sx >= (double)gx && sx <= (double)(gx + 150) && sy >= (double)gy && sy <= (double)(gy + 14)) {
                  this.champActif = true;
                  return true;
               }

               int fx = this.xFamilles();

               for (Famille f : Famille.values()) {
                  if (sx >= (double)(fx - 2) && sx <= (double)(fx + 10) && sy >= (double)gy && sy <= (double)(gy + 14)) {
                     this.familleFiltre = this.familleFiltre.equals(f.id()) ? "" : f.id();
                     this.defilement = 0;
                     return true;
                  }

                  fx += 13;
               }

               int bx = this.xBoutonGuide();
               int bl = Dessin.largeur("GUIDE") + 12;
               if (sx >= (double)bx && sx <= (double)(bx + bl) && sy >= (double)gy && sy <= (double)(gy + 14)) {
                  this.guideSection = 0;
                  return true;
               }

               List<PaquetCuisine.Ligne> lignes = this.filtrees();
               int parPage = this.rangeesVisibles() * COLS;
               int debut = this.defilement * COLS;

               for (int i = 0; i < parPage && debut + i < lignes.size(); i++) {
                  int cx = this.xGrille() + i % COLS * PAS_X;
                  int cy = this.yGrille() + i / COLS * PAS_Y;
                  if (sx >= (double)cx && sx <= (double)(cx + CW) && sy >= (double)cy && sy <= (double)(cy + CH)) {
                     this.ouvrirFiche(lignes.get(debut + i).id());
                     return true;
                  }
               }
            }

            return super.mouseClicked(sxEcran, syEcran, bouton);
         }
      }
   }

   public boolean charTyped(char c, int mods) {
      if (this.champActif && c >= ' ') {
         this.recherche = this.recherche + c;
         this.defilement = 0;
         return true;
      } else {
         return super.charTyped(c, mods);
      }
   }

   public boolean keyPressed(int touche, int scan, int mods) {
      if (this.champActif) {
         if (touche == 259 && !this.recherche.isEmpty()) {
            this.recherche = this.recherche.substring(0, this.recherche.length() - 1);
            this.defilement = 0;
            return true;
         }

         if (touche == 257 || touche == 335) {
            this.champActif = false;
            return true;
         }
      }

      if (touche == 256) {
         if (this.champActif) {
            this.champActif = false;
            return true;
         }

         if (this.guideSection >= 0) {
            this.guideSection = -1;
            return true;
         }

         if (this.platOuvert != null) {
            this.platOuvert = null;
            return true;
         }

         if (!this.recherche.isEmpty()) {
            this.recherche = "";
            return true;
         }
      }

      return super.keyPressed(touche, scan, mods);
   }

   public boolean mouseScrolled(double sxEcran, double syEcran, double sens) {
      if (this.onglet == 2 && this.platOuvert == null && this.guideSection < 0) {
         int max = Math.max(0, (this.filtrees().size() + COLS - 1) / COLS - this.rangeesVisibles());
         this.defilement = Math.max(0, Math.min(max, this.defilement - (int)Math.signum(sens)));
         return true;
      } else {
         return super.mouseScrolled(sxEcran, syEcran, sens);
      }
   }

   static {
      Random r = new Random(20260903L);

      for (int i = 0; i < ETOILES.length; i += 3) {
         ETOILES[i] = r.nextInt(430);
         ETOILES[i + 1] = r.nextInt(230);
         ETOILES[i + 2] = new int[]{-13885372, -12965290, -11913622}[r.nextInt(3)];
      }
   }
}
