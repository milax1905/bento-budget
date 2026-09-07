package fr.cubeland.metiers.reseau;

import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.network.PacketDistributor;
import net.minecraftforge.network.NetworkRegistry.ChannelBuilder;
import net.minecraftforge.network.simple.SimpleChannel;

public final class Reseau {
   private static final String VERSION = "1";
   private static SimpleChannel canal;
   private static int id;

   private Reseau() {
   }

   public static void enregistrer() {
      canal = ChannelBuilder.named(new ResourceLocation("cubelandmetiers", "principal"))
         .networkProtocolVersion(() -> "1")
         .clientAcceptedVersions("1"::equals)
         .serverAcceptedVersions("1"::equals)
         .simpleChannel();
      canal.registerMessage(id++, PaquetEtat.class, PaquetEtat::ecrire, PaquetEtat::lire, PaquetEtat::traiter);
      canal.registerMessage(id++, PaquetOuvrir.class, PaquetOuvrir::ecrire, PaquetOuvrir::lire, PaquetOuvrir::traiter);
      canal.registerMessage(id++, PaquetCuisine.class, PaquetCuisine::ecrire, PaquetCuisine::lire, PaquetCuisine::traiter);
      canal.registerMessage(id++, PaquetDemande.class, PaquetDemande::ecrire, PaquetDemande::lire, PaquetDemande::traiter);
      canal.registerMessage(id++, PaquetDemandeFiche.class, PaquetDemandeFiche::ecrire, PaquetDemandeFiche::lire, PaquetDemandeFiche::traiter);
      canal.registerMessage(id++, PaquetFiche.class, PaquetFiche::ecrire, PaquetFiche::lire, PaquetFiche::traiter);
      canal.registerMessage(id++, PaquetRepas.class, PaquetRepas::ecrire, PaquetRepas::lire, PaquetRepas::traiter);
      canal.registerMessage(id++, PaquetAnnonce.class, PaquetAnnonce::ecrire, PaquetAnnonce::lire, PaquetAnnonce::traiter);
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
