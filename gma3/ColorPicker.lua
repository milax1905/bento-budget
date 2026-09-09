-- =====================================================================
--  Color Picker LIVE  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Un color picker de busking, construit comme le font les pupitreurs :
--
--      MACHINE          COULEURS (tuiles colorees, tappables) ->
--    [ ALL        ]   [Red][Orange][Yellow][Green] ... [White]
--    [ Fixture 1  ]   [Red][Orange][Yellow][Green] ... [White]
--    [ Fixture 2  ]   [Red][Orange][Yellow][Green] ... [White]
--    [========= Off All (barre rouge) =========]
--    [FADE couleur] [0s][0.5s][1s][2s][3s][4s]   (bouton actif surligne)
--    [FADE arret  ] [0][0.5][1][2][3][4]
--    + banniere titre en haut, ordre garanti (axe Y du layout inverse).
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
--    Macros      : Off All + etiquette ALL + boutons FADE avec feedback
--                  (aucune action programmer — l'intensite reste a ton fader).
--
--  NB : apres toute modification de ce fichier -> "ReloadAllPlugins" (RP).
-- =====================================================================

-- Palette en ordre ARC-EN-CIEL (blanc en dernier). Chaque couleur a deux
-- appearances : sombre (repos) et pleine (tuile active -> "se remplit").
local COLORS = {
    { name = "Red",     r = 255, g =   0, b =   0 },
    { name = "Orange",  r = 255, g =  70, b =   0 },
    { name = "Amber",   r = 255, g = 150, b =   0 },
    { name = "Yellow",  r = 255, g = 230, b =   0 },
    { name = "Green",   r =   0, g = 220, b =  40 },
    { name = "Cyan",    r =   0, g = 210, b = 210 },
    { name = "Azure",   r =   0, g = 130, b = 255 },
    { name = "Blue",    r =  20, g =  30, b = 255 },
    { name = "Violet",  r = 130, g =   0, b = 255 },
    { name = "Magenta", r = 255, g =   0, b = 210 },
    { name = "Pink",    r = 255, g =  90, b = 160 },
    { name = "White",   r = 255, g = 255, b = 255 },
}

local MAX_FIXTURE_ROWS = 12   -- limite de lignes en mode "une par machine"

-- Valeurs proposees par les boutons de fade (secondes).
local FADE_VALUES = { 0, 0.5, 1, 2, 3, 4 }

-- Rangee FX : direction/etalement de la boucle 2 couleurs, via l'objet
-- MAtricks partage "CPFX" (reference par les recipes des sequences FX).
--   from/to = DelayFromX/DelayToX (s), wings = XWings (2 = symetrique).
--   J = jardin (gauche), C = cour (droite).
local FX_MODES = {
    { lbl = "FX Off", from = 0, to = 0,   wings = 1 },
    { lbl = "J>C 05", from = 0, to = 0.5, wings = 1 },
    { lbl = "J>C 1",  from = 0, to = 1,   wings = 1 },
    { lbl = "J>C 2",  from = 0, to = 2,   wings = 1 },
    { lbl = "C>J 1",  from = 1, to = 0,   wings = 1 },
    { lbl = "SYM 1",  from = 0, to = 1,   wings = 2 },
    { lbl = "SYM 2",  from = 0, to = 2,   wings = 2 },
}

-- ------------------- generateur d'images "neon" ----------------------
-- PNG pur Lua (sans compression : blocs deflate "stored") : tuile a
-- contour arrondi pleine couleur, centre presque transparent, coins
-- transparents. Valide octet par octet hors console.

local function u32be(n)
    return string.char((n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255)
end

local crcTable
local function crc32(s)
    if not crcTable then
        crcTable = {}
        for i = 0, 255 do
            local c = i
            for _ = 1, 8 do
                if (c & 1) == 1 then c = 0xEDB88320 ~ (c >> 1) else c = c >> 1 end
            end
            crcTable[i] = c
        end
    end
    local crc = 0xFFFFFFFF
    for i = 1, #s do
        crc = crcTable[(crc ~ s:byte(i)) & 255] ~ (crc >> 8)
    end
    return (crc ~ 0xFFFFFFFF) & 0xFFFFFFFF
end

local function adler32(s)
    local a, b = 1, 0
    for i = 1, #s do
        a = (a + s:byte(i)) % 65521
        b = (b + a) % 65521
    end
    return ((b << 16) | a) & 0xFFFFFFFF
end

local function pngChunk(typ, data)
    return u32be(#data) .. typ .. data .. u32be(crc32(typ .. data))
end

local function zlibStored(raw)
    local out = { string.char(0x78, 0x01) }
    local pos, len = 1, #raw
    while pos <= len do
        local n = math.min(65535, len - pos + 1)
        local last = (pos + n - 1 >= len) and 1 or 0
        out[#out + 1] = string.char(last, n & 255, n >> 8,
            (~n) & 255, ((~n) >> 8) & 255)
        out[#out + 1] = raw:sub(pos, pos + n - 1)
        pos = pos + n
    end
    out[#out + 1] = u32be(adler32(raw))
    return table.concat(out)
end

local TILE_SIZE, TILE_THICK, TILE_RADIUS, TILE_FILLA = 96, 9, 18, 26

local function tilePng(r, g, b)
    local function inside(x, y, inset)
        local lo, hi = inset, TILE_SIZE - 1 - inset
        local rad = math.max(TILE_RADIUS - inset, 0)
        if x < lo or x > hi or y < lo or y > hi then return false end
        local cx = (x < lo + rad) and (lo + rad) or ((x > hi - rad) and (hi - rad) or x)
        local cy = (y < lo + rad) and (lo + rad) or ((y > hi - rad) and (hi - rad) or y)
        local dx, dy = x - cx, y - cy
        return (dx * dx + dy * dy) <= rad * rad or (cx == x and cy == y)
    end
    local rows = {}
    for y = 0, TILE_SIZE - 1 do
        local row = { "\0" }
        for x = 0, TILE_SIZE - 1 do
            local a
            if not inside(x, y, 0) then a = 0
            elseif not inside(x, y, TILE_THICK) then a = 255
            else a = TILE_FILLA end
            row[#row + 1] = string.char(r, g, b, a)
        end
        rows[#rows + 1] = table.concat(row)
    end
    local raw = table.concat(rows)
    local ihdr = u32be(TILE_SIZE) .. u32be(TILE_SIZE) .. string.char(8, 6, 0, 0, 0)
    return "\137PNG\r\n\26\10"
        .. pngChunk("IHDR", ihdr)
        .. pngChunk("IDAT", zlibStored(raw))
        .. pngChunk("IEND", "")
end

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
    -- Sanitise : un guillemet ou un point casserait les commandes / les
    -- chemins de recipe ("default.groups.<nom>").
    if nm and tostring(nm) ~= "" then
        return (tostring(nm):gsub('["%.]', ""))
    end
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
    local GAP = 0.16

    local function place(elem, e)
        local stepX = pitchX * (1 + GAP)
        local stepY = pitchY * (1 + GAP)
        local w = e.w or 1
        local h = e.h or 1
        local px = math.max(0, math.floor((e.x or 0) * stepX))
        local py = math.max(0, math.floor((e.y or 0) * stepY))
        local pw = math.max(1, math.floor(w * pitchX + (w - 1) * pitchX * GAP))
        local ph = math.max(1, math.floor(h * pitchY + (h - 1) * pitchY * GAP))
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
        local before = liveCount()
        Cmd(string.format("Assign %s At Layout %d", e.object, layoutNo))
        local after = liveCount()
        local elem
        -- L'element n'est le NOTRE que si le compteur a bien grandi ;
        -- sinon (objet inexistant) on ne touche pas la tuile precedente.
        if after > before then
            pcall(function() elem = layout[after] end)
        end

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
            -- Pastilles couleur : PAS de texte ni de barres (look reference,
            -- la couleur seule parle). Proprietes CONFIRMEES par les fichiers
            -- UI de MA3 (layout_element_editor.uixml) : Visibility* = Hidden.
            -- On garde VisibilityIndicatorBar (temoin de sequence active).
            if e.clean then
                pcall(function()
                    elem:Set("VisibilityObjectName", "Hidden")
                    elem:Set("VisibilityID", "Hidden")
                    elem:Set("VisibilityCID", "Hidden")
                    elem:Set("VisibilityBar", "Hidden")
                    elem:Set("VisibilityValue", "Hidden")
                end)
            end
            -- Texte personnalise par-dessus une tuile sans nom (ex. "FX").
            if e.text then
                pcall(function()
                    elem:Set("CustomTextText", e.text)
                    elem:Set("CustomTextSize", 18)
                    elem:Set("CustomTextAlignmentH", "Center")
                end)
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
    local nColors   = 12
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
         .. "Objets ranges a partir du %d, Layout %d.\n"
         .. "NB : la GENERATION passe par le programmer (ClearAll).",
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
            message  = "Laisse vide pour l'auto-detection. (defaut nb couleurs : 12)",
            commands = {
                { value = 1, name = "Generer" },
                { value = 0, name = "Annuler" },
            },
            inputs = {
                { name = "Groupes (ex: 1 Thru 8 / vide = auto)",  value = ""    },
                { name = "Machines (si aucun groupe)",             value = ""    },
                { name = "Nb couleurs (max 12)",                   value = "12"  },
                { name = "Fade couleur (s)",                       value = "1"   },
                { name = "Fade arret (s)",                         value = "2"   },
                { name = "ID de depart (seq/macro/appearance)",    value = "101" },
                { name = "Layout (No)",                            value = "1"   },
            },
        })
        if not cfg or cfg.result ~= 1 then return end
        grpStr    = cfg.inputs["Groupes (ex: 1 Thru 8 / vide = auto)"]
        fixStr    = cfg.inputs["Machines (si aucun groupe)"]
        nColors   = math.floor(toNum(cfg.inputs["Nb couleurs (max 12)"], 12, 1, #COLORS))
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
                header = "Group " .. gid, isGroup = true, gid = gid,
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

    -- Cibles de type groupe (les seules a recevoir une sequence FX).
    local groupTis = {}
    for ti, t in ipairs(targets) do
        if t.isGroup then groupTis[#groupTis + 1] = ti end
    end
    local nFx = #groupTis

    -- Numerotation (pools distincts, meme ID de depart -> lisible).
    local nSeq      = nTargets * nColors
    local seqEnd    = baseId + nSeq - 1         -- derniere sequence couleur
    local seqFx0    = baseId + nSeq             -- sequences FX (1 par groupe)
    local seqLast   = (nFx > 0) and (seqFx0 + nFx - 1) or seqEnd
    -- Appearances : pleine couleur (tuile ACTIVE) puis version sombre
    -- (tuile au repos), puis les utilitaires.
    local appDim0   = baseId + nColors          -- .. baseId + 2*nColors - 1
    local appDark   = baseId + 2 * nColors
    local appGrey   = baseId + 2 * nColors + 1
    local appAccent = baseId + 2 * nColors + 2  -- bouton actif (fade/FX)
    local appRed    = baseId + 2 * nColors + 3  -- barre Off All
    local appFx     = baseId + 2 * nColors + 4  -- tuiles FX
    local appEnd    = appFx
    -- Presets slots FX (pool Color) : C1/C2 reecrits par les boutons.
    local PT   = 4
    local pFx1 = baseId + nColors
    local pFx2 = baseId + nColors + 1
    -- Images (pool Images) : contours neon generes par le plugin.
    local imgC0   = baseId                      -- .. baseId + nColors - 1
    local imgGrey = baseId + nColors
    -- Macros : AUCUNE action programmer — Off All, etiquette ALL, banniere.
    local macOffAll, macAllHdr, macTitle = baseId, baseId + 1, baseId + 2
    -- Boutons de fade : 2 rangees (couleur / arret), 1 header + 1 par valeur.
    local nV          = #FADE_VALUES
    local macFadeCHdr = baseId + 3
    local macFadeC0   = baseId + 4              -- .. baseId + 3 + nV
    local macFadeOHdr = baseId + 4 + nV
    local macFadeO0   = baseId + 5 + nV         -- .. baseId + 4 + 2*nV
    -- Rangee FX (direction/etalement) : 1 header + #FX_MODES boutons.
    local mxItem      = baseId                  -- objet MAtricks partage "CPFX"
    local macFxHdr    = baseId + 5 + 2 * nV
    local macFx0      = baseId + 6 + 2 * nV     -- .. + #FX_MODES - 1
    -- Rangees FX C1 / C2 : 1 header + 1 pastille par couleur, chacune.
    local macC1Hdr    = macFx0 + #FX_MODES
    local macC1_0     = macC1Hdr + 1            -- .. + nColors - 1
    local macC2Hdr    = macC1_0 + nColors
    local macC2_0     = macC2Hdr + 1            -- .. + nColors - 1
    local macEnd      = macC2_0 + nColors - 1
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
    check("Sequence %d", baseId, seqLast)
    if detectOk and not occupied then check("Macro %d", baseId, macEnd) end
    if detectOk and not occupied then
        -- Les appearances n'ont pas d'enfants -> test d'existence.
        for no = baseId, appEnd do
            if objectExists("Appearance " .. no) then occupied = true; break end
        end
    end
    if detectOk and not occupied and objectExists("MAtricks " .. mxItem) then
        occupied = true
    end
    -- Le Layout aussi : il est supprime/recree, la confirmation doit donc
    -- le couvrir (un layout NON vide declenche le prompt).
    if detectOk and not occupied then
        local usedL = objectUsed("Layout " .. layNo)
        if usedL then occupied = true end
    end

    if occupied or not detectOk then
        local confirm = MessageBox({ title = "Color Picker LIVE",
            message = string.format(
                "Des objets existent peut-etre ici :\n"
             .. "Sequence %d -> %d\nMacro %d -> %d\nAppearance %d -> %d\n"
             .. "MAtricks CPFX\n"
             .. "(et le Layout %d sera (re)cree).\n\n"
             .. "Les PRESETS couleur (pool 4) sont conserves, jamais effaces.\n"
             .. "Tout ecraser et regenerer ?",
                baseId, seqEnd, baseId, macEnd, baseId, appEnd, layNo),
            commands = { { value = 1, name = "Ecraser" }, { value = 0, name = "Annuler" } } })
        if not confirm or confirm.result ~= 1 then return end
        Cmd(string.format('Delete Sequence %d Thru %d /NoConfirm', baseId, seqLast))
        Cmd(string.format('Delete Macro %d Thru %d /NoConfirm', baseId, macEnd))
        -- Plage MAX (#COLORS) et non nColors : une regeneration avec moins
        -- de couleurs ne doit pas laisser d'appearances orphelines (doublons
        -- de noms -> suffixes #2).
        Cmd(string.format('Delete Appearance %d Thru %d /NoConfirm',
            baseId, baseId + 2 * #COLORS + 4))
        Cmd(string.format('Delete MAtricks %d /NoConfirm', mxItem))
        Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    end

    -- 1) Appearances : pleine couleur (active) + version sombre (repos)
    --    pour chaque couleur, puis les utilitaires.
    for i, c in ipairs(colors) do
        makeAppearance(baseId + i - 1, "CP " .. c.name, c.r, c.g, c.b)
        makeAppearance(appDim0 + i - 1, "CP " .. c.name .. " Dim",
            math.floor(c.r * 0.30), math.floor(c.g * 0.30), math.floor(c.b * 0.30))
    end
    makeAppearance(appDark, "CP Dark", 36, 40, 48)
    makeAppearance(appGrey, "CP Grey", 66, 72, 84)
    makeAppearance(appAccent, "CP Fade On", 235, 238, 245)
    makeAppearance(appRed, "CP Off Red", 128, 34, 40)
    makeAppearance(appFx, "CP FX", 120, 60, 200)

    -- 1a) Images NEON : contours arrondis generes en PNG par le plugin,
    --     ecrits dans la User Image Library, importes dans le pool Images
    --     et poses sur les appearances "repos" (look reference : case
    --     sombre bordee de sa couleur, qui se remplit quand active).
    --     Chaque etape est best-effort : en cas d'echec, le board garde
    --     les fonds unis actuels.
    local imagesOk = 0
    pcall(function()
        local dir = GetPath(Enums.PathType.UserImageLibrary, true)
        local sep = "/"
        pcall(function() sep = GetPathSeparator() end)
        local function writeAndImport(imgNo, fname, r, g, b)
            local okW = pcall(function()
                local f = assert(io.open(dir .. sep .. fname, "wb"))
                f:write(tilePng(r, g, b))
                f:close()
            end)
            if not okW then return false end
            Cmd(string.format("Import Image 'Images'.%d /File '%s' /Path '%s' /NoOops",
                imgNo, fname, dir))
            local h
            pcall(function() h = ShowData().MediaPools.Images[imgNo] end)
            return h ~= nil
        end
        for i, c in ipairs(colors) do
            if writeAndImport(imgC0 + i - 1, string.format("cp_neon_%02d.png", i),
                    c.r, c.g, c.b) then
                imagesOk = imagesOk + 1
                -- Contour colore sur l'appearance "repos" de la couleur.
                Cmd(string.format('Assign Image 3.%d At Appearance %d',
                    imgC0 + i - 1, appDim0 + i - 1))
                pcall(function()
                    local a = ObjectList("Appearance " .. (appDim0 + i - 1))[1]
                    if a then a:Set("Image", ShowData().MediaPools.Images[imgC0 + i - 1]) end
                end)
            end
        end
        if writeAndImport(imgGrey, "cp_neon_grey.png", 150, 156, 168) then
            imagesOk = imagesOk + 1
            for _, appNo in ipairs({ appGrey, appDark, appFx }) do
                Cmd(string.format('Assign Image 3.%d At Appearance %d', imgGrey, appNo))
                pcall(function()
                    local a = ObjectList("Appearance " .. appNo)[1]
                    if a then a:Set("Image", ShowData().MediaPools.Images[imgGrey]) end
                end)
            end
        end
        pcall(function() SyncFS() end)
    end)

    -- 1c) Objet MAtricks partage "CPFX" (sweep) : les recipes des cues le
    --     referencent -> les boutons SWEEP changent l'effet de tout le board.
    Cmd(string.format('Store MAtricks %d /NoConfirm', mxItem))
    Cmd(string.format('Label MAtricks %d "CPFX"', mxItem))
    Cmd(string.format('Set MAtricks %d "DelayFromX" "0"', mxItem))
    Cmd(string.format('Set MAtricks %d "DelayToX" "0"', mxItem))
    Cmd(string.format('Set MAtricks %d "XWings" "1"', mxItem))

    -- 1b) Presets couleur UNIVERSELS (pool Color = 4), Preset 4.<baseId>...
    --     S'ils existent deja -> REUTILISES tels quels (tes modifs de
    --     couleur survivent aux regenerations). Sinon -> crees.
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

    -- 1d) Presets SLOTS du FX (C1 / C2) : les boutons "FX C1/C2" copient la
    --     couleur choisie DEDANS (Copy /merge) -> les recipes des sequences
    --     FX recuisent avec les nouvelles couleurs. Crees s'ils manquent
    --     (C1 = Red, C2 = Blue par defaut), jamais effaces.
    if not objectExists(string.format("Preset %d.%d", PT, pFx1)) then
        Cmd(string.format('Copy Preset %d.%d At Preset %d.%d /NoOops', PT, baseId, PT, pFx1))
    end
    if not objectExists(string.format("Preset %d.%d", PT, pFx2)) then
        Cmd(string.format('Copy Preset %d.%d At Preset %d.%d /NoOops', PT, baseId + 7, PT, pFx2))
    end
    Cmd(string.format('Label Preset %d.%d "CP FX C1"', PT, pFx1))
    Cmd(string.format('Label Preset %d.%d "CP FX C2"', PT, pFx2))

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
            -- Repos = version sombre ; la CUE porte la pleine couleur ->
            -- la tuile "se remplit" quand la sequence joue (style MA2).
            Cmd(string.format('Assign Appearance %d At Sequence %d', appDim0 + ci - 1, sq))
            Cmd(string.format('Assign Appearance %d At Sequence %d Cue 1', baseId + ci - 1, sq))
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

    -- 2b) Sequences FX (1 par groupe) : boucle 2 couleurs en RESTITUTION.
    --     Deux cues en Follow qui s'enchainent en boucle ; chaque cue est
    --     une RECIPE (API objet, pattern du generateur MA3 2.3-teste :
    --     cue:Get(1):Insert() puis Set Selection/Values par HANDLES) qui
    --     pointe le groupe + le preset SLOT (C1 ou C2) + le MAtricks CPFX.
    --     -> Changer C1/C2 (Copy dans les slots) ou le mode FX (MAtricks)
    --     change la boucle en live. Echec best-effort : sans consequence.
    local fxBuilt = 0
    for gi, ti in ipairs(groupTis) do
        local t   = targets[ti]
        local no  = seqFx0 + gi - 1
        local okFx = pcall(function()
            local pool = DataPool().Sequences
            local seq  = pool[no]
            if seq == nil then seq = pool:Create(no) end
            if seq == nil then error("Sequences:Create nil") end
            seq:Set("Name", "FX " .. t.label)
            pcall(coroutine.yield, 0.05)
            local function addCue(slotNo)
                local cue = seq:Insert()
                pcall(coroutine.yield, 0.05)
                local recipe = cue:Get(1):Insert()
                recipe:Set("Enabled", true)
                recipe:Set("Selection", DataPool().Groups[t.gid])
                recipe:Set("Values", DataPool().PresetPools["Color"][slotNo])
                pcall(function()
                    recipe:Set("MAtricks", ObjectList("MAtricks " .. mxItem)[1])
                end)
                return cue
            end
            local c1 = addCue(pFx1)
            local c2 = addCue(pFx2)
            -- Boucle : chaque cue suit la precedente, la sequence boucle.
            pcall(function() c1:Set("Trigger", "Follow") end)
            pcall(function() c2:Set("Trigger", "Follow") end)
            pcall(function()
                c1:Set("CueInFade", "1"); c2:Set("CueInFade", "1")
            end)
            pcall(function() seq:Set("WrapAround", true) end)
            pcall(function() seq:Set("OffWhenOverridden", "Yes") end)
            fxBuilt = fxBuilt + 1
        end)
        if not okFx then
            Printf("[CP] FX sequence %d (%s) : construction incomplete", no, t.label)
        end
        Cmd(string.format('Label Sequence %d "FX %s"', no, t.label))
        Cmd(string.format('Assign Appearance %d At Sequence %d', appFx, no))
        Cmd(string.format('Set Sequence %d Property "OffFade" "%s"', no, tostring(offFade)))
    end

    -- 3) Macros — aucune action programmer : Off All relache les COULEURS
    --    (playback), ALL est une simple etiquette de ligne.
    -- Le fade d'arret est mis DANS la commande Off (fiable, comme Goto Fade) ;
    -- les boutons "FADE arret" reecrivent cette ligne quand on change de valeur.
    makeMacro(macOffAll, "Off All", appRed,
        { string.format("Off Sequence %d Thru %d Fade %s", baseId, seqLast, tostring(offFade)) })
    makeMacro(macAllHdr, "ALL", appDark, {})
    makeMacro(macTitle, "C O L O R  P I C K E R", appDark, {})

    -- Boutons de fade : chaque bouton regle d'un coup toutes les sequences
    -- ET affiche l'etat courant :
    --   - le bouton actif passe en surbrillance (appAccent), les autres en
    --     gris (le tile de layout suit l'appearance de la macro) ;
    --   - le header affiche la valeur courante ("FADE couleur 2s").
    -- Libelles UNIQUES entre les deux rangees (sinon MA3 suffixe "#2") :
    -- rangee couleur = "1s", rangee arret = "1" (le header porte le sens).
    local function fadeLabel(v)
        if v == math.floor(v) then return string.format("%ds", v) end
        return tostring(v) .. "s"
    end
    local function fadeLabelO(v)
        if v == math.floor(v) then return string.format("%d", v) end
        return tostring(v)
    end
    makeMacro(macFadeCHdr, "FADE couleur " .. fadeLabel(colorFade), appDark, {})
    makeMacro(macFadeOHdr, "FADE arret "   .. fadeLabel(offFade),   appDark, {})
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
        -- Le vrai fade d'arret : reecrit la ligne du macro Off All.
        linesO[#linesO + 1] = string.format(
            'Set Macro %d.1 Property "Command" "Off Sequence %d Thru %d Fade %s"',
            macOffAll, baseId, seqLast, vs)
        -- Feedback : header + surbrillance du bouton actif.
        linesC[#linesC + 1] = string.format('Label Macro %d "FADE couleur %s"',
            macFadeCHdr, fadeLabel(v))
        linesO[#linesO + 1] = string.format('Label Macro %d "FADE arret %s"',
            macFadeOHdr, fadeLabel(v))
        for vj = 1, nV do
            linesC[#linesC + 1] = string.format('Assign Appearance %d At Macro %d',
                (vj == vi) and appAccent or appGrey, macFadeC0 + vj - 1)
            linesO[#linesO + 1] = string.format('Assign Appearance %d At Macro %d',
                (vj == vi) and appAccent or appGrey, macFadeO0 + vj - 1)
        end
        -- Etat initial : le bouton correspondant au fade par defaut est actif.
        makeMacro(macFadeC0 + vi - 1, fadeLabel(v),
            (v == colorFade) and appAccent or appGrey, linesC)
        makeMacro(macFadeO0 + vi - 1, fadeLabelO(v),
            (v == offFade) and appAccent or appGrey, linesO)
    end

    -- Rangee FX : direction / etalement de la boucle 2 couleurs. Chaque
    -- bouton reecrit l'objet MAtricks CPFX (reference par les recipes des
    -- sequences FX) + feedback comme les fades.
    makeMacro(macFxHdr, "FX " .. FX_MODES[1].lbl, appDark, {})
    for si, s in ipairs(FX_MODES) do
        local lines = {
            string.format('Set MAtricks %d "DelayFromX" "%s"', mxItem, tostring(s.from)),
            string.format('Set MAtricks %d "DelayToX" "%s"',   mxItem, tostring(s.to)),
            string.format('Set MAtricks %d "XWings" "%d"',     mxItem, s.wings),
            string.format('Label Macro %d "FX %s"', macFxHdr, s.lbl),
        }
        for sj = 1, #FX_MODES do
            lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d',
                (sj == si) and appAccent or appGrey, macFx0 + sj - 1)
        end
        makeMacro(macFx0 + si - 1, s.lbl,
            (si == 1) and appAccent or appGrey, lines)
    end

    -- Rangees FX C1 / C2 : pastilles couleur qui copient la couleur choisie
    -- dans le preset SLOT (Copy /merge, pattern 2.3-teste) -> la boucle FX
    -- recuit avec les nouvelles couleurs. Pastille choisie = remplie.
    makeMacro(macC1Hdr, "FX C1 " .. colors[1].name, appDark, {})
    makeMacro(macC2Hdr, "FX C2 " .. colors[math.min(8, nColors)].name, appDark, {})
    -- Libelles : header long ("FX C1 Red"), boutons courts ("C1 Red") ->
    -- aucun doublon de nom (sinon MA3 suffixe "#2").
    local function makeSlotRow(hdrNo, base0, slotNo, hdrName, btnPrefix, defaultCi)
        for ci, c in ipairs(colors) do
            local lines = {
                string.format('Copy Preset %d.%d At Preset %d.%d /Merge /NoOops',
                    PT, baseId + ci - 1, PT, slotNo),
                string.format('Label Preset %d.%d "CP %s"', PT, slotNo, hdrName),
                string.format('Label Macro %d "%s %s"', hdrNo, hdrName, c.name),
            }
            for cj = 1, nColors do
                lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d',
                    (cj == ci) and (baseId + cj - 1) or (appDim0 + cj - 1),
                    base0 + cj - 1)
            end
            makeMacro(base0 + ci - 1, btnPrefix .. " " .. c.name,
                (ci == defaultCi) and (baseId + ci - 1) or (appDim0 + ci - 1), lines)
        end
    end
    makeSlotRow(macC1Hdr, macC1_0, pFx1, "FX C1", "C1", 1)
    makeSlotRow(macC2Hdr, macC2_0, pFx2, "FX C2", "C2", math.min(8, nColors))

    -- 4) Layout : [machine (x2)] [couleurs...] par ligne + outils en bas.
    Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Picker LIVE"', layNo))
    -- (pas d'appearance sur le layout lui-meme : "Assign ... At Layout"
    --  ajouterait l'appearance comme case parasite dans la grille)

    local elements = {}
    local fullW = 2 + nColors + (nFx > 0 and 1 or 0)   -- + colonne FX

    -- Banniere titre, pleine largeur.
    elements[#elements + 1] = { object = "Macro " .. macTitle, x = 0, y = 0, w = fullW }

    -- Lignes machines / groupes, puis ALL. Colonne FX en bout de ligne
    -- pour les groupes (tuile "FX" = la boucle 2 couleurs du groupe).
    local rowTop = 1.3
    local fxOfTi = {}
    for gi, ti in ipairs(groupTis) do fxOfTi[ti] = seqFx0 + gi - 1 end
    for ti, t in ipairs(targets) do
        local row = rowTop + (ti - 1)
        if t.header then
            elements[#elements + 1] = { object = t.header, x = 0, y = row, w = 2 }
        else
            elements[#elements + 1] = { object = "Macro " .. macAllHdr, x = 0, y = row, w = 2 }
        end
        for ci = 1, nColors do
            elements[#elements + 1] = {
                object = "Sequence " .. seqNoOf(ti, ci),
                x = 2 + ci - 1, y = row, play = true, clean = true,
            }
        end
        if fxOfTi[ti] then
            elements[#elements + 1] = {
                object = "Sequence " .. fxOfTi[ti],
                x = 2 + nColors, y = row, play = true, clean = true, text = "FX",
            }
        end
    end

    -- Barre Off All pleine largeur (rouge sombre), puis rangees FADE,
    -- puis bloc FX (direction + choix C1 / C2), colonnes alignees.
    local yOff = rowTop + nTargets + 0.3
    local fy1  = yOff + 1.3
    local fy2  = fy1 + 1
    local fy3  = fy2 + 1.3
    local fy4  = fy3 + 1
    local fy5  = fy4 + 1
    elements[#elements + 1] = { object = "Macro " .. macOffAll, x = 0, y = yOff, w = fullW }
    elements[#elements + 1] = { object = "Macro " .. macFadeCHdr, x = 0, y = fy1, w = 2 }
    elements[#elements + 1] = { object = "Macro " .. macFadeOHdr, x = 0, y = fy2, w = 2 }
    for vi = 1, nV do
        elements[#elements + 1] = { object = "Macro " .. (macFadeC0 + vi - 1), x = 2 + vi - 1, y = fy1 }
        elements[#elements + 1] = { object = "Macro " .. (macFadeO0 + vi - 1), x = 2 + vi - 1, y = fy2 }
    end
    -- Bloc FX : direction, puis pastilles C1 et C2.
    elements[#elements + 1] = { object = "Macro " .. macFxHdr, x = 0, y = fy3, w = 2 }
    for si = 1, #FX_MODES do
        elements[#elements + 1] = { object = "Macro " .. (macFx0 + si - 1), x = 2 + si - 1, y = fy3 }
    end
    elements[#elements + 1] = { object = "Macro " .. macC1Hdr, x = 0, y = fy4, w = 2 }
    elements[#elements + 1] = { object = "Macro " .. macC2Hdr, x = 0, y = fy5, w = 2 }
    for ci = 1, nColors do
        elements[#elements + 1] = { object = "Macro " .. (macC1_0 + ci - 1),
            x = 2 + ci - 1, y = fy4, clean = true }
        elements[#elements + 1] = { object = "Macro " .. (macC2_0 + ci - 1),
            x = 2 + ci - 1, y = fy5, clean = true }
    end

    -- Le layout MA3 rend l'axe Y vers le HAUT : on inverse les Y pour
    -- afficher le board dans l'ordre concu (titre en haut, FX en bas).
    for _, e in ipairs(elements) do e.y = fy5 - e.y end

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
     .. "en restitution, et la tuile SE REMPLIT (sombre au repos, pleine\n"
     .. "couleur quand elle joue). Retape / autre couleur pour changer.\n"
     .. "Rangees FADE en bas : le bouton ACTIF est surligne en blanc et\n"
     .. "le titre affiche la valeur courante (ex: FADE couleur 2s).\n"
     .. "FX (lignes de groupes) : choisis C1 et C2 en bas, un mode\n"
     .. "(J>C / C>J / SYM), puis tape la tuile FX d'une ligne -> boucle\n"
     .. "2 couleurs qui balaie le groupe, en restitution. (%d FX construites)\n"
     .. "COULEURS PAS A TON GOUT ? Modifie le Preset 4.x (pool Color) ->\n"
     .. "tout le board suit. Regenerer ne touche jamais tes presets.\n"
     .. "AUCUNE action de ce board ne touche le programmer.",
        nTargets, (groupIds and "groupes" or "machines"), nColors,
        baseId, baseId + nColors - 1, presetsCreated, presetsReused,
        baseId, seqLast,
        tostring(colorFade), tostring(offFade),
        layNo, placed, placed + failed, note, fxBuilt)

    MessageBox({ title = "Color Picker LIVE", message = msg,
        commands = { { value = 1, name = "Super !" } } })
    Printf("[ColorPickerLive] %d lignes x %d couleurs = %d sequences, layout %d : %d/%d cases.",
        nTargets, nColors, nSeq, layNo, placed, placed + failed)
end

return main
