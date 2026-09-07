package fr.cubeland.metiers.quete;

import fr.cubeland.metiers.CubelandMetiers;
import fr.cubeland.metiers.Progression;
import fr.cubeland.metiers.Reglages;
import fr.cubeland.metiers.cuisine.Catalogue;
import fr.cubeland.metiers.cuisine.Famille;
import fr.cubeland.metiers.cuisine.Plat;
import fr.cubeland.metiers.cuisine.Qualite;
import fr.cubeland.metiers.metier.DonneesMetiers;
import fr.cubeland.metiers.metier.Metier;
import fr.cubeland.metiers.metier.PontBoutique;
import fr.cubeland.metiers.reseau.PaquetAnnonce;
import fr.cubeland.metiers.reseau.PaquetEtat;
import fr.cubeland.metiers.reseau.PaquetQuetes;
import fr.cubeland.metiers.reseau.Reseau;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Random;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

/**
 * Les commandes du carnet : génération, suivi, livraison, récompense.
 *
 * <p>Trois commandes toujours ouvertes, une de chaque type. Aucune ne peut
 * échouer : on la remplit, ou une livraison trop vieille est remplacée. Tant
 * que les premiers pas ne sont pas finis, ce sont eux qu'on suit, et la
 * livraison proposée reste facile.</p>
 */
public final class Quetes {
   private static final Random HASARD = new Random();
   private static final int TICKS_PAR_MINUTE = 1200;

   private Quetes() {
   }

   // --- garantir trois commandes --------------------------------------------

   /** S'assure que le joueur a une commande de chaque type. Retourne la liste à jour. */
   public static List<Quete> assurer(ServerPlayer joueur, DonneesMetiers donnees) {
      if (!Reglages.get().commandes || !Catalogue.pret()) {
         return List.of();
      }
      UUID u = joueur.getUUID();
      Map<TypeQuete, Quete> parType = new EnumMap<>(TypeQuete.class);
      for (Quete q : donnees.quetes(u)) {
         parType.putIfAbsent(q.type(), q);
      }
      boolean change = false;
      for (TypeQuete type : TypeQuete.values()) {
         if (!parType.containsKey(type)) {
            Quete q = generer(type, joueur, donnees);
            if (q != null) {
               parType.put(type, q);
               change = true;
            }
         }
      }
      List<Quete> liste = new ArrayList<>(parType.values());
      if (change || liste.size() != donnees.quetes(u).size()) {
         donnees.definirQuetes(u, liste);
      }
      return liste;
   }

   private static void remplacer(ServerPlayer joueur, DonneesMetiers donnees, Quete ancienne) {
      List<Quete> liste = new ArrayList<>();
      for (Quete q : donnees.quetes(joueur.getUUID())) {
         if (!q.id().equals(ancienne.id())) {
            liste.add(q);
         }
      }
      Quete neuve = generer(ancienne.type(), joueur, donnees);
      if (neuve != null) {
         liste.add(neuve);
      }
      donnees.definirQuetes(joueur.getUUID(), liste);
   }

   private static void mettreAJour(DonneesMetiers donnees, UUID u, Quete q) {
      List<Quete> liste = new ArrayList<>();
      for (Quete existante : donnees.quetes(u)) {
         liste.add(existante.id().equals(q.id()) ? q : existante);
      }
      donnees.definirQuetes(u, liste);
   }

   // --- génération ----------------------------------------------------------

   private static String nouvelId(TypeQuete type, ServerPlayer joueur) {
      return type.cle() + "-" + Long.toString(joueur.level.getGameTime(), 36) + "-" + Integer.toString(HASARD.nextInt(1 << 20), 36);
   }

   static Quete generer(TypeQuete type, ServerPlayer joueur, DonneesMetiers donnees) {
      return switch (type) {
         case DECOUVERTE -> genererDecouverte(joueur, donnees);
         case LIVRAISON -> genererLivraison(joueur, donnees);
         case MAITRISE -> genererMaitrise(joueur, donnees);
      };
   }

