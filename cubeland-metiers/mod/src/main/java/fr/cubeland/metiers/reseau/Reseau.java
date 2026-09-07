package fr.cubeland.metiers.reseau;

import fr.cubeland.metiers.CubelandMetiers;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.NetworkRegistry;
import net.minecraftforge.network.PacketDistributor;
import net.minecraftforge.network.simple.SimpleChannel;

/**
 * Le canal réseau du mod.
 *
 * <p>Protocole 2 : le serveur envoie ses réglages et son catalogue à la
 * connexion, puis seulement ce qui change. Un client 1.4 ne peut pas parler à
 * un serveur 2.0, et inversement : la mise à jour se fait des deux côtés.</p>
 */
public final class Reseau {
   private static final String VERSION = "2";
   private static SimpleChannel canal;
   private static int id;

   private Reseau() {
   }

   public static void enregistrer() {
      canal = NetworkRegistry.ChannelBuilder.named(new ResourceLocation(CubelandMetiers.MODID, "principal"))
         .networkProtocolVersion(() -> VERSION)
         .clientAcceptedVersions(VERSION::equals)
         .serverAcceptedVersions(VERSION::equals)
         .simpleChannel();
      // serveur → client
      canal.registerMessage(id++, PaquetSync.class, PaquetSync::ecrire, PaquetSync::lire, PaquetSync::traiter);
      canal.registerMessage(id++, PaquetEtat.class, PaquetEtat::ecrire, PaquetEtat::lire, PaquetEtat::traiter);
      canal.registerMessage(id++, PaquetCuisine.class, PaquetCuisine::ecrire, PaquetCuisine::lire, PaquetCuisine::traiter);
      canal.registerMessage(id++, PaquetQuetes.class, PaquetQuetes::ecrire, PaquetQuetes::lire, PaquetQuetes::traiter);
      canal.registerMessage(id++, PaquetFiche.class, PaquetFiche::ecrire, PaquetFiche::lire, PaquetFiche::traiter);
      canal.registerMessage(id++, PaquetRepas.class, PaquetRepas::ecrire, PaquetRepas::lire, PaquetRepas::traiter);
      canal.registerMessage(id++, PaquetAnnonce.class, PaquetAnnonce::ecrire, PaquetAnnonce::lire, PaquetAnnonce::traiter);
      canal.registerMessage(id++, PaquetOuvrir.class, PaquetOuvrir::ecrire, PaquetOuvrir::lire, PaquetOuvrir::traiter);
      // client → serveur
      canal.registerMessage(id++, PaquetDemande.class, PaquetDemande::ecrire, PaquetDemande::lire, PaquetDemande::traiter);
      canal.registerMessage(id++, PaquetDemandeFiche.class, PaquetDemandeFiche::ecrire, PaquetDemandeFiche::lire, PaquetDemandeFiche::traiter);
      canal.registerMessage(id++, PaquetLivrer.class, PaquetLivrer::ecrire, PaquetLivrer::lire, PaquetLivrer::traiter);
   }

   public static void versJoueur(ServerPlayer joueur, Object paquet) {
      if (canal != null && joueur != null) {
         canal.send(PacketDistributor.PLAYER.with(() -> joueur), paquet);
      }
   }

   public static void versServeur(Object paquet) {
      if (canal != null) {
         canal.sendToServer(paquet);
      }
   }
}
