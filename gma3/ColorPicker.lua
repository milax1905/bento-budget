-- =====================================================================
--  Color Picker Generator  -  Plugin Lua pour grandMA3 (v1.9+ / v2)
-- ---------------------------------------------------------------------
--  Genere automatiquement :
--    * une grille de presets couleur (Pool 4 / Color), construits a
--      partir d'une rampe HSV (teintes x niveaux de luminosite + gris) ;
--    * l'appearance (couleur d'affichage) de chaque preset ;
--    * un Layout qui place tous ces presets dans une grille cliquable.
--
--  Les presets couleur de grandMA3 sont stockes de maniere generique
--  (= "recipe" couleur) : ils s'appliquent a n'importe quel projecteur
--  selectionne, quel que soit son systeme de couleur (RGB, RGBW, CMY...).
--
--  Pre-requis : avoir une selection de fixtures disposant d'attributs
--  de couleur (ColorRGB) AVANT de lancer le plugin.
--
--  Auteur : genere pour Axel - libre d'utilisation / modification.
-- =====================================================================

-- Conversion HSV -> RGB.
-- h : 0..360 (teinte), s : 0..1 (saturation), v : 0..1 (valeur)
-- retourne r,g,b dans la plage 0..255
local function hsv2rgb(h, s, v)
    h = h % 360
    local c = v * s
    local x = c * (1 - math.abs((h / 60) % 2 - 1))
    local m = v - c
    local r, g, b = 0, 0, 0
    if     h < 60  then r, g, b = c, x, 0
    elseif h < 120 then r, g, b = x, c, 0
    elseif h < 180 then r, g, b = 0, c, x
    elseif h < 240 then r, g, b = 0, x, c
    elseif h < 300 then r, g, b = x, 0, c
    else                r, g, b = c, 0, x end
    return math.floor((r + m) * 255 + 0.5),
           math.floor((g + m) * 255 + 0.5),
           math.floor((b + m) * 255 + 0.5)
end

-- Petit utilitaire : lit un nombre depuis une saisie texte, avec
-- valeur par defaut et bornes mini/maxi.
local function toNum(value, default, min, max)
    local n = tonumber(value) or default
    if min and n < min then n = min end
    if max and n > max then n = max end
    return math.floor(n)
end

-- Construit la liste des couleurs a generer.
-- Renvoie un tableau d'entrees : { name, r, g, b, col, row }
local function buildPalette(hues, rows, greyscale)
    local palette = {}
    local row = 0

    -- Lignes de teintes : chaque ligne fait varier la luminosite (V)
    -- de 100% (haut) vers ~25% (bas), saturation pleine.
    for r = 0, rows - 1 do
        local v = 1.0 - (r * (0.75 / math.max(rows - 1, 1)))
        for c = 0, hues - 1 do
            local hue = (c / hues) * 360
            local red, green, blue = hsv2rgb(hue, 1.0, v)
            palette[#palette + 1] = {
                name = string.format("H%d V%d", math.floor(hue), math.floor(v * 100)),
                r = red, g = green, b = blue, col = c, row = row,
            }
        end
        row = row + 1
    end

    -- Ligne de degrades de gris (du blanc au noir) + ligne optionnelle.
    if greyscale then
        for c = 0, hues - 1 do
            local level = math.floor((1 - (c / math.max(hues - 1, 1))) * 255 + 0.5)
            palette[#palette + 1] = {
                name = string.format("Grey %d", math.floor(level / 255 * 100)),
                r = level, g = level, b = level, col = c, row = row,
            }
        end
        row = row + 1
    end

    return palette, row
end

-- Place les presets dans le Layout via l'API objet (guardee par pcall
-- pour rester compatible entre versions). Retourne nb place, nb erreurs.
local function fillLayout(layoutNo, presetType, palette)
    local placed, failed = 0, 0
    local layout
    local ok = pcall(function()
        layout = ObjectList("Layout " .. layoutNo)[1]
    end)
    if not ok or not layout then
        return 0, #palette
    end

    for _, item in ipairs(palette) do
        local done = pcall(function()
            local ele = layout:Append()
            ele:Set("SizeH", "1")
            ele:Set("SizeV", "1")
            ele:Set("PosX",  tostring(item.col))
            ele:Set("PosY",  tostring(-item.row)) -- Y descend vers le bas
            -- Reference l'objet preset par son adresse de ligne de commande.
            ele:Set("Object", string.format("Preset %d.%d", presetType, item.no))
        end)
        if done then placed = placed + 1 else failed = failed + 1 end
    end
    return placed, failed
