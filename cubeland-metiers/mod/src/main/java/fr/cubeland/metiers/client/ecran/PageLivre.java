package fr.cubeland.metiers.client.ecran;

import fr.cubeland.metiers.client.Dessin;
import fr.cubeland.metiers.client.EtatClient;
import fr.cubeland.metiers.client.Palette;
import fr.cubeland.metiers.client.Txt;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Famille;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Le Livre : tous les plats en vignettes, une recherche, un filtre par famille, le bouton du guide. */
final class PageLivre implements Page {
   private static final int COLS = 4;
   private static final int CW = 94;
   private static final int CH = 50;
   private static final int PAS_X = 100;
   private static final int PAS_Y = 54;
   private static final int L_CHAMP = 150;
   private static final int Y_BARRE = 34;
   private static final int Y_GRILLE = 52;
   private static final int TOUCHE_RETOUR_ARRIERE = 259;
   private static final int TOUCHE_ENTREE = 257;
   private static final int TOUCHE_ENTREE_PAVE = 335;

   private final EcranCubeland ecran;
   private String recherche = "";
   private Famille filtre;
   private boolean champActif;
   private int defilement;
   private List<Plat> cache;
   private String cacheRecherche = "";
   private Famille cacheFiltre;
   private int cacheTaille = -1;

   PageLivre(EcranCubeland ecran) {
      this.ecran = ecran;
   }

   @Override
   public void ouvrir() {
      this.defilement = 0;
   }

   @Override
   public void dessiner(Contexte c) {
      PaquetCuisine cuisine = EtatClient.cuisine();
      int x0 = Widgets.BORD;
      int y0 = Y_BARRE;

      // le champ de recherche
      boolean surChamp = c.zone(x0, y0, L_CHAMP, 14, () -> this.champActif = true);
      Dessin.carteMate(c.pile, x0, y0, L_CHAMP, 14, Palette.voile(Palette.NUIT, 192), this.champActif ? Palette.AMBRE : Palette.voile(Palette.VIOLET, surChamp ? 255 : 192));
      boolean vide = this.recherche.isEmpty() && !this.champActif;
      String curseur = this.champActif && System.currentTimeMillis() / 500L % 2L == 0L ? "_" : "";
      String aff = vide ? Txt.t("ui.chercher") : this.recherche + curseur;
      Dessin.texte(c.pile, Dessin.tronquer(aff, L_CHAMP - 10), x0 + 5, y0 + 3, vide ? Palette.TEXTE_FAIBLE : Palette.TEXTE);

      // les pastilles de familles
      int fx = x0 + L_CHAMP + 12;
      for (Famille f : Famille.values()) {
         boolean actif = this.filtre == f;
         boolean survol = c.zone(fx - 2, y0, 12, 14, () -> {
            this.filtre = this.filtre == f ? null : f;
            this.defilement = 0;
         });
         int cf = Palette.famille(f);
         Dessin.disque(c.pile, fx + 4, y0 + 7, 4, actif ? cf : Palette.voile(Palette.VIOLET, survol ? 255 : 192));
         Dessin.anneau(c.pile, fx + 4, y0 + 7, 4, 1, cf);
         if (survol) {
            c.bulle(Txt.c(f.nom()), this.compteFamille(f, cuisine));
         }
         fx += 13;
      }

      // le bouton du guide
      int gx = fx + 8;
      Widgets.bouton(c, gx, y0, Txt.maj(Txt.t("ui.guide")), Palette.AMBRE, () -> this.ecran.ouvrirGuide(0));

      // le compteur
      List<Plat> plats = this.filtres();
      String compteur;
      if (this.recherche.isEmpty() && this.filtre == null) {
         int connues = cuisine == null ? 0 : cuisine.recettes();
         compteur = connues + "/" + Catalogue.recettesJusquA(5);
      } else {
         compteur = Txt.t("ui.n_plats", plats.size());
      }
      Dessin.texteDroite(c.pile, compteur, Widgets.DROITE, y0 + 3, Palette.TEXTE_FAIBLE);

      if (plats.isEmpty()) {
         Dessin.texteCentre(c.pile, Txt.t("ui.aucun_plat"), Widgets.LARGEUR / 2, 120, Palette.TEXTE_FAIBLE);
         return;
      }

      // la grille
      int rangees = this.rangeesVisibles();
      int parPage = rangees * COLS;
      int maxDefil = this.maxDefilement(plats.size());
      this.defilement = Math.max(0, Math.min(this.defilement, maxDefil));
      int debut = this.defilement * COLS;
      for (int i = 0; i < parPage && debut + i < plats.size(); i++) {
         Plat p = plats.get(debut + i);
         int cx = x0 + i % COLS * PAS_X;
         int cy = Y_GRILLE + i / COLS * PAS_Y;
         boolean survol = c.zone(cx, cy, CW, CH, () -> this.ecran.ouvrirFiche(p.id()));
         this.vignette(c, cx, cy, p, cuisine, survol);
         if (survol) {
            c.bulle(p.nomTexte(), Txt.c(p.famille().nom()).toLowerCase(Locale.ROOT) + " · " + Txt.t("ui.palier").toLowerCase(Locale.ROOT) + " " + p.palier());
         }
      }
      if (maxDefil > 0) {
         int bx = Widgets.LARGEUR - Widgets.MARGE - 4;
         int bh = rangees * PAS_Y - 4;
         Dessin.rect(c.pile, bx, Y_GRILLE, 2, bh, Palette.voile(Palette.VIOLET, 96));
         int th = Math.max(10, bh * rangees / (maxDefil + rangees));
         int ty = Y_GRILLE + (bh - th) * this.defilement / maxDefil;
         Dessin.rect(c.pile, bx, ty, 2, th, Palette.voile(Palette.AMBRE, 176));
      }
   }

