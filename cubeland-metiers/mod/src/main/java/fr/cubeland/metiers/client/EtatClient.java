package fr.cubeland.metiers.client;

import fr.cubeland.metiers.client.ecran.EcranCubeland;
import fr.cubeland.metiers.quete.PremiersPas;
import fr.cubeland.metiers.quete.Quete;
import fr.cubeland.metiers.quete.TypeQuete;
import fr.cubeland.metiers.reseau.PaquetAnnonce;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetFiche;
import fr.cubeland.metiers.reseau.PaquetQuetes;
import fr.cubeland.metiers.reseau.PaquetRepas;
import java.util.List;
import net.minecraft.client.Minecraft;

/** Ce que le client sait, tel que le serveur le lui a envoyé. */
public final class EtatClient {
   private static final long DUREE_ANNONCE = 4000L;

   private static boolean demo;
   private static boolean synchronise;
   private static PaquetEtat etat;
   private static PaquetCuisine cuisine;
   private static PaquetQuetes quetes;
   private static PaquetFiche fiche;
   private static PaquetRepas repas;
   private static long finRepas;
   private static PaquetAnnonce annonce;
   private static long finAnnonce;
   private static long derniereActivite;

   private EtatClient() {
   }

   // --- réception -----------------------------------------------------------

   public static void synchronise() {
      synchronise = true;
   }

   public static void recevoir(PaquetEtat p) {
      boolean change = etat == null || etat.niveauCuisinier() != p.niveauCuisinier() || etat.recettes() != p.recettes();
      etat = p;
      if (change) {
         derniereActivite = System.currentTimeMillis();
      }
   }

   public static void recevoirCuisine(PaquetCuisine p) {
      cuisine = p;
   }

   public static void recevoirQuetes(PaquetQuetes p) {
      quetes = p;
   }

   public static void recevoirFiche(PaquetFiche p) {
      fiche = p;
   }

   public static void recevoirRepas(PaquetRepas p) {
      repas = p;
      finRepas = System.currentTimeMillis() + p.secondes() * 1000L;
   }

   public static void recevoirAnnonce(PaquetAnnonce p) {
      annonce = p;
      finAnnonce = System.currentTimeMillis() + DUREE_ANNONCE;
      derniereActivite = System.currentTimeMillis();
   }

   public static void ouvrirPanneau(int onglet) {
      Minecraft.getInstance().setScreen(new EcranCubeland(onglet));
   }

   /** À la déconnexion : on oublie tout, le prochain serveur renverra le sien. */
   public static void oublier() {
      synchronise = false;
      etat = null;
      cuisine = null;
      quetes = null;
      fiche = null;
      repas = null;
      annonce = null;
      derniereActivite = 0L;
   }

   /** Mode démo (outil de développement) : le panneau se remplit sans serveur. */
   public static void activerDemo() {
      demo = true;
   }

   public static boolean horsLigne() {
      return demo && Minecraft.getInstance().getConnection() == null;
   }

   // --- lecture -------------------------------------------------------------

   /** Vrai quand réglages, catalogue et état sont arrivés. */
   public static boolean pret() {
      return synchronise && etat != null;
   }

   public static PaquetEtat etat() {
      return etat;
   }

   public static PaquetCuisine cuisine() {
      return cuisine;
   }

   public static List<Quete> quetes() {
      return quetes == null ? List.of() : quetes.quetes();
   }

   public static Quete quete(TypeQuete type) {
      for (Quete q : quetes()) {
         if (q.type() == type) {
            return q;
         }
      }
      return null;
   }

   public static int premiersPas() {
      return quetes == null ? PremiersPas.FINI : quetes.premiersPas();
   }

   public static boolean premiersPasEnCours() {
      return quetes != null && !PremiersPas.finis(quetes.premiersPas());
   }

   public static PaquetFiche fiche() {
      return fiche;
   }

   public static boolean ficheDe(String plat) {
      return fiche != null && fiche.plat().equals(plat);
   }

   public static void oublierFiche() {
      fiche = null;
   }

   public static PaquetRepas repas() {
      return repas != null && System.currentTimeMillis() < finRepas ? repas : null;
   }

   public static float partRepas() {
      if (repas() == null || repas.secondes() <= 0) {
         return 0.0F;
      }
      long reste = finRepas - System.currentTimeMillis();
      return Math.max(0.0F, Math.min(1.0F, (float) reste / (repas.secondes() * 1000.0F)));
   }

   public static int secondesRepas() {
      return repas() == null ? 0 : (int) Math.max(0L, (finRepas - System.currentTimeMillis()) / 1000L);
   }

   public static PaquetAnnonce annonce() {
      return annonce != null && System.currentTimeMillis() < finAnnonce ? annonce : null;
   }

   public static float partAnnonce() {
      return annonce() == null ? 0.0F : Math.max(0.0F, Math.min(1.0F, (float) (finAnnonce - System.currentTimeMillis()) / DUREE_ANNONCE));
   }

   public static long depuisActivite() {
      return derniereActivite == 0L ? Long.MAX_VALUE : System.currentTimeMillis() - derniereActivite;
   }
}
