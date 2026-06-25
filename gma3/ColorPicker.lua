-- =====================================================================
--  Color Picker LIVE  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Un color picker SOIGNE pour le LIVE :
--    - chaque LIGNE = une cible (All, un groupe, ou une machine). La case
--      de gauche montre la machine (icone / faisceau + couleur en direct).
--    - chaque COLONNE = une couleur, affichee comme une vraie PASTILLE
--      COLOREE (appearance de fond, sans icone de macro).
--    - taper une pastille -> la cible passe a cette couleur EN RESTITUTION
--      (playback / LTP), avec un fondu, SANS toucher au programmer.
--    - case de droite = Off de la ligne. En bas : Off All / Highlight / Full.
--
--  Technique (d'apres imhofroger/GMA3_LUA - CreateColorLayout) :
--    - "Store Appearance n ... color=..." cree une pastille coloree.
--    - "Set Layout L.E Appearance=a Positionx=.. Objectname=0 bar=0" colore
--      la case, cache l'icone/nom, et la positionne (coords en centaines).
--    - declenchement live : "Goto Sequence s Cue c Fade t" (les sequences
--      se jouent sans executor).
--
--  NB : apres avoir edite ce fichier -> "ReloadAllPlugins" (RP) en ligne
--  de commande, sinon MA3 garde l'ancienne version en cache.
-- =====================================================================

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

local CELL  = 100   -- taille d'une case (unites de layout, ~centaines)
local PITCH = 120   -- pas entre cases (case + ecart)

local function toNum(value, default, min, max)
    local n = tonumber(value) or default
    if min and n < min then n = min end
    if max and n > max then n = max end
    return n
end

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

-- Existe (avec ou sans enfants) ? Pour les fixtures (pas d'enfants).
local function objectExists(addr)
    local exists = false
    pcall(function()
        local h = ObjectList(addr)[1]
        if h then exists = true end
    end)
    return exists
end

local function scanGroups(maxNo)
    local ids = {}
    for no = 1, maxNo do
        if objectUsed("Group " .. no) then ids[#ids + 1] = no end
    end
    return (#ids > 0) and ids or nil
end

local function scanFixtures(maxNo, cap)
    local ids = {}
    for no = 1, maxNo do
        if objectExists("Fixture " .. no) then
            ids[#ids + 1] = no
            if #ids >= cap then break end
        end
    end
    return (#ids > 0) and ids or nil
end

-- Cree une appearance de fond colore (pastille).
local function makeAppearance(no, name, r, g, b)
    Cmd(string.format('Store Appearance %d /NoConfirm', no))
    Cmd(string.format('Label Appearance %d "%s"', no, name))
    pcall(function()
        local a = ObjectList("Appearance " .. no)[1]
        if a then
            a:Set("BackR", r); a:Set("BackG", g); a:Set("BackB", b); a:Set("BackAlpha", 255)
        end
    end)
    -- Filet de securite (forme commande, façon imhofroger).
    pcall(function()
        Cmd(string.format('Set Appearance %d Property "BackR" "%d"', no, r))
        Cmd(string.format('Set Appearance %d Property "BackG" "%d"', no, g))
        Cmd(string.format('Set Appearance %d Property "BackB" "%d"', no, b))
    end)
end

local function makeMacro(no, name, lines)
    Cmd(string.format('Store Macro %d /NoConfirm', no))
    Cmd(string.format('Label Macro %d "%s"', no, name))
    pcall(function()
        local m = ObjectList("Macro " .. no)[1]
        if m then
            for _, cmd in ipairs(lines) do
                local ml = m:Append()
                ml:Set("Command", cmd)
            end
        end
    end)
end

local function main(display_handle)
    local cfg = MessageBox({
        title    = "Color Picker LIVE",
        message  = "Picker couleur soigne pour le LIVE : une ligne par machine/groupe,\n"
                .. "des pastilles colorees -> couleur en restitution (fondu, sans programmer).",
        commands = {
            { value = 1, name = "Generer" },
            { value = 0, name = "Annuler" },
        },
        inputs = {
            { name = "Groupes (ex: 1 Thru 8 / vide = auto)",       value = "" },
            { name = "Machines (fixtures, si pas de groupe)",       value = "" },
            { name = "Nb couleurs (max 12)",                        value = "10" },
            { name = "Fade couleur (s)",                            value = "1"  },
            { name = "Fade arret (s)",                              value = "2"  },
            { name = "Sequence depart (ID)",                        value = "1"  },
            { name = "Macro depart (ID)",                           value = "1"  },
            { name = "Appearance depart (ID)",                      value = "1"  },
            { name = "Layout (No)",                                 value = "1"  },
        },
    })
    if not cfg or cfg.result ~= 1 then return end

    local grpStr    = cfg.inputs["Groupes (ex: 1 Thru 8 / vide = auto)"]
    local fixStr    = cfg.inputs["Machines (fixtures, si pas de groupe)"]
    local nColors   = math.floor(toNum(cfg.inputs["Nb couleurs (max 12)"], 10, 1, #COLORS))
    local colorFade = toNum(cfg.inputs["Fade couleur (s)"], 1, 0, 600)
    local offFade   = toNum(cfg.inputs["Fade arret (s)"], 2, 0, 600)
    local seqStart  = math.floor(toNum(cfg.inputs["Sequence depart (ID)"], 1, 1, 100000))
    local macStart  = math.floor(toNum(cfg.inputs["Macro depart (ID)"], 1, 1, 100000))
    local appStart  = math.floor(toNum(cfg.inputs["Appearance depart (ID)"], 1, 1, 100000))
    local layNo     = math.floor(toNum(cfg.inputs["Layout (No)"], 1, 1, 100000))

    local colors = {}
    for i = 1, nColors do colors[i] = COLORS[i] end

    -- Au moins une fixture ?
    Cmd("ClearAll"); Cmd("Fixture Thru")
    local selCount, hasSelApi = 0, false
    pcall(function() selCount = SelectionCount(); hasSelApi = true end)
    Cmd("ClearAll")
    if hasSelApi and selCount == 0 then
        MessageBox({ title = "Color Picker LIVE",
            message = "Aucune fixture disponible.\nPatche au moins un projecteur RGB.",
            commands = { { value = 1, name = "OK" } } })
        return
    end

    -- Cibles : All + (groupes si presents, sinon machines une a une).
    local targets = { { label = "ALL", sel = "Fixture Thru", header = nil, isFix = false } }
    local groupIds = parseRange(grpStr) or scanGroups(100)
    if groupIds then
        for _, gid in ipairs(groupIds) do
            targets[#targets + 1] = { label = "G" .. gid, sel = "Group " .. gid,
                header = "Group " .. gid, isFix = false }
        end
    else
        local fixIds = parseRange(fixStr) or scanFixtures(96, 12)
        if fixIds then
            for _, fid in ipairs(fixIds) do
                targets[#targets + 1] = { label = "Fix " .. fid, sel = "Fixture " .. fid,
                    header = "Fixture " .. fid, isFix = true }
            end
        end
    end
    local nTargets = #targets

    -- Numerotation.
    local seqEnd     = seqStart + nTargets - 1
    local appColor0  = appStart                    -- appStart..appStart+nColors-1 : couleurs
    local appDark    = appStart + nColors          -- 1 appearance sombre (Off / ALL)
    local appEnd     = appDark
    local perTarget  = nColors + 1                 -- N couleurs + 1 Off
    local utilBase   = macStart + nTargets * perTarget
    local macAllHdr  = utilBase                    -- etiquette "ALL"
    local macOffAll  = utilBase + 1
    local macHi      = utilBase + 2
    local macFull    = utilBase + 3
    local macEnd     = macFull

    -- Verification occupation.
    local occupied, detectOk = false, true
    local function check(fmt, a, b)
        for no = a, b do
            local used, ok = objectUsed(string.format(fmt, no))
            if not ok then detectOk = false; return end
            if used then occupied = true; return end
        end
    end
    check("Sequence %d", seqStart, seqEnd)
    if detectOk and not occupied then check("Macro %d", macStart, macEnd) end
    if detectOk and not occupied then check("Appearance %d", appStart, appEnd) end

    if occupied or not detectOk then
        local confirm = MessageBox({ title = "Color Picker LIVE",
            message = string.format(
                "Des objets existent peut-etre ici :\n"
             .. "Sequence %d -> %d\nMacro %d -> %d\nAppearance %d -> %d\n"
             .. "(et le Layout %d sera (re)cree).\n\nTout ecraser et regenerer ?",
                seqStart, seqEnd, macStart, macEnd, appStart, appEnd, layNo),
            commands = { { value = 1, name = "Ecraser" }, { value = 0, name = "Annuler" } } })
        if not confirm or confirm.result ~= 1 then return end
        Cmd(string.format('Delete Sequence %d Thru %d /NoConfirm', seqStart, seqEnd))
        Cmd(string.format('Delete Macro %d Thru %d /NoConfirm', macStart, macEnd))
        Cmd(string.format('Delete Appearance %d Thru %d /NoConfirm', appStart, appEnd))
        Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    end

    -- 1) Appearances : une par couleur + une sombre.
    for i, c in ipairs(colors) do
        makeAppearance(appColor0 + i - 1, c.name, c.r, c.g, c.b)
    end
    makeAppearance(appDark, "Dark", 40, 40, 48)

    -- 2) Sequences : une par cible, une cue par couleur (couleur en direct).
    for ti, t in ipairs(targets) do
        local seqNo = seqStart + ti - 1
        for ci, c in ipairs(colors) do
            Cmd("ClearAll")
            Cmd(t.sel)
            Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(c.r / 255 * 100 + 0.5)))
            Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(c.g / 255 * 100 + 0.5)))
            Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(c.b / 255 * 100 + 0.5)))
            Cmd(string.format('Store Sequence %d Cue %d /NoConfirm', seqNo, ci))
            Cmd(string.format('Label Sequence %d Cue %d "%s"', seqNo, ci, c.name))
        end
        Cmd(string.format('Label Sequence %d "%s"', seqNo, t.label))
        pcall(function()
            local s = ObjectList("Sequence " .. seqNo)[1]
            if s then
                s:Set("OffWhenOverridden", "Yes")
                s:Set("OffFade", tostring(offFade))
            end
        end)
    end
    Cmd("ClearAll")

    -- 3) Macros : couleurs (Goto) + Off par ligne + outils + etiquette ALL.
    for ti, t in ipairs(targets) do
        local seqNo = seqStart + ti - 1
        local base  = macStart + (ti - 1) * perTarget
        makeMacro(base, "Off", { string.format("Off Sequence %d", seqNo) })
        for ci, c in ipairs(colors) do
            makeMacro(base + ci, c.name,
                { string.format("Goto Sequence %d Cue %d Fade %s", seqNo, ci, tostring(colorFade)) })
        end
    end
    makeMacro(macAllHdr, "ALL", {})
    makeMacro(macOffAll, "Off All", { string.format("Off Sequence %d Thru %d", seqStart, seqEnd) })
    makeMacro(macHi,     "Highlight", { "Highlight On" })
    makeMacro(macFull,   "Full", { "Full" })

    -- 4) Layout : creation + placement via "Set Layout L.E ...".
    Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Picker LIVE"', layNo))
    Cmd(string.format('Appearance Layout %d /R=16 /G=18 /B=24', layNo))

    local E = 0
    local function addElement(object, col, row, appNo, showName, showBar)
        Cmd(string.format("Assign %s At Layout %d", object, layNo))
        E = E + 1
        local x = math.floor(col * PITCH)
        local y = math.floor(row * PITCH)
        local cmd = string.format("Set Layout %d.%d Positionx=%d Positiony=%d Positionw=%d Positionh=%d Objectname=%d Bar=%d",
            layNo, E, x, y, CELL, CELL, showName and 1 or 0, showBar and 1 or 0)
        if appNo then cmd = cmd .. " Appearance=" .. appNo end
        Cmd(cmd)
    end

    local colorCol0 = 1               -- colonne de la 1ere couleur
    local offCol    = nColors + 1     -- colonne du Off
    for ti, t in ipairs(targets) do
        local row  = ti - 1
        local base = macStart + (ti - 1) * perTarget
        -- Header (machine / groupe / ALL).
        if t.header then
            addElement(t.header, 0, row, nil, true, t.isFix)        -- objet reel : icone + couleur live
        else
            addElement("Macro " .. macAllHdr, 0, row, appDark, true, false)
        end
        -- Pastilles couleur.
        for ci = 1, nColors do
            addElement("Macro " .. (base + ci), colorCol0 + ci - 1, row, appColor0 + ci - 1, false, false)
        end
        -- Off de la ligne.
        addElement("Macro " .. base, offCol, row, appDark, true, false)
    end

    -- Outils sous la matrice.
    local uy = nTargets
    addElement("Macro " .. macOffAll, 0, uy, appDark, true, false)
    addElement("Macro " .. macHi,     1, uy, appDark, true, false)
    addElement("Macro " .. macFull,   2, uy, appDark, true, false)

    Cmd("ClearAll")

    local msg = string.format(
        "Color Picker LIVE pret !\n\n"
     .. "Lignes : %d (ALL + %s)\n"
     .. "Couleurs : %d   Fade : %ss / arret %ss\n"
     .. "Sequences %d-%d, Macros %d-%d, Appearances %d-%d\n"
     .. "Layout %d : %d cases.\n\n"
     .. "EN LIVE : tape une pastille -> la machine/groupe passe a la couleur\n"
     .. "en restitution (fondu, sans programmer). Case de droite = Off.\n"
     .. "Pense a avoir de l'intensite (Full) pour voir la couleur.",
        nTargets, (groupIds and "groupes" or "machines"),
        nColors, tostring(colorFade), tostring(offFade),
        seqStart, seqEnd, macStart, macEnd, appStart, appEnd,
        layNo, E)

    MessageBox({ title = "Color Picker LIVE", message = msg,
        commands = { { value = 1, name = "Super !" } } })
    Printf("[ColorPickerLive] %d lignes, %d couleurs, %d cases placees.", nTargets, nColors, E)
end

return main
