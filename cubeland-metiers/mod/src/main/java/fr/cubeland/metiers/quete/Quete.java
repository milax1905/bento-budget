package fr.cubeland.metiers.quete;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.FriendlyByteBuf;

/**
 * Une commande du carnet.
 *
 * @param id         identifiant unique (pour livrer ou remplacer la bonne)
 * @param type       découverte, livraison ou maîtrise
 * @param cible      ce qui est visé, selon le type : {@code famille:soupe},
 *                   {@code poste:marmite}, l'identifiant d'un plat, {@code qualite:4},
 *                   {@code favorite}, {@code servir}, {@code repas}
 * @param objectif   combien il en faut
 * @param progres    combien on en a
 * @param qualiteMin qualité minimale exigée (livraison, repas), 1 sinon
 * @param xp         XP de cuisinier gagnée à la fin
 * @param pieces     pièces créditées par la boutique à la fin
 * @param defi       une commande du palier au-dessus : la réussir débloque le plat
 * @param expire     temps de jeu après lequel elle est remplacée (0 : jamais)
 */
public record Quete(String id, TypeQuete type, String cible, int objectif, int progres, int qualiteMin, int xp, long pieces, boolean defi, long expire) {

   public boolean faite() {
      return this.progres >= this.objectif;
   }

   public int manque() {
      return Math.max(0, this.objectif - this.progres);
   }

   public float part() {
      return this.objectif <= 0 ? 1.0F : Math.max(0.0F, Math.min(1.0F, (float) this.progres / this.objectif));
   }

   public Quete avecProgres(int p) {
      return new Quete(this.id, this.type, this.cible, this.objectif, Math.max(0, Math.min(this.objectif, p)), this.qualiteMin, this.xp, this.pieces, this.defi, this.expire);
   }

   public Quete plus(int n) {
      return this.avecProgres(this.progres + n);
   }

   /** La partie de la cible avant les deux-points (« famille », « poste », « qualite »…). */
   public String genre() {
      int i = this.cible.indexOf(':');
      return i < 0 ? this.cible : this.cible.substring(0, i);
   }

   /** La partie de la cible après les deux-points. */
   public String valeur() {
      int i = this.cible.indexOf(':');
      return i < 0 ? "" : this.cible.substring(i + 1);
   }

   /** Vrai si la cible est un identifiant d'objet (livraison). */
   public boolean cibleUnPlat() {
      return this.type == TypeQuete.LIVRAISON;
   }

   // --- sauvegarde ----------------------------------------------------------

   public CompoundTag ecrire() {
      CompoundTag t = new CompoundTag();
      t.putString("id", this.id);
      t.putString("type", this.type.name());
      t.putString("cible", this.cible);
      t.putInt("objectif", this.objectif);
      t.putInt("progres", this.progres);
      t.putInt("qualiteMin", this.qualiteMin);
      t.putInt("xp", this.xp);
      t.putLong("pieces", this.pieces);
      t.putBoolean("defi", this.defi);
      t.putLong("expire", this.expire);
      return t;
   }

   public static Quete lire(CompoundTag t) {
      return new Quete(
         t.getString("id"),
         TypeQuete.par(t.getString("type")),
         t.getString("cible"),
         Math.max(1, t.getInt("objectif")),
         t.getInt("progres"),
         Math.max(1, t.getInt("qualiteMin")),
         t.getInt("xp"),
         t.getLong("pieces"),
         t.getBoolean("defi"),
         t.getLong("expire")
      );
   }

   // --- réseau --------------------------------------------------------------

   public void ecrire(FriendlyByteBuf b) {
      b.writeUtf(this.id, 64);
      b.writeEnum(this.type);
      b.writeUtf(this.cible, 200);
      b.writeVarInt(this.objectif);
      b.writeVarInt(this.progres);
      b.writeVarInt(this.qualiteMin);
      b.writeVarInt(this.xp);
      b.writeVarLong(this.pieces);
      b.writeBoolean(this.defi);
      b.writeVarLong(this.expire);
   }

   public static Quete lire(FriendlyByteBuf b) {
      return new Quete(
         b.readUtf(64), b.readEnum(TypeQuete.class), b.readUtf(200), b.readVarInt(), b.readVarInt(), b.readVarInt(), b.readVarInt(), b.readVarLong(), b.readBoolean(), b.readVarLong()
      );
   }
}