   /** Les recettes principales (pas les variantes) à portée du joueur. */
   private static List<Plat> aPortee(UUID u, DonneesMetiers donnees) {
      List<Plat> l = new ArrayList<>();
      for (Plat p : Catalogue.tous()) {
         if (p.variante() == null && donnees.aPortee(u, p)) {
            l.add(p);
         }
      }
      return l;
   }

   private static Quete genererDecouverte(ServerPlayer joueur, DonneesMetiers donnees) {
      UUID u = joueur.getUUID();
      Reglages r = Reglages.get();
      List<Plat> inconnus = new ArrayList<>();
      for (Plat p : aPortee(u, donnees)) {
         if (!donnees.connait(u, p.recette())) {
            inconnus.add(p);
         }
      }
      if (inconnus.isEmpty()) {
         return null;
      }
      Map<String, Integer> groupes = new LinkedHashMap<>();
      for (Plat p : inconnus) {
         groupes.merge("famille:" + p.famille().id(), 1, Integer::sum);
         groupes.merge("poste:" + p.poste(), 1, Integer::sum);
      }
      List<String> riches = new ArrayList<>();
      for (Entry<String, Integer> e : groupes.entrySet()) {
         if (e.getValue() >= 2) {
            riches.add(e.getKey());
         }
      }
      String cible;
      int objectif;
      if (!riches.isEmpty()) {
         cible = riches.get(HASARD.nextInt(riches.size()));
         objectif = 2;
      } else {
         cible = "palier:" + donnees.palier(u);
         objectif = 1;
      }
      return new Quete(nouvelId(TypeQuete.DECOUVERTE, joueur), TypeQuete.DECOUVERTE, cible, objectif, 0, 1, r.xpCommandeDecouverte, 0L, false, 0L);
   }

   private static Quete genererLivraison(ServerPlayer joueur, DonneesMetiers donnees) {
      UUID u = joueur.getUUID();
      Reglages r = Reglages.get();
      int palier = donnees.palier(u);
      long expire = joueur.level.getGameTime() + (long) r.rotationLivraisonMinutes * TICKS_PAR_MINUTE;
      List<Plat> connus = new ArrayList<>();
      for (Plat p : aPortee(u, donnees)) {
         if (p.valeur() > 0 && donnees.connait(u, p.recette())) {
            connus.add(p);
         }
      }

      // premiers pas : une livraison facile, deux plats du palier 1 qu'on connaît déjà
      if (donnees.premiersPas(u) == PremiersPas.LIVRER) {
         List<Plat> faciles = new ArrayList<>();
         for (Plat p : connus) {
            if (p.palier() == 1) {
               faciles.add(p);
            }
         }
         Plat plat = choisir(faciles.isEmpty() ? connus : faciles);
         if (plat == null) {
            plat = choisir(Catalogue.duPalier(1));
         }
         if (plat == null) {
            return null;
         }
         return new Quete(nouvelId(TypeQuete.LIVRAISON, joueur), TypeQuete.LIVRAISON, plat.id(), 2, 0, 1, r.xpPremiersPas, pieces(plat, 1, 2), false, 0L);
      }

      // un défi sur quatre : un plat du palier au-dessus, qu'on ne connaît pas encore
      if (palier < Progression.PALIER_MAX && HASARD.nextInt(4) == 0) {
         List<Plat> dessus = new ArrayList<>();
         for (Plat p : Catalogue.duPalier(palier + 1)) {
            if (p.variante() == null && p.valeur() > 0 && !donnees.connait(u, p.recette())) {
               dessus.add(p);
            }
         }
         Plat plat = choisir(dessus);
         if (plat != null) {
            return new Quete(nouvelId(TypeQuete.LIVRAISON, joueur), TypeQuete.LIVRAISON, plat.id(), 1, 0, 1, r.xpCommandeLivraison * 2, pieces(plat, 1, 1) * 2L, true, 0L);
         }
      }

      Plat plat = choisir(connus);
      if (plat == null) {
         // rien de connu : la première livraison sert de découverte
         plat = choisir(Catalogue.duPalier(1));
         if (plat == null) {
            return null;
         }
         return new Quete(nouvelId(TypeQuete.LIVRAISON, joueur), TypeQuete.LIVRAISON, plat.id(), 1, 0, 1, r.xpCommandeLivraison, pieces(plat, 1, 1), false, expire);
      }
      int objectif = plat.valeur() >= 60 ? 2 + HASARD.nextInt(3) : 3 + HASARD.nextInt(4);
      int qualiteMin = palier >= 2 ? 2 : 1;
      return new Quete(nouvelId(TypeQuete.LIVRAISON, joueur), TypeQuete.LIVRAISON, plat.id(), objectif, 0, qualiteMin, r.xpCommandeLivraison, pieces(plat, qualiteMin, objectif), false, expire);
   }

