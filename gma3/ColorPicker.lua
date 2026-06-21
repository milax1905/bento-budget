-- =====================================================================
--  Color Picker LIVE  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Un color picker pour le LIVE : tu tapes une couleur, ton groupe passe
--  a cette couleur EN RESTITUTION (playback, LTP), avec un fondu, et SANS
--  jamais toucher au programmer. Concu pour busker des couleurs proprement.
--
--  Structure (peu d'objets) :
--    - N presets couleur UNIVERSELS (la palette).
--    - 1 SEQUENCE par cible (All + chaque groupe auto-detecte), avec une
--      cue par couleur. Les sequences se jouent sans executor.
--    - Une MATRICE de macros sur un Layout :
--          [Off Grp] [Red] [Orange] [Yellow] ... [White]   <- une ligne
--          par cible. Taper une pastille = Goto la cue couleur avec fondu.
--          Taper [Off Grp] = relache la couleur du groupe.
--    - Outils : Off All / Highlight / Full.
--
--  Tout est en commandes statiques (Goto Sequence X Cue Y Fade Z) : robuste,
--  pas de variable, pas de programmer.
--
--  NB : apres avoir edite ce fichier, taper "ReloadAllPlugins" (RP) dans la
--  ligne de commande MA3 -- la console ne recharge pas le Lua tout seul.
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

local function toNum(value, default, min, max)
    local n = tonumber(value) or default
    if min and n < min then n = min end
    if max and n > max then n = max end
    return n
end

-- Parse "1 Thru 8", "1 + 3 + 5", melanges "1 Thru 4 + 9".
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

local function scanGroups(maxNo)
    local ids = {}
    for no = 1, maxNo do
        local used = objectUsed("Group " .. no)
        if used then ids[#ids + 1] = no end
    end
    return (#ids > 0) and ids or nil
end

local function groupName(gid)
    local nm
    pcall(function()
        local h = ObjectList("Group " .. gid)[1]
        if h then nm = h:Get("Name") end
    end)
    if nm and tostring(nm) ~= "" then return tostring(nm) end
    return "G" .. gid
end

-- ---------------------------------------------------------------------
--  Placement layout : handle recupere UNE fois, pas de grille negative,
--  pas (pitch) = taille native mesuree sur le 1er element.
-- ---------------------------------------------------------------------
local function fillLayout(layoutNo, elements)
    local placed, failed = 0, 0

    local layout
    pcall(function() layout = DataPool().Layouts[layoutNo] end)
    if layout == nil then
        return 0, #elements,
            string.format("DataPool().Layouts[%d] = nil", layoutNo)
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

    local pitchX, pitchY = 32, 32

    local function place(elem, e)
        local px = math.max(0, math.floor((e.x or 0) * pitchX))
        local py = math.max(0, math.floor((e.y or 0) * pitchY))
        local pw = math.max(1, math.floor((e.w or 1) * pitchX))
        local ph = math.max(1, math.floor((e.h or 1) * pitchY))
        local ok = pcall(function()
            elem.posx = px; elem.posy = py
            elem.positionw = pw; elem.positionh = ph
        end)
        pcall(function()
            elem:Set("PositionX", px);  elem:Set("PositionY", py)
            elem:Set("DimensionW", pw); elem:Set("DimensionH", ph)
        end)
        return ok
    end

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
            Printf("[CP-diag] native w=%s h=%s -> pitch %dx%d",
                tostring(w0), tostring(h0), pitchX, pitchY)
        end

        local ok = false
        if elem ~= nil then ok = place(elem, e) end
        if ok then placed = placed + 1 else failed = failed + 1 end
    end

    return placed, failed
end

-- Cree un preset couleur (universel) a partir d'une selection active.
local function makeColorPreset(PT, no, color, uniOpt)
    Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(color.r / 255 * 100 + 0.5)))
    Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(color.g / 255 * 100 + 0.5)))
    Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(color.b / 255 * 100 + 0.5)))
    Cmd(string.format('Store Preset %d.%d /Merge /NoConfirm%s', PT, no, uniOpt))
    Cmd(string.format('Label Preset %d.%d "%s"', PT, no, color.name))
    Cmd(string.format('Appearance Preset %d.%d /R=%d /G=%d /B=%d', PT, no, color.r, color.g, color.b))
end

-- Cree un macro a une ou plusieurs lignes de commande.
local function makeMacro(no, name, r, g, b, lines)
    Cmd(string.format('Store Macro %d /NoConfirm', no))
    Cmd(string.format('Label Macro %d "%s"', no, name))
    Cmd(string.format('Appearance Macro %d /R=%d /G=%d /B=%d', no, r, g, b))
    pcall(function()
        local m = ObjectList("Macro " .. no)[1]
        for _, cmd in ipairs(lines) do
            local ml = m:Append()
            ml:Set("Command", cmd)
        end
    end)
