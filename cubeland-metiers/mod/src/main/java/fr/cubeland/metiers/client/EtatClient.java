package fr.cubeland.metiers.client;

import fr.cubeland.metiers.reseau.PaquetAnnonce;
import fr.cubeland.metiers.reseau.PaquetCuisine;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetFiche;
import fr.cubeland.metiers.reseau.PaquetRepas;
import net.minecraft.client.Minecraft;

public final class EtatClient {
   private static PaquetEtat etat;
   private static PaquetCuisine cuisine;
   private static long derniereActivite;
   private static PaquetFiche fiche;
   private static PaquetRepas repas;
   private static long finRepas;
   private static PaquetAnnonce annonce;
   private static long finAnnonce;

   private EtatClient() {
   }

   public static PaquetEtat etat() {
      return etat;
   }

   public static PaquetCuisine cuisine() {
      return cuisine;
   }

   public static boolean pret() {
      return etat != null;
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

   public static PaquetFiche fiche() {
      return fiche;
   }

   public static boolean ficheDe(String plat) {
      return fiche != null && fiche.plat().equals(plat);
   }

   public static void recevoirFiche(PaquetFiche p) {
      fiche = p;
   }

   public static void oublierFiche() {
      fiche = null;
   }

   public static void recevoirRepas(PaquetRepas p) {
      repas = p;
      finRepas = System.currentTimeMillis() + (long)p.secondes() * 1000L;
   }

   public static PaquetRepas repas() {
      return repas != null && System.currentTimeMillis() < finRepas ? repas : null;
   }

   public static float partRepas() {
      if (repas() != null && repas.secondes() > 0) {
         long reste = finRepas - System.currentTimeMillis();
         return Math.max(0.0F, Math.min(1.0F, (float)reste / ((float)repas.secondes() * 1000.0F)));
      } else {
         return 0.0F;
      }
   }

   public static int secondesRepas() {
      return repas() == null ? 0 : (int)Math.max(0L, (finRepas - System.currentTimeMillis()) / 1000L);
   }

   public static void recevoirAnnonce(PaquetAnnonce p) {
      annonce = p;
      finAnnonce = System.currentTimeMillis() + 4000L;
      derniereActivite = System.currentTimeMillis();
   }

   public static PaquetAnnonce annonce() {
      return annonce != null && System.currentTimeMillis() < finAnnonce ? annonce : null;
   }

   public static float partAnnonce() {
      return annonce() == null ? 0.0F : Math.max(0.0F, Math.min(1.0F, (float)(finAnnonce - System.currentTimeMillis()) / 4000.0F));
   }

   public static void ouvrirPanneau(int onglet) {
      Minecraft.getInstance().setScreen(new EcranMetiers(onglet));
   }

   public static long depuisActivite() {
      return derniereActivite == 0L ? Long.MAX_VALUE : System.currentTimeMillis() - derniereActivite;
   }

   public static void oublier() {
      fiche = null;
      etat = null;
      cuisine = null;
      repas = null;
      annonce = null;
      derniereActivite = 0L;
   }
}