   private static long pieces(Plat plat, int qualiteMin, int objectif) {
      return Qualite.prix(plat, qualiteMin) * objectif * Reglages.get().livraisonPourcent / 100L;
   }

   private static Quete genererMaitrise(ServerPlayer joueur, DonneesMetiers donnees) {
      UUID u = joueur.getUUID();
      Reglages r = Reglages.get();
      int palier = donnees.palier(u);
      List<Quete> choix = new ArrayList<>();
      String id = nouvelId(TypeQuete.MAITRISE, joueur);
      int q = Math.min(Qualite.MAX, Math.max(2, palier + 1));
      choix.add(new Quete(id, TypeQuete.MAITRISE, "qualite:" + q, 1, 0, q, r.xpCommandeMaitrise, 0L, false, 0L));
      Entry<String, Integer> fav = donnees.favorite(u);
      if (fav != null && fav.getValue() >= 3 && Catalogue.parId(fav.getKey()) != null) {
         choix.add(new Quete(id, TypeQuete.MAITRISE, "favorite:" + fav.getKey(), 5, 0, 1, r.xpCommandeMaitrise, 0L, false, 0L));
      }
      if (donnees.nombreRecettes(u) >= 2) {
         choix.add(new Quete(id, TypeQuete.MAITRISE, "servir", 1, 0, 1, r.xpCommandeMaitrise, 0L, false, 0L));
         choix.add(new Quete(id, TypeQuete.MAITRISE, "repas", 3, 0, 1, r.xpCommandeMaitrise, 0L, false, 0L));
      }
      return choix.get(HASARD.nextInt(choix.size()));
   }

   private static Plat choisir(List<Plat> l) {
      return l == null || l.isEmpty() ? null : l.get(HASARD.nextInt(l.size()));
   }

   // --- ce qui fait avancer -------------------------------------------------

   /** Le joueur a cliqué un poste de cuisine. */
   public static void surPoste(ServerPlayer joueur, DonneesMetiers donnees) {
      if (Reglages.get().premiersPas && donnees.premiersPas(joueur.getUUID()) == PremiersPas.POSTE) {
         avancerPremiersPas(joueur, donnees);
      }
   }

   /** Le joueur vient de sortir un plat d'un atelier. */
   public static void surCuisine(ServerPlayer joueur, DonneesMetiers donnees, Plat plat, int qualite, boolean decouverte) {
      UUID u = joueur.getUUID();
      if (Reglages.get().premiersPas && donnees.premiersPas(u) == PremiersPas.FOURNEE) {
         avancerPremiersPas(joueur, donnees);
      }
      for (Quete q : assurer(joueur, donnees)) {
         if (q.faite()) {
            continue;
         }
         boolean compte = switch (q.type()) {
            case DECOUVERTE -> decouverte && plat.variante() == null && switch (q.genre()) {
               case "famille" -> plat.famille().id().equals(q.valeur());
               case "poste" -> plat.poste().equals(q.valeur());
               default -> true;
            };
            case MAITRISE -> switch (q.genre()) {
               case "qualite" -> qualite >= q.qualiteMin();
               case "favorite" -> plat.recette().equals(q.valeur());
               default -> false;
            };
            default -> false;
         };
         if (compte) {
            progresser(joueur, donnees, q.plus(1));
         }
      }
   }

