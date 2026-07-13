-- =====================================================================
--  Color Picker LIVE  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Un color picker propre pour le LIVE :
--
--      MACHINE      couleurs ->                                OFF
--    [ Fixture 1 ] [Red][Orange][Yellow] ... [White]          [Off]
--    [ Fixture 2 ] [Red][Orange][Yellow] ... [White]          [Off]
--    [ ALL       ] [Red][Orange][Yellow] ... [White]          [Off]
--    [ Off All ] [Highlight] [Full]
--
--  - Chaque LIGNE = une cible : la case de gauche est la VRAIE fixture
--    (ou le groupe) -> on voit son icone, son nom et sa couleur en direct.
--  - Chaque case couleur declenche "Goto Sequence <cible> Cue <couleur>"
--    avec un fondu -> la couleur part EN RESTITUTION (LTP), sans jamais
--    toucher au programmer. [Off] relache la cible (fondu d'arret).
--  - Peu d'objets : 1 sequence par cible, cues = couleurs.
--
--  Fiabilite : le placement utilise UNIQUEMENT le mecanisme deja valide
--  sur console (handle du layout recupere une fois, position via
--  posx/posy/positionw/positionh, echelle auto-mesuree, coordonnees >= 0).
--  La coloration des cases (Appearance) est appliquee en best-effort.
--
--  NB : apres toute modification de ce fichier -> "ReloadAllPlugins" (RP).
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

local MAX_FIXTURE_ROWS = 12   -- limite de lignes en mode "une par machine"

-- ------------------------------ utils --------------------------------

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

-- Objet avec du contenu (sequences, macros, groupes...).
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

-- Objet qui existe simplement (fixtures).
local function objectExists(addr)
    local exists = false
    pcall(function()
        if ObjectList(addr)[1] then exists = true end
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

local function groupName(gid)
    local nm
    pcall(function()
        local h = ObjectList("Group " .. gid)[1]
        if h then nm = h:Get("Name") end
    end)
    if nm and tostring(nm) ~= "" then return tostring(nm) end
    return "Group " .. gid
end

-- --------------------------- constructeurs ---------------------------

-- Appearance pleine couleur (fond). Echelle 0-255 (format natif MA3).
local function makeAppearance(no, name, r, g, b)
    Cmd(string.format('Store Appearance %d /NoConfirm', no))
    Cmd(string.format('Label Appearance %d "%s"', no, name))
    pcall(function()
        local a = ObjectList("Appearance " .. no)[1]
        if a then
            a:Set("BackR", tostring(r))
            a:Set("BackG", tostring(g))
            a:Set("BackB", tostring(b))
            a:Set("BackAlpha", "255")
        end
    end)
end

local function makeMacro(no, name, r, g, b, lines)
    Cmd(string.format('Store Macro %d /NoConfirm', no))
    Cmd(string.format('Label Macro %d "%s"', no, name))
    Cmd(string.format('Appearance Macro %d /R=%d /G=%d /B=%d', no, r, g, b))
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

-- ------------------------ placement layout ---------------------------
--  Mecanisme VALIDE sur console :
--   - handle du layout recupere UNE fois, dernier enfant apres Assign ;
--   - position/taille via posx/posy/positionw/positionh (+ :Set officiel) ;
--   - echelle = taille native mesuree sur le 1er element (repli 32) ;
--   - coordonnees >= 0 uniquement (entiers non signes : -5 -> 65531).
--  En plus (best-effort) : Appearance assignee a la CASE pour un fond
--  colore plein, via handle puis via commande Assign.
local function fillLayout(layoutNo, elements)
    local placed, failed = 0, 0

    local layout
    pcall(function() layout = DataPool().Layouts[layoutNo] end)
    if layout == nil then return 0, #elements end

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

    local pitchX, pitchY = 32, 32     -- pas d'une case (auto-mesure)
    local GAP = 0.14                  -- ecart entre cases (fraction de case)

    local function place(elem, e)
        local stepX = pitchX * (1 + GAP)
        local stepY = pitchY * (1 + GAP)
        local px = math.max(0, math.floor((e.x or 0) * stepX))
        local py = math.max(0, math.floor((e.y or 0) * stepY))
        local pw = math.max(1, math.floor((e.w or 1) * pitchX + (((e.w or 1) - 1) * pitchX * GAP)))
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
        if elem ~= nil then
            ok = place(elem, e)
            -- Fond colore de la case (3 formes, sans consequence si KO).
            if e.app then
                pcall(function() elem:Set("Appearance", "Appearance " .. e.app) end)
                pcall(function() elem:Set("Appearance", tostring(e.app)) end)
                pcall(function()
                    Cmd(string.format("Assign Appearance %d At Layout %d.%d",
                        e.app, layoutNo, after))
                end)
            end
        end
        if ok then placed = placed + 1 else failed = failed + 1 end
    end

    return placed, failed
end

-- ------------------------------- main --------------------------------

local function main(display_handle)
    local cfg = MessageBox({
        title    = "Color Picker LIVE",
        message  = "Une ligne par machine/groupe, des cases couleur ->\n"
                .. "couleur en restitution (fondu), sans programmer.",
        commands = {
            { value = 1, name = "Generer" },
            { value = 0, name = "Annuler" },
        },
        inputs = {
            { name = "Groupes (ex: 1 Thru 8 / vide = auto)",  value = ""    },
            { name = "Machines (si aucun groupe)",             value = ""    },
            { name = "Nb couleurs (max 12)",                   value = "10"  },
            { name = "Fade couleur (s)",                       value = "1"   },
            { name = "Fade arret (s)",                         value = "2"   },
            { name = "Sequence depart (ID)",                   value = "101" },
            { name = "Macro depart (ID)",                      value = "101" },
            { name = "Layout (No)",                            value = "1"   },
        },
    })
    if not cfg or cfg.result ~= 1 then return end

    local grpStr    = cfg.inputs["Groupes (ex: 1 Thru 8 / vide = auto)"]
    local fixStr    = cfg.inputs["Machines (si aucun groupe)"]
    local nColors   = math.floor(toNum(cfg.inputs["Nb couleurs (max 12)"], 10, 1, #COLORS))
    local colorFade = toNum(cfg.inputs["Fade couleur (s)"], 1, 0, 600)
    local offFade   = toNum(cfg.inputs["Fade arret (s)"], 2, 0, 600)
    local seqStart  = math.floor(toNum(cfg.inputs["Sequence depart (ID)"], 101, 1, 100000))
    local macStart  = math.floor(toNum(cfg.inputs["Macro depart (ID)"], 101, 1, 100000))
    local layNo     = math.floor(toNum(cfg.inputs["Layout (No)"], 1, 1, 100000))
    local appStart  = macStart   -- pools differents : meme numerotation, lisible

    local colors = {}
    for i = 1, nColors do colors[i] = COLORS[i] end

    -- Il faut des fixtures.
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

    -- Cibles : groupes si presents, sinon machines une a une ; + ALL.
    local targets = {}
    local groupIds = parseRange(grpStr) or scanGroups(100)
    local truncated = false
    if groupIds then
        for _, gid in ipairs(groupIds) do
            targets[#targets + 1] = {
                label = groupName(gid), sel = "Group " .. gid,
                header = "Group " .. gid,
            }
        end
    else
        local fixIds = parseRange(fixStr) or scanFixtures(200, MAX_FIXTURE_ROWS + 1)
        if fixIds and #fixIds > MAX_FIXTURE_ROWS then
            truncated = true
            while #fixIds > MAX_FIXTURE_ROWS do table.remove(fixIds) end
        end
        if fixIds then
            for _, fid in ipairs(fixIds) do
                targets[#targets + 1] = {
                    label = "Fixture " .. fid, sel = "Fixture " .. fid,
                    header = "Fixture " .. fid,
                }
            end
        end
    end
    targets[#targets + 1] = { label = "ALL", sel = "Fixture Thru", header = nil }
    local nTargets = #targets

    -- Numerotation des objets.
    local seqEnd    = seqStart + nTargets - 1
    local perTarget = nColors + 1                    -- N couleurs + 1 Off
    local utilBase  = macStart + nTargets * perTarget
    local macAllHdr = utilBase
    local macOffAll = utilBase + 1
    local macHi     = utilBase + 2
    local macFull   = utilBase + 3
    local macEnd    = macFull
    local appDark   = appStart + nColors             -- fond sombre (ALL / Off)
    local appEnd    = appDark

    -- Occupation des plages -> confirmation avant d'ecraser.
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

    -- 1) Appearances (fonds de cases).
    for i, c in ipairs(colors) do
        makeAppearance(appStart + i - 1, "CP " .. c.name, c.r, c.g, c.b)
    end
    makeAppearance(appDark, "CP Dark", 36, 40, 48)

    -- 2) Sequences : 1 par cible, 1 cue par couleur (attributs directs).
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
        Cmd(string.format('Label Sequence %d "CP %s"', seqNo, t.label))
        pcall(function()
            local s = ObjectList("Sequence " .. seqNo)[1]
            if s then
                s:Set("OffWhenOverridden", "Yes")
                s:Set("OffFade", tostring(offFade))
            end
        end)
    end
    Cmd("ClearAll")

    -- 3) Macros : par cible (couleurs + Off), puis outils.
    for ti, t in ipairs(targets) do
        local seqNo = seqStart + ti - 1
        local base  = macStart + (ti - 1) * perTarget
        makeMacro(base, "Off", 36, 40, 48,
            { string.format("Off Sequence %d", seqNo) })
        for ci, c in ipairs(colors) do
            makeMacro(base + ci, c.name, c.r, c.g, c.b,
                { string.format("Goto Sequence %d Cue %d Fade %s",
                    seqNo, ci, tostring(colorFade)) })
        end
    end
    makeMacro(macAllHdr, "ALL",       36,  40,  48, {})
    makeMacro(macOffAll, "Off All",   90,  30,  30,
        { string.format("Off Sequence %d Thru %d", seqStart, seqEnd) })
    makeMacro(macHi,     "Highlight", 255, 110,  0, { "Highlight" })
    makeMacro(macFull,   "Full",      255, 200, 40, { "Full" })

    -- 4) Layout : grille  [machine][couleurs...][off]  + ligne outils.
    Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Picker LIVE"', layNo))
    Cmd(string.format('Appearance Layout %d /R=16 /G=18 /B=24', layNo))

    local elements = {}
    local offCol = 1 + nColors        -- col 0 = machine, 1..N = couleurs
    for ti, t in ipairs(targets) do
        local row  = ti - 1
        local base = macStart + (ti - 1) * perTarget
        if t.header then
            elements[#elements + 1] = { object = t.header, x = 0, y = row }
        else
            elements[#elements + 1] = { object = "Macro " .. macAllHdr,
                x = 0, y = row, app = appDark }
        end
        for ci = 1, nColors do
            elements[#elements + 1] = {
                object = "Macro " .. (base + ci),
                x = ci, y = row, app = appStart + ci - 1,
            }
        end
        elements[#elements + 1] = { object = "Macro " .. base,
            x = offCol, y = row, app = appDark }
    end
    local uy = nTargets
    elements[#elements + 1] = { object = "Macro " .. macOffAll, x = 0, y = uy, w = 2, app = appDark }
    elements[#elements + 1] = { object = "Macro " .. macHi,     x = 2, y = uy, w = 2, app = appDark }
    elements[#elements + 1] = { object = "Macro " .. macFull,   x = 4, y = uy, w = 2, app = appDark }

    local placed, failed = fillLayout(layNo, elements)
    Cmd("ClearAll")

    local note = ""
    if failed > 0 then
        note = string.format("\n(%d case(s) non placee(s) — voir [CP-diag])", failed)
    end
    if truncated then
        note = note .. string.format(
            "\n(Machines limitees a %d lignes — utilise des groupes pour plus)",
            MAX_FIXTURE_ROWS)
    end

    local msg = string.format(
        "Color Picker LIVE pret !\n\n"
     .. "Lignes : %d (%s + ALL)\n"
     .. "Couleurs : %d   Fade %ss / arret %ss\n"
     .. "Sequences %d-%d, Macros %d-%d\n"
     .. "Layout %d : %d/%d cases placees%s\n\n"
     .. "EN LIVE : tape une case couleur -> la ligne passe a cette couleur\n"
     .. "en restitution, sans programmer. [Off] a droite relache la ligne.\n"
     .. "Astuce : il faut de l'intensite (Full) pour voir la couleur.",
        nTargets, (groupIds and "groupes" or "machines"),
        nColors, tostring(colorFade), tostring(offFade),
        seqStart, seqEnd, macStart, macEnd,
        layNo, placed, placed + failed, note)

    MessageBox({ title = "Color Picker LIVE", message = msg,
        commands = { { value = 1, name = "Super !" } } })
    Printf("[ColorPickerLive] %d lignes x %d couleurs, layout %d : %d/%d cases.",
        nTargets, nColors, layNo, placed, placed + failed)
end

return main
