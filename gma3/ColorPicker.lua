-- =====================================================================
--  Color Picker LIVE  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Un color picker de busking, construit comme le font les pupitreurs :
--
--      MACHINE          COULEURS (tuiles colorees, tappables) ->
--    [ ALL        ]   [Red][Orange][Yellow][Green] ... [White]
--    [ Fixture 1  ]   [Red][Orange][Yellow][Green] ... [White]
--    [ Fixture 2  ]   [Red][Orange][Yellow][Green] ... [White]
--    [Off All] [Highlight] [Full]
--
--  - Chaque tuile couleur est une MINI-SEQUENCE (1 cue) posee sur le
--    layout : taper = la couleur part EN RESTITUTION (LTP), sans jamais
--    toucher au programmer. C'est le pattern busking standard de MA3.
--  - Chaque sequence recoit une vraie APPEARANCE ("Assign Appearance N
--    At Sequence M") -> tuile pleine couleur, propre.
--  - La case de gauche est la VRAIE fixture (ou le groupe) : icone,
--    nom, couleur live. La taper selectionne la machine.
--  - "Off When Overridden" : changer de couleur relache l'ancienne ->
--    une seule tuile allumee par ligne (comportement radio).
--
--  Objets crees (a partir de l'ID de depart, defaut 101) :
--    Appearances : 1 par couleur + 1 sombre.
--    Sequences   : 1 par (ligne x couleur), label "<machine> <couleur>".
--    Macros      : Off All / Highlight / Full / ALL (4 seulement).
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

-- Valeurs proposees par les boutons de fade (secondes).
local FADE_VALUES = { 0, 0.5, 1, 2, 3, 4 }

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

local function objectExists(addr)
    local exists = false
    pcall(function()
        if ObjectList(addr)[1] then exists = true end
    end)
    return exists
end

-- Un groupe existant n'expose PAS ses fixtures via Children() -> on teste
-- l'existence de l'objet, comme pour les fixtures.
local function scanGroups(maxNo)
    local ids = {}
    for no = 1, maxNo do
        if objectExists("Group " .. no) then ids[#ids + 1] = no end
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

-- Appearance pleine couleur (fond). Proprietes BackR/G/B/Alpha en 0-255,
-- ecrites via la commande "Set ... Property" ET via le handle objet.
local function makeAppearance(no, name, r, g, b)
    Cmd(string.format('Store Appearance %d /NoConfirm', no))
    Cmd(string.format('Label Appearance %d "%s"', no, name))
    Cmd(string.format('Set Appearance %d Property "BackR" "%d"', no, r))
    Cmd(string.format('Set Appearance %d Property "BackG" "%d"', no, g))
    Cmd(string.format('Set Appearance %d Property "BackB" "%d"', no, b))
    Cmd(string.format('Set Appearance %d Property "BackAlpha" "255"', no))
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

local function makeMacro(no, name, appNo, lines)
    Cmd(string.format('Store Macro %d /NoConfirm', no))
    Cmd(string.format('Label Macro %d "%s"', no, name))
    if appNo then
        Cmd(string.format('Assign Appearance %d At Macro %d', appNo, no))
    end
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
--  Mecanisme VALIDE sur console : handle du layout recupere UNE fois,
--  dernier enfant apres chaque Assign, position via posx/posy/positionw/
--  positionh, echelle auto-mesuree, coordonnees >= 0 uniquement.
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

    local pitchX, pitchY = 32, 32
    local GAP = 0.14

    local function place(elem, e)
        local stepX = pitchX * (1 + GAP)
        local stepY = pitchY * (1 + GAP)
        local w = e.w or 1
        local px = math.max(0, math.floor((e.x or 0) * stepX))
        local py = math.max(0, math.floor((e.y or 0) * stepY))
        local pw = math.max(1, math.floor(w * pitchX + (w - 1) * pitchX * GAP))
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
            -- Tuile sequence : comportement de restitution au tap (best-effort).
            if e.play then
                pcall(function() elem:Set("PlaybackFunction", "Go+") end)
                pcall(function() elem:Set("Function", "Go+") end)
            end
        end
        if ok then placed = placed + 1 else failed = failed + 1 end
    end

    return placed, failed
end

-- ------------------------------- main --------------------------------

local function main(display_handle)
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

    -- Detection AUTOMATIQUE : groupes d'abord, sinon machines une a une.
    local autoGroups = scanGroups(100)
    local autoFix    = (not autoGroups) and scanFixtures(200, MAX_FIXTURE_ROWS + 1) or nil

    local found
    if autoGroups then
        found = string.format("%d groupes detectes", #autoGroups)
    elseif autoFix then
        found = string.format("aucun groupe -> %d machines detectees",
            math.min(#autoFix, MAX_FIXTURE_ROWS))
    else
        found = "aucun groupe, aucune machine ?"
    end

    -- Reglages par defaut (modifiables via "Options").
    local grpStr, fixStr = "", ""
    local nColors   = 10
    local colorFade = 1
    local offFade   = 2
    local baseId    = 101
    local layNo     = 1

    local first = MessageBox({
        title    = "Color Picker LIVE",
        message  = string.format(
            "Detecte : %s.\n\n"
         .. "Genere : 1 ligne par cible + ALL, %d couleurs,\n"
         .. "couleur en restitution (fondu %ds), sans programmer.\n"
         .. "Objets ranges a partir du %d, Layout %d.",
            found, nColors, colorFade, baseId, layNo),
        commands = {
            { value = 1, name = "Generer" },
            { value = 2, name = "Options" },
            { value = 0, name = "Annuler" },
        },
    })
    if not first or first.result == 0 or first.result == nil then return end

    if first.result == 2 then
        local cfg = MessageBox({
            title    = "Color Picker LIVE - Options",
            message  = "Laisse vide pour l'auto-detection.",
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
                { name = "ID de depart (seq/macro/appearance)",    value = "101" },
                { name = "Layout (No)",                            value = "1"   },
            },
        })
        if not cfg or cfg.result ~= 1 then return end
        grpStr    = cfg.inputs["Groupes (ex: 1 Thru 8 / vide = auto)"]
        fixStr    = cfg.inputs["Machines (si aucun groupe)"]
        nColors   = math.floor(toNum(cfg.inputs["Nb couleurs (max 12)"], 10, 1, #COLORS))
        colorFade = toNum(cfg.inputs["Fade couleur (s)"], 1, 0, 600)
        offFade   = toNum(cfg.inputs["Fade arret (s)"], 2, 0, 600)
        baseId    = math.floor(toNum(cfg.inputs["ID de depart (seq/macro/appearance)"], 101, 1, 100000))
        layNo     = math.floor(toNum(cfg.inputs["Layout (No)"], 1, 1, 100000))
    end

    local colors = {}
    for i = 1, nColors do colors[i] = COLORS[i] end

    -- Cibles : ALL en premiere ligne, puis groupes (sinon machines).
    local targets = { { label = "ALL", sel = "Fixture Thru", header = nil } }
    local groupIds = parseRange(grpStr) or autoGroups
    local truncated = false
    if groupIds then
        for _, gid in ipairs(groupIds) do
            targets[#targets + 1] = {
                label = groupName(gid), sel = "Group " .. gid,
                header = "Group " .. gid,
            }
        end
    else
        local fixIds = parseRange(fixStr) or autoFix or scanFixtures(200, MAX_FIXTURE_ROWS + 1)
        if fixIds and #fixIds > MAX_FIXTURE_ROWS then
            truncated = true
            while #fixIds > MAX_FIXTURE_ROWS do table.remove(fixIds) end
        end
        if fixIds then
            for _, fid in ipairs(fixIds) do
                targets[#targets + 1] = {
                    label = "Fix " .. fid, sel = "Fixture " .. fid,
                    header = "Fixture " .. fid,
                }
            end
        end
    end
    local nTargets = #targets

    -- Numerotation (pools distincts, meme ID de depart -> lisible).
    local nSeq     = nTargets * nColors
    local seqEnd   = baseId + nSeq - 1
    local appDark  = baseId + nColors
    local appGrey  = baseId + nColors + 1
    local appEnd   = appGrey
    local macOffAll, macHi, macFull, macAllHdr = baseId, baseId + 1, baseId + 2, baseId + 3
    -- Boutons de fade : 2 rangees (couleur / arret), 1 header + 1 par valeur.
    local nV          = #FADE_VALUES
    local macFadeCHdr = baseId + 4
    local macFadeC0   = baseId + 5              -- .. baseId + 4 + nV
    local macFadeOHdr = baseId + 5 + nV
    local macFadeO0   = baseId + 6 + nV         -- .. baseId + 5 + 2*nV
    local macEnd      = baseId + 5 + 2 * nV
    local function seqNoOf(ti, ci) return baseId + (ti - 1) * nColors + (ci - 1) end

    -- Occupation des plages -> confirmation avant d'ecraser.
    local occupied, detectOk = false, true
    local function check(fmt, a, b)
        for no = a, b do
            local used, ok = objectUsed(string.format(fmt, no))
            if not ok then detectOk = false; return end
            if used then occupied = true; return end
        end
    end
    check("Sequence %d", baseId, seqEnd)
    if detectOk and not occupied then check("Macro %d", baseId, macEnd) end
    if detectOk and not occupied then
        -- Les appearances n'ont pas d'enfants -> test d'existence.
        for no = baseId, appEnd do
            if objectExists("Appearance " .. no) then occupied = true; break end
        end
    end

    if occupied or not detectOk then
        local confirm = MessageBox({ title = "Color Picker LIVE",
            message = string.format(
                "Des objets existent peut-etre ici :\n"
             .. "Sequence %d -> %d\nMacro %d -> %d\nAppearance %d -> %d\n"
             .. "(et le Layout %d sera (re)cree).\n\n"
             .. "Les PRESETS couleur (pool 4) sont conserves, jamais effaces.\n"
             .. "Tout ecraser et regenerer ?",
                baseId, seqEnd, baseId, macEnd, baseId, appEnd, layNo),
            commands = { { value = 1, name = "Ecraser" }, { value = 0, name = "Annuler" } } })
        if not confirm or confirm.result ~= 1 then return end
        Cmd(string.format('Delete Sequence %d Thru %d /NoConfirm', baseId, seqEnd))
        Cmd(string.format('Delete Macro %d Thru %d /NoConfirm', baseId, macEnd))
        Cmd(string.format('Delete Appearance %d Thru %d /NoConfirm', baseId, appEnd))
        Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    end

    -- 1) Appearances : une par couleur + une sombre.
    for i, c in ipairs(colors) do
        makeAppearance(baseId + i - 1, "CP " .. c.name, c.r, c.g, c.b)
    end
    makeAppearance(appDark, "CP Dark", 36, 40, 48)
    makeAppearance(appGrey, "CP Grey", 66, 72, 84)

    -- 1b) Presets couleur UNIVERSELS (pool Color = 4), Preset 4.<baseId>...
    --     S'ils existent deja -> REUTILISES tels quels (tes modifs de
    --     couleur survivent aux regenerations). Sinon -> crees.
    local PT = 4
    local presetsCreated, presetsReused = 0, 0
    for ci, c in ipairs(colors) do
        local pNo = baseId + ci - 1
        if objectExists(string.format("Preset %d.%d", PT, pNo)) then
            presetsReused = presetsReused + 1
        else
            Cmd("ClearAll")
            Cmd("Fixture Thru")
            Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(c.r / 255 * 100 + 0.5)))
            Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(c.g / 255 * 100 + 0.5)))
            Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(c.b / 255 * 100 + 0.5)))
            Cmd(string.format('Store Preset %d.%d /Merge /NoConfirm /Universal', PT, pNo))
            Cmd(string.format('Label Preset %d.%d "%s"', PT, pNo, c.name))
            presetsCreated = presetsCreated + 1
        end
    end
    Cmd("ClearAll")

    -- 2) Mini-sequences : 1 par (cible x couleur), 1 cue, appearance couleur.
    --    La cue applique d'abord les attributs directs (filet de securite),
    --    puis le PRESET par-dessus : si la reference passe, la cue est LIEE
    --    au preset -> modifier le preset met a jour tout le board.
    for ti, t in ipairs(targets) do
        for ci, c in ipairs(colors) do
            local sq = seqNoOf(ti, ci)
            Cmd("ClearAll")
            Cmd(t.sel)
            Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(c.r / 255 * 100 + 0.5)))
            Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(c.g / 255 * 100 + 0.5)))
            Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(c.b / 255 * 100 + 0.5)))
            Cmd(string.format('At Preset %d.%d', PT, baseId + ci - 1))
            Cmd(string.format('Store Sequence %d Cue 1 /NoConfirm', sq))
            Cmd(string.format('Label Sequence %d "%s %s"', sq, t.label, c.name))
            Cmd(string.format('Assign Appearance %d At Sequence %d', baseId + ci - 1, sq))
            -- Timings (best-effort : commande + handle).
            Cmd(string.format('Set Sequence %d Cue 1 Property "CueInFade" "%s"', sq, tostring(colorFade)))
            Cmd(string.format('Set Sequence %d Property "OffFade" "%s"', sq, tostring(offFade)))
            Cmd(string.format('Set Sequence %d Property "OffWhenOverridden" "Yes"', sq))
            pcall(function()
                local s = ObjectList("Sequence " .. sq)[1]
                if s then
                    s:Set("OffFade", tostring(offFade))
                    s:Set("OffWhenOverridden", "Yes")
                end
            end)
        end
    end
    Cmd("ClearAll")

    -- 3) Macros utilitaires (4 seulement).
    makeMacro(macOffAll, "Off All", appDark,
        { string.format("Off Sequence %d Thru %d", baseId, seqEnd) })
    makeMacro(macHi,   "Highlight", appDark, { "Highlight" })
    makeMacro(macFull, "Full",      appDark, { "Full" })
    makeMacro(macAllHdr, "ALL",     appDark, { "Fixture Thru" })

    -- Boutons de fade : chaque bouton regle d'un coup toutes les sequences.
    --   FADE couleur -> CueInFade de chaque cue (fondu entre les couleurs
    --                   et au lancement).
    --   FADE arret   -> OffFade de chaque sequence (fondu au relache).
    local function fadeLabel(v)
        if v == math.floor(v) then return string.format("%ds", v) end
        return tostring(v) .. "s"
    end
    makeMacro(macFadeCHdr, "FADE couleur", appDark, {})
    makeMacro(macFadeOHdr, "FADE arret",   appDark, {})
    for vi, v in ipairs(FADE_VALUES) do
        local vs = tostring(v)
        local linesC, linesO = {}, {}
        for ti2 = 1, nTargets do
            for ci2 = 1, nColors do
                local sq = seqNoOf(ti2, ci2)
                linesC[#linesC + 1] = string.format(
                    'Set Sequence %d Cue 1 Property "CueInFade" "%s"', sq, vs)
                linesO[#linesO + 1] = string.format(
                    'Set Sequence %d Property "OffFade" "%s"', sq, vs)
            end
        end
        makeMacro(macFadeC0 + vi - 1, fadeLabel(v), appGrey, linesC)
        makeMacro(macFadeO0 + vi - 1, fadeLabel(v), appGrey, linesO)
    end

    -- 4) Layout : [machine (x2)] [couleurs...] par ligne + outils en bas.
    Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Picker LIVE"', layNo))
    -- (pas d'appearance sur le layout lui-meme : "Assign ... At Layout"
    --  ajouterait l'appearance comme case parasite dans la grille)

    local elements = {}
    for ti, t in ipairs(targets) do
        local row = ti - 1
        if t.header then
            elements[#elements + 1] = { object = t.header, x = 0, y = row, w = 2 }
        else
            elements[#elements + 1] = { object = "Macro " .. macAllHdr, x = 0, y = row, w = 2 }
        end
        for ci = 1, nColors do
            elements[#elements + 1] = {
                object = "Sequence " .. seqNoOf(ti, ci),
                x = 2 + ci - 1, y = row, play = true,
            }
        end
    end
    local uy = nTargets + 0.4
    elements[#elements + 1] = { object = "Macro " .. macOffAll, x = 0, y = uy, w = 2 }
    elements[#elements + 1] = { object = "Macro " .. macHi,     x = 2, y = uy, w = 2 }
    elements[#elements + 1] = { object = "Macro " .. macFull,   x = 4, y = uy, w = 2 }

    -- Rangees FADE (header large + un bouton par valeur).
    local fy1, fy2 = uy + 1.2, uy + 2.2
    elements[#elements + 1] = { object = "Macro " .. macFadeCHdr, x = 0, y = fy1, w = 2 }
    elements[#elements + 1] = { object = "Macro " .. macFadeOHdr, x = 0, y = fy2, w = 2 }
    for vi = 1, nV do
        elements[#elements + 1] = { object = "Macro " .. (macFadeC0 + vi - 1), x = 2 + vi - 1, y = fy1 }
        elements[#elements + 1] = { object = "Macro " .. (macFadeO0 + vi - 1), x = 2 + vi - 1, y = fy2 }
    end

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
     .. "Lignes : %d (ALL + %s)   Couleurs : %d\n"
     .. "Presets couleur : 4.%d -> 4.%d (%d crees, %d reutilises)\n"
     .. "Sequences %d -> %d (cues liees aux presets)\n"
     .. "Fade couleur %ss / arret %ss\n"
     .. "Layout %d : %d/%d cases placees%s\n\n"
     .. "EN LIVE : tape une tuile couleur -> la ligne passe a cette couleur\n"
     .. "en restitution. Retape (ou autre couleur) pour changer/relacher.\n"
     .. "Rangees FADE en bas : couleur (entre couleurs) / arret (relache).\n"
     .. "COULEURS PAS A TON GOUT ? Modifie le Preset 4.x (pool Color) ->\n"
     .. "tout le board suit. Regenerer ne touche jamais tes presets.\n"
     .. "Il faut de l'intensite (Full) pour voir la couleur.",
        nTargets, (groupIds and "groupes" or "machines"), nColors,
        baseId, baseId + nColors - 1, presetsCreated, presetsReused,
        baseId, seqEnd,
        tostring(colorFade), tostring(offFade),
        layNo, placed, placed + failed, note)

    MessageBox({ title = "Color Picker LIVE", message = msg,
        commands = { { value = 1, name = "Super !" } } })
    Printf("[ColorPickerLive] %d lignes x %d couleurs = %d sequences, layout %d : %d/%d cases.",
        nTargets, nColors, nSeq, layNo, placed, placed + failed)
end

return main
