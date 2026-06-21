-- =====================================================================
--  Color Picker  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Construit un color picker complet et soigne dans un Layout :
--
--    [ Spots ]    -> (optionnel) les fixtures choisies, couleur LIVE.
--    [ Nuancier ] -> grille tints / pure / shades par teinte.
--    [ Gris ]     -> rampe blanc -> noir.
--    [ Boutons ]  -> (optionnel) macros utilitaires : Clear / White /
--                    Full / Highlight, posees sous le nuancier.
--
--  Presets stockes en UNIVERSEL : couleur generique, non liee a une
--  machine -> s'applique a n'importe quelle selection (RGB, RGBW, CMY).
--  Ideal pour un workflow "recipe" : tes cues = Groupe x Preset couleur.
--
--  Securite : avant d'ecrire, verifie si la plage de presets (et de
--  macros) est occupee. Si oui -> demande avant d'ecraser/regenerer.
-- =====================================================================

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

local NAMES = {
    [0]="Red", [30]="Orange", [60]="Yellow", [90]="Lime",
    [120]="Green", [150]="Mint", [180]="Cyan", [210]="Azure",
    [240]="Blue", [270]="Violet", [300]="Magenta", [330]="Pink",
}
local function hueName(h)
    local best, bestKey = 1e9, 0
    for key, _ in pairs(NAMES) do
        local d = math.min(math.abs(h - key), 360 - math.abs(h - key))
        if d < best then best, bestKey = d, key end
    end
    return NAMES[bestKey]
end

local function toNum(value, default, min, max)
    local n = tonumber(value) or default
    if min and n < min then n = min end
    if max and n > max then n = max end
    return math.floor(n)
end

