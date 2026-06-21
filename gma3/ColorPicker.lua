-- =====================================================================
--  Color Board  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Construit une TABLE DE COULEURS dans un Layout, pensee pour PEINDRE
--  des tableaux (looks) plutot que mettre une seule couleur partout :
--
--    [ Groupes ]  -> tes groupes de machines (selectionne le groupe).
--    [ Machines ] -> (option) fixtures une a une (selection par machine).
--    [ Couleurs ] -> une palette resserree de couleurs PRINCIPALES.
--    [ Outils ]   -> Clear / All / Highlight / Full.
--
--  Workflow : tape un Groupe (ou une Machine, ou All) puis une Couleur,
--  passe au groupe suivant, etc. -> tu construis un tableau multicolore
--  dans le programmer, que tu stores ensuite en cue / preset.
--
--  Les couleurs sont des presets UNIVERSELS : generiques, non liees a une
--  machine -> s'appliquent a n'importe quelle selection (RGB, RGBW, CMY).
--
--  Securite : avant d'ecrire, verifie si la plage de presets / macros est
--  occupee. Si oui -> demande avant d'ecraser et regenerer a neuf.
--
--  NB : apres avoir edite ce fichier, taper "ReloadAllPlugins" (RP) dans
--  la ligne de commande MA3 -- la console ne recharge pas le Lua tout seul.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Palette de couleurs PRINCIPALES (les N premieres sont utilisees).
--  L'ordre met le blanc en 10e pour qu'un reglage "10 couleurs" l'inclue.
-- ---------------------------------------------------------------------
local COLORS = {
    { name = "Red",     r = 255, g =   0, b =   0 },
    { name = "Orange",  r = 255, g =  90, b =   0 },
    { name = "Yellow",  r = 255, g = 225, b =   0 },
    { name = "Green",   r =   0, g = 200, b =  40 },
    { name = "Cyan",    r =   0, g = 200, b = 200 },
    { name = "Blue",    r =   0, g =  40, b = 255 },
    { name = "Violet",  r = 120, g =   0, b = 255 },
    { name = "Magenta", r = 255, g =   0, b = 200 },
    { name = "Pink",    r = 255, g =  90, b = 150 },
    { name = "White",   r = 255, g = 255, b = 255 },
    { name = "Amber",   r = 255, g = 150, b =   0 },
    { name = "Warm",    r = 255, g = 170, b =  90 },
}

-- Macros utilitaires (selection + programmer).
local BUTTONS = {
    { name = "Clear",     r =  60, g =  60, b =  70, lines = { "ClearAll" } },
    { name = "All",       r =  40, g = 110, b = 180, lines = { "Fixture Thru" } },
    { name = "Highlight", r = 255, g = 110, b =   0, lines = { "Highlight On" } },
    { name = "Full",      r = 255, g = 200, b =  40, lines = { "Full" } },
}

local function toNum(value, default, min, max)
    local n = tonumber(value) or default
    if min and n < min then n = min end
    if max and n > max then n = max end
    return math.floor(n)
end

-- Parse "1 Thru 8", "1 + 3 + 5", ou un melange "1 Thru 4 + 9".
local function parseRange(str)
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

-- Un objet existe-t-il et contient-il quelque chose ? (used, ok)
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