   /** Quelqu'un vient de manger un plat marqué. */
   public static void surRepas(ServerPlayer mangeur, DonneesMetiers donnees, ItemStack pile) {
      String nom = mangeur.getGameProfile().getName();
      if (Qualite.estDe(pile, nom)) {
         if (Reglages.get().premiersPas && donnees.premiersPas(mangeur.getUUID()) == PremiersPas.GOUTER) {
            avancerPremiersPas(mangeur, donnees);
         }
         for (Quete q : assurer(mangeur, donnees)) {
            if (!q.faite() && q.type() == TypeQuete.MAITRISE && "repas".equals(q.genre()) && Qualite.de(pile) >= q.qualiteMin()) {
               progresser(mangeur, donnees, q.plus(1));
            }
         }
         return;
      }
      String auteur = Qualite.auteur(pile);
      if (auteur.isEmpty()) {
         return;
      }
      ServerPlayer cuisinier = mangeur.server.getPlayerList().getPlayerByName(auteur);
      if (cuisinier == null || cuisinier == mangeur) {
         return;
      }
      for (Quete q : assurer(cuisinier, donnees)) {
         if (!q.faite() && q.type() == TypeQuete.MAITRISE && "servir".equals(q.genre())) {
            progresser(cuisinier, donnees, q.plus(1));
         }
      }
   }

   /** Le joueur vient de vendre à la boutique. */
   public static void surVente(ServerPlayer joueur, DonneesMetiers donnees) {
      if (Reglages.get().premiersPas && donnees.premiersPas(joueur.getUUID()) == PremiersPas.VENDRE) {
         avancerPremiersPas(joueur, donnees);
      }
   }

   /** Livre, depuis l'inventaire, ce qui manque à cette commande. Retourne le nombre de plats pris. */
   public static int livrer(ServerPlayer joueur, DonneesMetiers donnees, String queteId) {
      Quete quete = null;
      for (Quete q : assurer(joueur, donnees)) {
         if (q.id().equals(queteId) && q.type() == TypeQuete.LIVRAISON) {
            quete = q;
         }
      }
      if (quete == null || quete.faite()) {
         return 0;
      }
      String recette = Catalogue.recetteDe(quete.cible());
      String nom = joueur.getGameProfile().getName();
      int manque = quete.manque();
      int pris = 0;
      for (ItemStack pile : joueur.getInventory().items) {
         if (manque <= 0) {
            break;
         }
         Plat plat = Catalogue.de(pile);
         if (plat == null || !plat.recette().equals(recette) || !Qualite.estDe(pile, nom) || Qualite.de(pile) < quete.qualiteMin()) {
            continue;
         }
         if (Qualite.horsPalier(pile) && !quete.defi()) {
            continue;
         }
         int n = Math.min(manque, pile.getCount());
         pile.shrink(n);
         manque -= n;
         pris += n;
      }
      if (pris > 0) {
         progresser(joueur, donnees, quete.plus(pris));
      }
      return pris;
   }

   private static void progresser(ServerPlayer joueur, DonneesMetiers donnees, Quete q) {
      mettreAJour(donnees, joueur.getUUID(), q);
      if (q.faite()) {
         terminer(joueur, donnees, q);
      } else {
         Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
      }
   }