local function parseFixtures(str)
    if not str or str:match("^%s*$") then return nil end
    local ids = {}
    for raw in (str .. "+"):gmatch("([^+]+)") do
        local token = raw:gsub("^%s+", ""):gsub("%s+$", "")
        local a, b = token:lower():match("^(%d+)%s*thru%s*(%d+)$")
        if a then
            for i = tonumber(a), tonumber(b) do ids[#ids + 1] = i end
        else
            local n = token:match("^(%d+)$")
            if n then ids[#ids + 1] = tonumber(n) end
        end
    end
    return (#ids > 0) and ids or nil
end

local function objectUsed(addr)
    local used, ok = false, false
    ok = pcall(function()
        local h = ObjectList(addr)[1]
        if h then
            local ch = h:Children()
            if ch and #ch > 0 then used = true end
        end
    end)
    return used, ok
end

local BUTTONS = {
    { name = "Clear",     r =  70, g =  70, b =  80, lines = { "ClearAll" } },
    { name = "White",     r = 255, g = 255, b = 255, lines = {
        'Attribute "ColorRGB_R" At 100',
        'Attribute "ColorRGB_G" At 100',
        'Attribute "ColorRGB_B" At 100' } },
    { name = "Full",      r = 255, g = 200, b =  40, lines = { "Full" } },
    { name = "Highlight", r = 255, g = 110, b =   0, lines = { "Highlight On" } },
}

local function buildPalette(hues, levels)
    local sw = {}
    local mid = math.floor((levels - 1) / 2)
    for c = 0, hues - 1 do
        local hue  = (c / hues) * 360
        local name = hueName(hue)
        for r = 0, levels - 1 do
            local s, v, suffix
            if r == mid then
                s, v, suffix = 1.0, 1.0, ""
            elseif r < mid then
                local t = (mid - r) / mid
                s, v   = 1 - t * 0.85, 1.0
                suffix = string.rep("+", mid - r)
            else
                local d = (r - mid) / (levels - 1 - mid)
                s, v   = 1.0, 1 - d * 0.80
                suffix = string.rep("-", r - mid)
            end
            local red, green, blue = hsv2rgb(hue, s, v)
            sw[#sw + 1] = {
                name = name .. suffix,
                r = red, g = green, b = blue, col = c, level = r,
            }
        end
    end
    return sw
end

local function buildGreys(hues)
    local g = {}
    for c = 0, hues - 1 do
        local v = 1 - (c / math.max(hues - 1, 1))
        local lvl = math.floor(v * 255 + 0.5)
        local name
        if     c == 0        then name = "White"
        elseif c == hues - 1 then name = "Black"
        else                      name = string.format("Grey %d", math.floor(v * 100)) end
        g[#g + 1] = { name = name, r = lvl, g = lvl, b = lvl, col = c }
    end
    return g
end

-- Place les elements dans le layout.
-- Pattern eprouve (gabe927/gma3-subfixture-layout) : on recupere le handle
-- du layout UNE SEULE FOIS, on le reutilise, et apres chaque "Assign ... At
-- Layout" on prend le DERNIER enfant (layout[#layout]) pour regler sa
-- position. Re-fetcher DataPool().Layouts[n] a chaque tour renvoie un handle
-- temporaire dont le compteur live (#) peut etre faux -> elements empiles.
--
-- Proprietes confirmees :
--   acces direct lowercase  : posx / posy / positionw / positionh
--   noms officiels (Set)    : PositionX / PositionY / DimensionW / DimensionH
local function fillLayout(layoutNo, elements)
    local placed, failed = 0, 0

    -- 1) Handle du layout, recupere une fois.
    local layout
    pcall(function() layout = DataPool().Layouts[layoutNo] end)
    if layout == nil then
        return 0, #elements,
            string.format("DataPool().Layouts[%d] = nil (layout introuvable)", layoutNo)
    end

    -- Compteur d'elements vivant.
    local function liveCount()
        local n = 0
        if not pcall(function() n = #layout end) then n = 0 end
        return n or 0
    end

    local function rdnum(elem, prop)
        local v
        pcall(function() v = tonumber(elem[prop]) end)
        return v
    end

    -- Echelle (pitch) d'une case = taille native d'un element fraichement
    -- assigne, MESUREE sur le 1er element. On tuile la grille a cette echelle
    -- -> visible quelle que soit l'unite interne du layout. 32 = repli si la
    -- mesure echoue (les coords de layout sont en centaines, pas en 0..11).
    local pitchX, pitchY = 32, 32

    -- Regle position + taille (coords en CASES, multipliees par le pitch).
    -- Coordonnees forcees >= 0 : une valeur negative deborderait en unsigned
    -- (-5 -> 65531) et enverrait la case hors champ.
    local function place(elem, e)
        local px = math.max(0, math.floor((e.x or 0) * pitchX))
        local py = math.max(0, math.floor((e.y or 0) * pitchY))
        local pw = math.max(1, math.floor((e.w or 1) * pitchX))
        local ph = math.max(1, math.floor((e.h or 1) * pitchY))
        local ok = pcall(function()
            elem.posx      = px
            elem.posy      = py
            elem.positionw = pw
            elem.positionh = ph
        end)
        -- Filet de securite : noms officiels via Set (ignore si absent).
        pcall(function()
            elem:Set("PositionX",  px)
            elem:Set("PositionY",  py)
            elem:Set("DimensionW", pw)
            elem:Set("DimensionH", ph)
        end)
        return ok
    end

    -- 2) Diagnostic terrain (montre dans le bilan + Command Line History).
    local diag = { start = liveCount() }

    for idx, e in ipairs(elements) do
        Cmd(string.format("Assign %s At Layout %d", e.object, layoutNo))
        local after = liveCount()

        local elem
        pcall(function() elem = layout[after] end)

        -- 1er element : mesure la taille native -> fixe le pitch de la grille.
        if idx == 1 and elem ~= nil then
            local w0 = rdnum(elem, "positionw")
            local h0 = rdnum(elem, "positionh")
            if w0 and w0 >= 2 and w0 <= 5000 then pitchX = math.floor(w0) end
            if h0 and h0 >= 2 and h0 <= 5000 then pitchY = math.floor(h0) end
            diag.after1 = after
            diag.native = string.format("w0=%s h0=%s", tostring(w0), tostring(h0))
            diag.pitch  = string.format("%dx%d", pitchX, pitchY)
        end

        local ok = false
        if elem ~= nil then ok = place(elem, e) end
        if ok then placed = placed + 1 else failed = failed + 1 end

        if idx == 1 and elem ~= nil then
            diag.sample = string.format("x=%s y=%s w=%s h=%s",
                tostring(rdnum(elem,"posx")), tostring(rdnum(elem,"posy")),
                tostring(rdnum(elem,"positionw")), tostring(rdnum(elem,"positionh")))
        end
    end

    diag.native = diag.native or "(aucun element)"
    diag.pitch  = diag.pitch  or string.format("%dx%d", pitchX, pitchY)
    diag.sample = diag.sample or "-"

    local diagStr = string.format(
        "start=%s after1=%s | native %s -> pitch %s | elem1: %s",
        tostring(diag.start), tostring(diag.after1),
        diag.native, diag.pitch, diag.sample)
    Printf("[CP-diag] %s", diagStr)

    return placed, failed, diagStr
end

local function makeMacro(no, btn)
    Cmd(string.format('Store Macro %d /NoConfirm', no))
    Cmd(string.format('Label Macro %d "%s"', no, btn.name))
    Cmd(string.format('Appearance Macro %d /R=%d /G=%d /B=%d', no, btn.r, btn.g, btn.b))
    pcall(function()
        local m = ObjectList("Macro " .. no)[1]
        for _, cmd in ipairs(btn.lines) do
            local ml = m:Append()
            ml:Set("Command", cmd)
        end
    end)
end

local function main(display_handle)
    local PT = 4

    local cfg = MessageBox({
        title    = "Color Picker",
        message  = "Genere des presets couleur UNIVERSELS + un Layout (spots, nuancier, boutons).",
        commands = {
            { value = 1, name = "Generer" },
            { value = 0, name = "Annuler" },
        },
        inputs = {
            { name = "Spots (optionnel, ex: 1 Thru 8)", value = "" },
            { name = "Teintes (colonnes)",              value = "12" },
            { name = "Niveaux par teinte",              value = "5"  },
            { name = "Preset depart (ID)",              value = "1"  },
            { name = "Layout (No)",                     value = "1"  },
            { name = "Universel (1/0)",                 value = "1"  },
            { name = "Boutons utilitaires (1/0)",       value = "1"  },
            { name = "Macro depart (ID)",               value = "1"  },
        },
    })
    if not cfg or cfg.result ~= 1 then return end

    local fixStr    = cfg.inputs["Spots (optionnel, ex: 1 Thru 8)"]
    local hues      = toNum(cfg.inputs["Teintes (colonnes)"], 12, 1, 36)
    local levels    = toNum(cfg.inputs["Niveaux par teinte"],  5, 1, 11)
    local startId   = toNum(cfg.inputs["Preset depart (ID)"],  1, 1, 100000)
    local layNo     = toNum(cfg.inputs["Layout (No)"],         1, 1, 100000)
    local universal = toNum(cfg.inputs["Universel (1/0)"],     1, 0, 1) == 1
    local utilities = toNum(cfg.inputs["Boutons utilitaires (1/0)"], 1, 0, 1) == 1
    local macStart  = toNum(cfg.inputs["Macro depart (ID)"],   1, 1, 100000)

    local swatches = buildPalette(hues, levels)
    local greys    = buildGreys(hues)
    local nPresets = #swatches + #greys
    local endId    = startId + nPresets - 1
    local macEnd   = macStart + (utilities and #BUTTONS - 1 or -1)

    -- Verification occupation des plages
    local occupied, detectOk = false, true
    for no = startId, endId do
        local used, ok = objectUsed(string.format("Preset %d.%d", PT, no))
        if not ok then detectOk = false; break end
        if used then occupied = true; break end
    end
    if utilities and detectOk and not occupied then
        for no = macStart, macEnd do
            local used, ok = objectUsed("Macro " .. no)
            if not ok then detectOk = false; break end
            if used then occupied = true; break end
        end
    end

    if occupied or not detectOk then
        local extra = utilities
            and string.format("\nMacros %d -> %d  (boutons utilitaires)", macStart, macEnd) or ""
        local confirm = MessageBox({
            title    = "Color Picker",
            message  = string.format(
                "Des objets existent peut-etre ici :\n"
             .. "Preset %d.%d -> %d.%d%s\n"
             .. "(et le Layout %d sera (re)cree).\n\n"
             .. "Tout ecraser et regenerer a neuf ?",
                PT, startId, PT, endId, extra, layNo),
            commands = {
                { value = 1, name = "Ecraser" },
                { value = 0, name = "Annuler" },
            },
        })
        if not confirm or confirm.result ~= 1 then return end
        Cmd(string.format('Delete Preset %d.%d Thru %d.%d /NoConfirm', PT, startId, PT, endId))
        Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
        if utilities then
            Cmd(string.format('Delete Macro %d Thru %d /NoConfirm', macStart, macEnd))
        end
    end

    -- Selection scratch pour ecrire les couleurs
    local fixIds = parseFixtures(fixStr)
    Cmd("ClearAll")
    if fixIds then
        Cmd("Fixture " .. fixStr)
    else
        Cmd("Fixture Thru")
    end

    local selCount, hasSelApi = 0, false
    pcall(function() selCount = SelectionCount(); hasSelApi = true end)
    if hasSelApi and selCount == 0 then
        MessageBox({
            title = "Color Picker",
            message = "Aucune fixture disponible.\nPatche au moins un projecteur RGB.",
            commands = { { value = 1, name = "OK" } },
        })
        return
    end

    -- Creation des presets universels
    local uniOpt = universal and " /Universal" or ""
    local id = startId
    local function makePreset(item)
        item.no = id
        Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(item.r / 255 * 100 + 0.5)))
        Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(item.g / 255 * 100 + 0.5)))
        Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(item.b / 255 * 100 + 0.5)))
        Cmd(string.format('Store Preset %d.%d /Merge /NoConfirm%s', PT, item.no, uniOpt))
        Cmd(string.format('Label Preset %d.%d "%s"', PT, item.no, item.name))
        Cmd(string.format('Appearance Preset %d.%d /R=%d /G=%d /B=%d', PT, item.no, item.r, item.g, item.b))
        id = id + 1
    end
    for _, s in ipairs(swatches) do makePreset(s) end
    for _, g in ipairs(greys)    do makePreset(g) end

    -- Creation des macros utilitaires
    local macList = {}
    if utilities then
        for i, btn in ipairs(BUTTONS) do
            local no = macStart + i - 1
            makeMacro(no, btn)
            macList[#macList + 1] = { no = no }
        end
    end

    -- Creation d'un layout frais (on repart toujours d'un layout vide)
    Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Picker"', layNo))
    Cmd(string.format('Appearance Layout %d /R=18 /G=22 /B=30', layNo))

    -- Calcul des lignes (Y augmente vers le bas)
    local fixRows = fixIds and math.ceil(#fixIds / hues) or 0
    local gridTop = fixRows + (fixRows > 0 and 1 or 0)
    local greyRow = gridTop + levels + 1
    local btnRow  = greyRow + 2
    local lastRow = (utilities and #macList > 0) and btnRow or greyRow

    -- IMPORTANT : les coordonnees de layout sont des entiers NON SIGNES.
    -- Une valeur negative deborde a ~65531 (65536 + x) et envoie la case
    -- hors champ. On pose donc tout depuis (0,0) vers le bas/la droite,
    -- coordonnees >= 0 uniquement. (lastRow non utilise pour le centrage.)
    local colOff = 0
    local rowOff = 0
    local _ = lastRow

    -- Construction de la liste des elements a placer
    local elements = {}

    -- Spots (en haut)
    if fixIds then
        for i, fid in ipairs(fixIds) do
            local col = (i - 1) % hues
            local row = math.floor((i - 1) / hues)
            elements[#elements + 1] = {
                object = "Fixture " .. fid,
                x = col + colOff, y = row + rowOff, w = 1, h = 1,
            }
        end
    end

    -- Nuancier
    for _, s in ipairs(swatches) do
        elements[#elements + 1] = {
            object = string.format("Preset %d.%d", PT, s.no),
            x = s.col + colOff, y = gridTop + s.level + rowOff, w = 1, h = 1,
        }
    end

    -- Rampe de gris
    for _, g in ipairs(greys) do
        elements[#elements + 1] = {
            object = string.format("Preset %d.%d", PT, g.no),
            x = g.col + colOff, y = greyRow + rowOff, w = 1, h = 1,
        }
    end

    -- Boutons utilitaires
    if utilities and #macList > 0 then
        local btnW = math.max(2, math.floor(hues / #macList))
        for i, m in ipairs(macList) do
            elements[#elements + 1] = {
                object = "Macro " .. m.no,
                x = (i - 1) * btnW + colOff, y = btnRow + rowOff, w = btnW, h = 1,
            }
        end
    end

    local placed, failed, diagStr = fillLayout(layNo, elements)

    Cmd("ClearAll")

    -- Ligne de diagnostic visible directement dans le bilan (a recopier si KO).
    local layoutNote = string.format("\n\n[diag] %s", tostring(diagStr))

    local msg = string.format(
        "Color Picker pret !\n\n"
     .. "Presets %s : %d  (Preset %d.%d -> %d.%d)\n"
     .. "Nuancier : %d teintes x %d niveaux + gris\n"
     .. "Boutons : %d macros\n"
     .. "Layout %d : %d/%d cases placees%s",
        universal and "UNIVERSELS" or "generiques",
        nPresets, PT, startId, PT, endId,
        hues, levels, #macList,
        layNo, placed, placed + failed,
        layoutNote)

    MessageBox({
        title = "Color Picker",
        message = msg,
        commands = { { value = 1, name = "Super !" } },
    })
    Printf("[ColorPicker] %d presets, %d macros, layout %d : %d/%d places.",
        nPresets, #macList, layNo, placed, placed + failed)
end

return main