-- Detecte automatiquement les groupes existants (1..maxNo).
local function scanGroups(maxNo)
    local ids = {}
    for no = 1, maxNo do
        local used = objectUsed("Group " .. no)
        if used then ids[#ids + 1] = no end
    end
    return (#ids > 0) and ids or nil
end

-- ---------------------------------------------------------------------
--  Placement des elements dans le layout.
--  Pattern eprouve : handle du layout recupere UNE fois, puis apres chaque
--  "Assign ... At Layout" on prend le dernier enfant (layout[#layout]) et
--  on regle position/taille. Coordonnees en CASES, multipliees par le pas
--  (pitch) = taille native d'une case, MESUREE sur le 1er element -> grille
--  visible quelle que soit l'unite interne du layout.
--  Coordonnees forcees >= 0 (une valeur negative deborde en unsigned).
-- ---------------------------------------------------------------------
local function fillLayout(layoutNo, elements)
    local placed, failed = 0, 0

    local layout
    pcall(function() layout = DataPool().Layouts[layoutNo] end)
    if layout == nil then
        return 0, #elements,
            string.format("DataPool().Layouts[%d] = nil (layout introuvable)", layoutNo)
    end

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

    local pitchX, pitchY = 32, 32   -- repli si la mesure echoue

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
        pcall(function()
            elem:Set("PositionX",  px)
            elem:Set("PositionY",  py)
            elem:Set("DimensionW", pw)
            elem:Set("DimensionH", ph)
        end)
        return ok
    end

    local diag = { start = liveCount() }

    for idx, e in ipairs(elements) do
        Cmd(string.format("Assign %s At Layout %d", e.object, layoutNo))
        local after = liveCount()

        local elem
        pcall(function() elem = layout[after] end)

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
    end

    diag.native = diag.native or "(aucun element)"
    diag.pitch  = diag.pitch  or string.format("%dx%d", pitchX, pitchY)
    local diagStr = string.format(
        "start=%s after1=%s | native %s -> pitch %s",
        tostring(diag.start), tostring(diag.after1), diag.native, diag.pitch)
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
    local PT = 4   -- pool de presets Color

    local cfg = MessageBox({
        title    = "Color Board",
        message  = "Genere une table de couleurs (groupes + machines + palette)\n"
                .. "pour peindre des tableaux. Couleurs = presets UNIVERSELS.",
        commands = {
            { value = 1, name = "Generer" },
            { value = 0, name = "Annuler" },
        },
        inputs = {
            { name = "Groupes (ex: 1 Thru 8 / vide = auto)", value = "" },
            { name = "Machines (par fixture, optionnel)",     value = "" },
            { name = "Nb couleurs (max 12)",                  value = "10" },
            { name = "Preset depart (ID)",                    value = "1"  },
            { name = "Layout (No)",                           value = "1"  },
            { name = "Universel (1/0)",                        value = "1"  },
            { name = "Boutons utilitaires (1/0)",             value = "1"  },
            { name = "Macro depart (ID)",                     value = "1"  },
        },
    })
    if not cfg or cfg.result ~= 1 then return end

    local grpStr    = cfg.inputs["Groupes (ex: 1 Thru 8 / vide = auto)"]
    local fixStr    = cfg.inputs["Machines (par fixture, optionnel)"]
    local nColors   = toNum(cfg.inputs["Nb couleurs (max 12)"], 10, 1, #COLORS)
    local startId   = toNum(cfg.inputs["Preset depart (ID)"], 1, 1, 100000)
    local layNo     = toNum(cfg.inputs["Layout (No)"], 1, 1, 100000)
    local universal = toNum(cfg.inputs["Universel (1/0)"], 1, 0, 1) == 1
    local utilities = toNum(cfg.inputs["Boutons utilitaires (1/0)"], 1, 0, 1) == 1
    local macStart  = toNum(cfg.inputs["Macro depart (ID)"], 1, 1, 100000)

    -- Couleurs retenues (les N premieres de la palette).
    local colors = {}
    for i = 1, nColors do colors[i] = COLORS[i] end

    -- Groupes : explicites, sinon auto-detection.
    local groupIds = parseRange(grpStr) or scanGroups(100)
    local fixIds   = parseRange(fixStr)

    local nPresets = nColors
    local endId    = startId + nPresets - 1
    local macEnd   = macStart + (utilities and #BUTTONS - 1 or -1)

    -- Verification occupation des plages.
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
            title    = "Color Board",
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

    -- Selection scratch pour ecrire les couleurs.
    Cmd("ClearAll")
    Cmd("Fixture Thru")
    local selCount, hasSelApi = 0, false
    pcall(function() selCount = SelectionCount(); hasSelApi = true end)
    if hasSelApi and selCount == 0 then
        MessageBox({
            title = "Color Board",
            message = "Aucune fixture disponible.\nPatche au moins un projecteur RGB.",
            commands = { { value = 1, name = "OK" } },
        })
        return
    end

    -- Creation des presets de couleur universels.
    local uniOpt = universal and " /Universal" or ""
    local id = startId
    for _, c in ipairs(colors) do
        c.no = id
        Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(c.r / 255 * 100 + 0.5)))
        Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(c.g / 255 * 100 + 0.5)))
        Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(c.b / 255 * 100 + 0.5)))
        Cmd(string.format('Store Preset %d.%d /Merge /NoConfirm%s', PT, c.no, uniOpt))
        Cmd(string.format('Label Preset %d.%d "%s"', PT, c.no, c.name))
        Cmd(string.format('Appearance Preset %d.%d /R=%d /G=%d /B=%d', PT, c.no, c.r, c.g, c.b))
        id = id + 1
    end

    -- Creation des macros utilitaires.
    local macList = {}
    if utilities then
        for i, btn in ipairs(BUTTONS) do
            local no = macStart + i - 1
            makeMacro(no, btn)
            macList[#macList + 1] = { no = no }
        end
    end

    -- Layout frais.
    Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Board"', layNo))
    Cmd(string.format('Appearance Layout %d /R=18 /G=22 /B=30', layNo))

    -- Largeur de grille commune (alignement des sections).
    local gridW = nColors
    if groupIds then gridW = math.max(gridW, #groupIds) end
    gridW = math.min(math.max(gridW, 4), 24)

    -- Construction des elements, section par section, de haut en bas.
    local elements = {}
    local y = 0
    local function addSection(objs)
        if not objs or #objs == 0 then return end
        for i, o in ipairs(objs) do
            local col = (i - 1) % gridW
            local row = math.floor((i - 1) / gridW)
            elements[#elements + 1] = { object = o, x = col, y = y + row, w = 1, h = 1 }
        end
        y = y + math.ceil(#objs / gridW) + 1   -- +1 = ligne vide entre sections
    end

    -- Groupes (selection par groupe de machines).
    if groupIds then
        local objs = {}
        for _, gid in ipairs(groupIds) do objs[#objs + 1] = "Group " .. gid end
        addSection(objs)
    end

    -- Machines (selection par fixture, optionnel).
    if fixIds then
        local objs = {}
        for _, fid in ipairs(fixIds) do objs[#objs + 1] = "Fixture " .. fid end
        addSection(objs)
    end

    -- Palette de couleurs.
    do
        local objs = {}
        for _, c in ipairs(colors) do objs[#objs + 1] = string.format("Preset %d.%d", PT, c.no) end
        addSection(objs)
    end

    -- Outils.
    if utilities and #macList > 0 then
        local objs = {}
        for _, m in ipairs(macList) do objs[#objs + 1] = "Macro " .. m.no end
        addSection(objs)
    end

    local placed, failed, diagStr = fillLayout(layNo, elements)
    local _ = diagStr   -- detail complet dans la Command Line History

    Cmd("ClearAll")

    local note = ""
    if failed > 0 then
        note = string.format(
            "\n\n(%d case(s) non placee(s) — voir [CP-diag] dans la"
         .. " Command Line History)", failed)
    end

    local msg = string.format(
        "Color Board pret !\n\n"
     .. "Groupes : %d   Machines : %d\n"
     .. "Couleurs %s : %d  (Preset %d.%d -> %d.%d)\n"
     .. "Outils : %d macros\n"
     .. "Layout %d : %d/%d cases placees%s\n\n"
     .. "Workflow : tape un Groupe (ou une Machine, ou All)\n"
     .. "puis une Couleur. Repete pour peindre ton tableau,\n"
     .. "puis store le programmer en cue / preset.",
        groupIds and #groupIds or 0,
        fixIds and #fixIds or 0,
        universal and "UNIVERSELLES" or "generiques",
        nColors, PT, startId, PT, endId,
        #macList, layNo, placed, placed + failed, note)

    MessageBox({
        title = "Color Board",
        message = msg,
        commands = { { value = 1, name = "Super !" } },
    })
    Printf("[ColorBoard] %d couleurs, %d groupes, %d macros, layout %d : %d/%d places.",
        nColors, groupIds and #groupIds or 0, #macList, layNo, placed, placed + failed)
end

return main