end

local function main(display_handle)
    local PT = 4   -- pool de presets Color

    local cfg = MessageBox({
        title    = "Color Picker LIVE",
        message  = "Picker couleur pour le LIVE : tape une couleur -> le groupe\n"
                .. "passe a cette couleur en restitution (fondu, sans programmer).",
        commands = {
            { value = 1, name = "Generer" },
            { value = 0, name = "Annuler" },
        },
        inputs = {
            { name = "Groupes (ex: 1 Thru 8 / vide = auto)", value = "" },
            { name = "Nb couleurs (max 12)",                  value = "10" },
            { name = "Fade couleur (s)",                      value = "1"  },
            { name = "Fade arret (s)",                        value = "2"  },
            { name = "Preset depart (ID)",                    value = "1"  },
            { name = "Sequence depart (ID)",                  value = "1"  },
            { name = "Macro depart (ID)",                     value = "1"  },
            { name = "Layout (No)",                           value = "1"  },
        },
    })
    if not cfg or cfg.result ~= 1 then return end

    local grpStr     = cfg.inputs["Groupes (ex: 1 Thru 8 / vide = auto)"]
    local nColors    = math.floor(toNum(cfg.inputs["Nb couleurs (max 12)"], 10, 1, #COLORS))
    local colorFade  = toNum(cfg.inputs["Fade couleur (s)"], 1, 0, 600)
    local offFade    = toNum(cfg.inputs["Fade arret (s)"], 2, 0, 600)
    local presetStart= math.floor(toNum(cfg.inputs["Preset depart (ID)"], 1, 1, 100000))
    local seqStart   = math.floor(toNum(cfg.inputs["Sequence depart (ID)"], 1, 1, 100000))
    local macStart   = math.floor(toNum(cfg.inputs["Macro depart (ID)"], 1, 1, 100000))
    local layNo      = math.floor(toNum(cfg.inputs["Layout (No)"], 1, 1, 100000))

    local colors = {}
    for i = 1, nColors do colors[i] = COLORS[i] end

    -- Cibles : "All" (toutes fixtures) puis chaque groupe.
    local groupIds = parseRange(grpStr) or scanGroups(100)
    local targets = { { label = "All", sel = "Fixture Thru" } }
    if groupIds then
        for _, gid in ipairs(groupIds) do
            targets[#targets + 1] = { label = groupName(gid), sel = "Group " .. gid }
        end
    end
    local nTargets = #targets

    -- Plages d'objets.
    local presetEnd = presetStart + nColors - 1
    local seqEnd    = seqStart + nTargets - 1
    local perTarget = nColors + 1                 -- 1 Off + N couleurs
    local macColorEnd = macStart + nTargets * perTarget - 1
    local utilBase  = macStart + nTargets * perTarget
    local macEnd    = utilBase + 2                -- Off All / Highlight / Full

    -- Verification occupation.
    local occupied, detectOk = false, true
    local function checkRange(kindFmt, a, b)
        for no = a, b do
            local used, ok = objectUsed(string.format(kindFmt, no))
            if not ok then detectOk = false; return end
            if used then occupied = true; return end
        end
    end
    checkRange("Preset " .. PT .. ".%d", presetStart, presetEnd)
    if detectOk and not occupied then checkRange("Sequence %d", seqStart, seqEnd) end
    if detectOk and not occupied then checkRange("Macro %d", macStart, macEnd) end

    if occupied or not detectOk then
        local confirm = MessageBox({
            title    = "Color Picker LIVE",
            message  = string.format(
                "Des objets existent peut-etre ici :\n"
             .. "Preset %d.%d -> %d.%d\n"
             .. "Sequence %d -> %d\n"
             .. "Macro %d -> %d\n"
             .. "(et le Layout %d sera (re)cree).\n\n"
             .. "Tout ecraser et regenerer a neuf ?",
                PT, presetStart, PT, presetEnd, seqStart, seqEnd,
                macStart, macEnd, layNo),
            commands = {
                { value = 1, name = "Ecraser" },
                { value = 0, name = "Annuler" },
            },
        })
        if not confirm or confirm.result ~= 1 then return end
        Cmd(string.format('Delete Preset %d.%d Thru %d.%d /NoConfirm', PT, presetStart, PT, presetEnd))
        Cmd(string.format('Delete Sequence %d Thru %d /NoConfirm', seqStart, seqEnd))
        Cmd(string.format('Delete Macro %d Thru %d /NoConfirm', macStart, macEnd))
        Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    end

    -- Selection scratch + verif qu'il y a des fixtures.
    Cmd("ClearAll")
    Cmd("Fixture Thru")
    local selCount, hasSelApi = 0, false
    pcall(function() selCount = SelectionCount(); hasSelApi = true end)
    if hasSelApi and selCount == 0 then
        MessageBox({
            title = "Color Picker LIVE",
            message = "Aucune fixture disponible.\nPatche au moins un projecteur RGB.",
            commands = { { value = 1, name = "OK" } },
        })
        return
    end

    -- 1) Presets couleur universels.
    local uniOpt = " /Universal"
    for i, c in ipairs(colors) do
        c.no = presetStart + i - 1
        Cmd("ClearAll")
        Cmd("Fixture Thru")
        makeColorPreset(PT, c.no, c, uniOpt)
    end

    -- 2) Une sequence par cible, avec une cue par couleur.
    --    Couleur ecrite en DIRECT (attributs) pour garantir le contenu de la
    --    cue, quelle que soit la syntaxe d'application de preset.
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
        -- Fade d'arret (best-effort, ignore si la propriete differe).
        pcall(function()
            local s = ObjectList("Sequence " .. seqNo)[1]
            if s then s:Set("OffFade", tostring(offFade)) end
        end)
    end
    Cmd("ClearAll")

    -- 3) Macros : matrice (Off + couleurs) par cible, puis outils.
    --    + construction des elements du layout en parallele.
    local elements = {}
    local function addTile(object, x, y, w)
        elements[#elements + 1] = { object = object, x = x, y = y, w = w or 1, h = 1 }
    end

    for ti, t in ipairs(targets) do
        local seqNo  = seqStart + ti - 1
        local base   = macStart + (ti - 1) * perTarget
        local y      = ti - 1

        -- Colonne 0 : Off du groupe (sert aussi d'etiquette de ligne).
        local offNo = base
        makeMacro(offNo, "Off " .. t.label, 45, 45, 55,
            { string.format("Off Sequence %d", seqNo) })
        addTile("Macro " .. offNo, 0, y, 1)

        -- Colonnes 1..N : couleurs.
        for ci, c in ipairs(colors) do
            local mno = base + ci
            makeMacro(mno, t.label .. " " .. c.name, c.r, c.g, c.b,
                { string.format("Goto Sequence %d Cue %d Fade %s", seqNo, ci, tostring(colorFade)) })
            addTile("Macro " .. mno, ci, y, 1)
        end
    end

    -- Outils sous la matrice.
    local yUtil = nTargets + 1
    makeMacro(utilBase, "Off All", 90, 30, 30,
        { string.format("Off Sequence %d Thru %d", seqStart, seqEnd) })
    makeMacro(utilBase + 1, "Highlight", 255, 110, 0, { "Highlight On" })
    makeMacro(utilBase + 2, "Full", 255, 200, 40, { "Full" })
    addTile("Macro " .. utilBase,     0, yUtil, 2)
    addTile("Macro " .. (utilBase + 1), 2, yUtil, 2)
    addTile("Macro " .. (utilBase + 2), 4, yUtil, 2)

    -- 4) Layout frais + placement.
    Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Picker LIVE"', layNo))
    Cmd(string.format('Appearance Layout %d /R=18 /G=22 /B=30', layNo))

    local placed, failed = fillLayout(layNo, elements)
    Cmd("ClearAll")

    local note = ""
    if failed > 0 then
        note = string.format("\n(%d case(s) non placee(s) — voir [CP-diag])", failed)
    end

    local msg = string.format(
        "Color Picker LIVE pret !\n\n"
     .. "Cibles : %d  (All + %d groupes)\n"
     .. "Couleurs : %d  (Preset %d.%d -> %d.%d)\n"
     .. "Sequences : %d -> %d   Macros : %d -> %d\n"
     .. "Fade couleur : %ss   Fade arret : %ss\n"
     .. "Layout %d : %d/%d cases placees%s\n\n"
     .. "EN LIVE : tape une pastille couleur d'une ligne -> ce groupe\n"
     .. "passe a la couleur en restitution (fondu, sans programmer).\n"
     .. "Colonne de gauche = Off du groupe. En bas : Off All / Highlight / Full.",
        nTargets, (groupIds and #groupIds or 0),
        nColors, PT, presetStart, PT, presetEnd,
        seqStart, seqEnd, macStart, macEnd,
        tostring(colorFade), tostring(offFade),
        layNo, placed, placed + failed, note)

    MessageBox({
        title = "Color Picker LIVE",
        message = msg,
        commands = { { value = 1, name = "Super !" } },
    })
    Printf("[ColorPickerLive] %d cibles, %d couleurs, sequences %d-%d, macros %d-%d, layout %d : %d/%d.",
        nTargets, nColors, seqStart, seqEnd, macStart, macEnd, layNo, placed, placed + failed)
end

return main
