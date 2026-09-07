package fr.cubeland.metiers.metier;

import java.util.List;

public record Metier(String id, String nom, String icone, String resume, List<String[]> actions) {
   public static final String MINEUR = "mineur";
   public static final String BUCHERON = "bucheron";
   public static final String FERMIER = "fermier";
   public static final String CHASSEUR = "chasseur";
   public static final String PECHEUR = "pecheur";
   public static final String CUISINIER = "cuisinier";
}