end

-- ---------------------------------------------------------------------
--  Fonction principale appelee par grandMA3.
-- ---------------------------------------------------------------------
local function main(display_handle)
    local PRESET_TYPE = 4 -- Pool de presets "Color"

    -- 1) Boite de dialogue de configuration -----------------------------
    local cfg = MessageBox({
        title    = "Color Picker Generator",
        message  = "Genere une grille de presets couleur + un Layout.\n"
                .. "Selectionne d'abord des fixtures RGB.",
        commands = {
            { value = 1, name = "Generer" },
            { value = 0, name = "Annuler" },
        },
        inputs = {
            { name = "Teintes (colonnes)",  value = "12" },
            { name = "Niveaux (lignes)",    value = "4"  },
            { name = "Preset depart (ID)",  value = "1"  },
            { name = "Layout (No)",         value = "1"  },
            { name = "Ligne de gris (1/0)", value = "1"  },
        },
    })

    if not cfg or cfg.result ~= 1 then
        return -- annule par l'utilisateur
    end

    local hues      = toNum(cfg.inputs["Teintes (colonnes)"], 12, 1, 36)
    local rows      = toNum(cfg.inputs["Niveaux (lignes)"],    4, 1, 12)
    local startId   = toNum(cfg.inputs["Preset depart (ID)"],  1, 1, 10000)
    local layoutNo  = toNum(cfg.inputs["Layout (No)"],         1, 1, 10000)
    local greyscale = toNum(cfg.inputs["Ligne de gris (1/0)"], 1, 0, 1) == 1

    -- 2) Verifie qu'une selection existe (si l'API le permet) ----------
    local selCount, hasSelApi = 0, false
    pcall(function()
        selCount  = SelectionCount()
        hasSelApi = true
    end)
    if hasSelApi and selCount == 0 then
        MessageBox({
            title    = "Color Picker",
            message  = "Aucune fixture selectionnee.\n"
                    .. "Selectionne des projecteurs RGB puis relance.",
            commands = { { value = 1, name = "OK" } },
        })
        return
    end

    -- 3) Construit la palette ------------------------------------------
    local palette, totalRows = buildPalette(hues, rows, greyscale)

    -- 4) Cree chaque preset couleur ------------------------------------
    --    On fixe la couleur dans le programmer (ColorRGB en %), on
    --    stocke le preset (generique = recipe couleur), on l'etiquette
    --    et on lui donne son appearance.
    for i, item in ipairs(palette) do
        item.no = startId + (i - 1)

        Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(item.r / 255 * 100 + 0.5)))
        Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(item.g / 255 * 100 + 0.5)))
        Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(item.b / 255 * 100 + 0.5)))

        Cmd(string.format('Store Preset %d.%d /Merge /NoConfirm', PRESET_TYPE, item.no))
        Cmd(string.format('Label Preset %d.%d "%s"', PRESET_TYPE, item.no, item.name))
        Cmd(string.format('Appearance Preset %d.%d /R=%d /G=%d /B=%d',
            PRESET_TYPE, item.no, item.r, item.g, item.b))
    end

    -- 5) Cree le Layout et y place tous les presets --------------------
    Cmd(string.format('Store Layout %d "Color Picker" /NoConfirm', layoutNo))
    Cmd(string.format('Label Layout %d "Color Picker"', layoutNo))
    local placed, failed = fillLayout(layoutNo, PRESET_TYPE, palette)

    -- 6) Nettoyage du programmer ---------------------------------------
    Cmd("ClearAll")

    -- 7) Compte rendu ---------------------------------------------------
    local msg = string.format(
        "Termine !\n\n"
     .. "Presets couleur crees : %d (Preset %d.%d -> %d.%d)\n"
     .. "Grille : %d colonnes x %d lignes\n"
     .. "Layout %d : %d boutons places%s",
        #palette, PRESET_TYPE, startId, PRESET_TYPE, startId + #palette - 1,
        hues, totalRows, layoutNo, placed,
        (failed > 0)
            and string.format("\nATTENTION : %d non places (placez-les a la main si besoin).", failed)
            or "")

    MessageBox({
        title    = "Color Picker",
        message  = msg,
        commands = { { value = 1, name = "OK" } },
    })

    Printf("[ColorPicker] %d presets, layout %d (%d places, %d erreurs).",
        #palette, layoutNo, placed, failed)
end

return main