   private static void terminer(ServerPlayer joueur, DonneesMetiers donnees, Quete q) {
      UUID u = joueur.getUUID();
      if (q.xp() > 0) {
         donnees.ajouter(u, Metier.CUISINIER, q.xp());
      }
      if (q.pieces() > 0L && !PontBoutique.crediter(joueur.server, u, q.pieces())) {
         CubelandMetiers.LOG.warn("Commande {} de {} : la boutique n'a pas crédité {} P.", q.id(), joueur.getGameProfile().getName(), q.pieces());
      }
      if (q.defi()) {
         donnees.debloquer(u, q.cible());
      }
      donnees.noterCommandeFaite(u);
      Reseau.versJoueur(joueur, new PaquetAnnonce(Component.translatable("cubelandmetiers.annonce.commande"), TextesQuete.consigne(q), PaquetAnnonce.COMMANDE));
      joueur.sendSystemMessage(
         Component.translatable("cubelandmetiers.msg.commande_faite").withStyle(ChatFormatting.GOLD)
            .append(Component.literal(" ").append(TextesQuete.consigne(q)).withStyle(ChatFormatting.WHITE))
            .append(Component.literal("  ").append(TextesQuete.recompense(q)).withStyle(ChatFormatting.DARK_GRAY))
      );
      joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.PLAYER_LEVELUP, SoundSource.PLAYERS, 0.5F, 1.4F);

      // les premiers pas avancent avant le remplacement : la commande suivante sera une vraie, pas une facile
      if (Reglages.get().premiersPas && q.type() == TypeQuete.LIVRAISON && donnees.premiersPas(u) == PremiersPas.LIVRER) {
         avancerPremiersPas(joueur, donnees);
      }
      remplacer(joueur, donnees, q);
      Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
      Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
   }

   /** Toutes les cinq secondes : remplace les livraisons trop vieilles. */
   public static void tick(ServerPlayer joueur, DonneesMetiers donnees) {
      long maintenant = joueur.level.getGameTime();
      for (Quete q : assurer(joueur, donnees)) {
         if (q.type() == TypeQuete.LIVRAISON && q.expire() > 0L && maintenant >= q.expire() && !q.faite()) {
            remplacer(joueur, donnees, q);
            Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
         }
      }
   }

   // --- premiers pas --------------------------------------------------------

   private static void avancerPremiersPas(ServerPlayer joueur, DonneesMetiers donnees) {
      UUID u = joueur.getUUID();
      int etape = donnees.premiersPas(u) + 1;
      donnees.definirPremiersPas(u, etape);
      donnees.ajouter(u, Metier.CUISINIER, Reglages.get().xpPremiersPas);
      if (PremiersPas.finis(etape)) {
         recompenserPremiersPas(joueur);
         Reseau.versJoueur(joueur, new PaquetAnnonce(Component.translatable("cubelandmetiers.annonce.premiers_pas_finis"), Component.translatable("cubelandmetiers.annonce.premiers_pas_finis.detail"), PaquetAnnonce.COMMANDE));
      } else {
         Reseau.versJoueur(joueur, new PaquetAnnonce(TextesQuete.premiersPas(etape - 1), TextesQuete.premiersPas(etape), PaquetAnnonce.COMMANDE));
         if (etape == PremiersPas.LIVRER) {
            // la livraison en cours est remplacée par une facile
            for (Quete q : donnees.quetes(u)) {
               if (q.type() == TypeQuete.LIVRAISON) {
                  remplacer(joueur, donnees, q);
                  break;
               }
            }
         }
      }
      joueur.level.playSound(null, joueur.blockPosition(), SoundEvents.EXPERIENCE_ORB_PICKUP, SoundSource.PLAYERS, 0.4F, 1.6F);
      Reseau.versJoueur(joueur, PaquetEtat.pour(joueur, donnees));
      Reseau.versJoueur(joueur, PaquetQuetes.pour(joueur, donnees));
   }

   private static void recompenserPremiersPas(ServerPlayer joueur) {
      String id = Reglages.get().recompensePremiersPas;
      if (id == null || id.isBlank()) {
         return;
      }
      ResourceLocation rl = ResourceLocation.tryParse(id);
      Item item = rl == null ? null : ForgeRegistries.ITEMS.getValue(rl);
      if (item == null || !ForgeRegistries.ITEMS.containsKey(rl)) {
         CubelandMetiers.LOG.warn("Récompense des premiers pas introuvable : {}", id);
         return;
      }
      ItemStack pile = new ItemStack(item);
      if (!joueur.getInventory().add(pile)) {
         joueur.drop(pile, false);
      }
   }
}