   private String compteFamille(Famille f, PaquetCuisine cuisine) {
      if (cuisine == null) {
         return "";
      }
      int total = 0;
      int connues = 0;
      for (Plat p : Catalogue.tous()) {
         if (p.famille() == f && p.variante() == null && cuisine.aPortee(p)) {
            total++;
            if (cuisine.connue(p)) {
               connues++;
            }
         }
      }
      return total == 0 ? Txt.t("ui.rien_a_portee") : Txt.t("ui.a_portee", connues, total);
   }

   private void vignette(Contexte c, int x, int y, Plat p, PaquetCuisine cuisine, boolean survol) {
      int cf = Palette.famille(p.famille());
      boolean connue = cuisine != null && cuisine.connue(p);
      int fois = cuisine == null ? 0 : cuisine.fois(p);
      Dessin.carteMate(
         c.pile, x, y, CW, CH,
         connue ? Palette.voile(Palette.CARTE, survol ? 240 : 176) : Palette.voile(Palette.NUIT, 192),
         survol ? Palette.voile(cf, 224) : Palette.voile(Palette.VIOLET, connue ? 192 : 128)
      );
      int mx = x + CW / 2;
      int my = y + 15;
      Dessin.disque(c.pile, mx, my, 11, Palette.voile(Palette.NUIT, 224));
      Dessin.anneau(c.pile, mx, my, 11, 1, Palette.voile(Palette.VIOLET, 192));
      if (connue) {
         Dessin.arc(c.pile, mx, my, 10, 2, cf, -90.0F, 360.0F * Math.min(1.0F, fois / 20.0F));
         Dessin.objet(p.id(), mx - 8, my - 8);
         Dessin.rect(c.pile, x + CW - 7, y + 4, 3, 3, Palette.JADE);
      } else {
         Dessin.texteCentre(c.pile, "?", mx, my - 4, Palette.voile(Palette.VIOLET, 255));
      }
      Dessin.texteCentre(c.pile, Dessin.tronquer(p.nomTexte(), CW - 8), mx, y + 28, connue ? Palette.TEXTE : Palette.TEXTE_FAIBLE);
      boolean accessible = cuisine == null || cuisine.aPortee(p);
      Dessin.texte(c.pile, "P" + p.palier(), x + 5, y + 39, accessible ? cf : Palette.voile(Palette.ROUGE, 224));
      Dessin.texteDroite(c.pile, Qualite.prix(p, 1) + " P", x + CW - 5, y + 39, connue ? Palette.AMBRE_CLAIR : Palette.voile(Palette.VIOLET, 255));
   }

   // --- filtrage --------------------------------------------------------------

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

   private List<Plat> filtres() {
      if (this.cache != null && this.cacheRecherche.equals(this.recherche) && this.cacheFiltre == this.filtre && this.cacheTaille == Catalogue.nombre()) {
         return this.cache;
      }
      String q = normaliser(this.recherche.trim());
      List<Plat> out = new ArrayList<>();
      for (Plat p : Catalogue.tous()) {
         if (this.filtre != null && p.famille() != this.filtre) {
            continue;
         }
         if (!q.isEmpty() && !normaliser(p.nomTexte()).contains(q)) {
            continue;
         }
         out.add(p);
      }
      this.cache = out;
      this.cacheRecherche = this.recherche;
      this.cacheFiltre = this.filtre;
      this.cacheTaille = Catalogue.nombre();
      return out;
   }

   private int rangeesVisibles() {
      return Math.max(1, (Widgets.HAUTEUR - Widgets.MARGE - 6 - Y_GRILLE) / PAS_Y);
   }

   private int maxDefilement(int nb) {
      return Math.max(0, (nb + COLS - 1) / COLS - this.rangeesVisibles());
   }

   // --- entrées ---------------------------------------------------------------

   @Override
   public void clicAilleurs() {
      this.champActif = false;
   }

   @Override
   public boolean caractere(char ch, int mods) {
      if (this.champActif && ch >= ' ') {
         this.recherche += ch;
         this.defilement = 0;
         return true;
      }
      return false;
   }

   @Override
   public boolean touche(int touche, int scan, int mods) {
      if (!this.champActif) {
         return false;
      }
      if (touche == TOUCHE_RETOUR_ARRIERE && !this.recherche.isEmpty()) {
         this.recherche = this.recherche.substring(0, this.recherche.length() - 1);
         this.defilement = 0;
         return true;
      }
      if (touche == TOUCHE_ENTREE || touche == TOUCHE_ENTREE_PAVE) {
         this.champActif = false;
         return true;
      }
      return this.champActif;
   }

   @Override
   public boolean echap() {
      if (this.champActif) {
         this.champActif = false;
         return true;
      }
      if (!this.recherche.isEmpty() || this.filtre != null) {
         this.recherche = "";
         this.filtre = null;
         return true;
      }
      return false;
   }

   @Override
   public boolean molette(double sens) {
      int max = this.maxDefilement(this.filtres().size());
      this.defilement = Math.max(0, Math.min(max, this.defilement - (int) Math.signum(sens)));
      return true;
   }
}
