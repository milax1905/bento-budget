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
--  - Look "neon" : images PNG generees par le plugin (contour arrondi au
--    repos, pave arrondi PLEIN quand la sequence joue), tuiles nettoyees
--    (ni icone, ni barre, ni bordure).
--  - La case de gauche est la VRAIE fixture (ou le groupe) : icone,
--    nom, couleur live. La taper selectionne la machine.
--  - "Off When Overridden" : changer de couleur relache l'ancienne ->
--    une seule tuile allumee par ligne (comportement radio).
--  - FX : sur chaque ligne de groupe, une tuile FX lance une boucle
--    C1<->C2 (2 cues en Follow + WrapAround, delay reparti sur le groupe
--    = balayage jardin->cour). Pastilles C1/C2 en bas (Copy /Merge dans
--    des presets slots references par les cues -> re-teinte en live).
--    Chaque cue couleur coupe la boucle FX de sa ligne (CMD de cue) :
--    la couleur reprend TOUJOURS la main sur l'effet.
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

-- Balayage du FX : delay individuel reparti sur le groupe (jardin -> cour,
-- dans l'ordre des fixtures du groupe), en secondes.
local FX_SWEEP = 1

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

-- filled=false : contour plein + centre presque transparent (repos).
-- filled=true  : pave arrondi entierement rempli (actif).
local function tilePng(r, g, b, filled)
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
            elseif filled then a = 255
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
            -- Pastilles couleur : RIEN d'autre que l'image (look reference,
            -- la couleur seule parle). Proprietes CONFIRMEES par les fichiers
            -- UI de MA3 (layout_element_editor.uixml) : Visibility* = Hidden.
            -- Icone, barre-temoin et bordure aussi : l'etat "actif" est
            -- montre par le remplissage de la tuile, pas par des artefacts.
            if e.clean then
                for _, prop in ipairs({
                    "VisibilityObjectName", "VisibilityID", "VisibilityCID",
                    "VisibilityBar", "VisibilityValue", "VisibilityIcon",
                    "VisibilityIndicatorBar", "VisibilityBorder",
                }) do
                    pcall(function() elem:Set(prop, "Hidden") end)
                end
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
    local appAccent = baseId + 2 * nColors + 2  -- bouton actif (fade)
    local appRed    = baseId + 2 * nColors + 3  -- barre Off All
    local appFx     = baseId + 2 * nColors + 4  -- tuile FX au repos
    local appFxOn   = baseId + 2 * nColors + 5  -- tuile FX active (remplie)
    local appEnd    = appFxOn
    -- Presets slots FX (pool Color) : C1/C2 reecrits par les boutons.
    local PT   = 4
    local pFx1 = baseId + nColors
    local pFx2 = baseId + nColors + 1
    -- Images (pool Images) : tuiles neon generees par le plugin.
    -- Contour = repos, pave rempli arrondi = actif.
    local imgC0   = baseId                      -- contours .. + nColors - 1
    local imgGrey = baseId + nColors
    local imgF0   = baseId + nColors + 1        -- remplies .. + 2*nColors
    local imgFxO  = baseId + 2 * nColors + 1    -- contour violet (FX repos)
    local imgFxF  = baseId + 2 * nColors + 2    -- violet rempli (FX actif)
    -- Macros : AUCUNE action programmer — Off All, etiquette ALL, banniere.
    local macOffAll, macAllHdr, macTitle = baseId, baseId + 1, baseId + 2
    -- Boutons de fade : 2 rangees (couleur / arret), 1 header + 1 par valeur.
    local nV          = #FADE_VALUES
    local macFadeCHdr = baseId + 3
    local macFadeC0   = baseId + 4              -- .. baseId + 3 + nV
    local macFadeOHdr = baseId + 4 + nV
    local macFadeO0   = baseId + 5 + nV         -- .. baseId + 4 + 2*nV
    -- Rangees FX C1 / C2 : 1 header + 1 pastille par couleur, chacune.
    local macC1Hdr    = baseId + 5 + 2 * nV
    local macC1_0     = macC1Hdr + 1            -- .. + nColors - 1
    local macC2Hdr    = macC1_0 + nColors
    local macC2_0     = macC2Hdr + 1            -- .. + nColors - 1
    local macEnd      = macC2_0 + nColors - 1
    local function seqNoOf(ti, ci) return baseId + (ti - 1) * nColors + (ci - 1) end
    -- Sequence FX de chaque ligne de groupe (nil pour ALL / machines).
    local fxNoOfTi = {}
    for gi, ti in ipairs(groupTis) do fxNoOfTi[ti] = seqFx0 + gi - 1 end

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
    -- (MAtricks "CPFX" : reliquat des anciennes versions -> nettoye aussi.)
    if detectOk and not occupied and objectExists("MAtricks " .. baseId) then
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
            baseId, baseId + 2 * #COLORS + 5))
        Cmd(string.format('Delete MAtricks %d /NoConfirm', baseId))
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
    makeAppearance(appFx, "CP FX", 140, 80, 220)
    makeAppearance(appFxOn, "CP FX On", 140, 80, 220)

    -- 1a) Images NEON : tuiles arrondies generees en PNG par le plugin,
    --     ecrites dans la User Image Library, importees dans le pool Images
    --     et posees sur les appearances (look reference : case sombre
    --     bordee de sa couleur au repos, PAVE ARRONDI PLEIN quand active —
    --     pas un rectangle brut). Le fond de l'appearance passe en alpha 0
    --     des que l'image est en place, pour que les coins restent ronds.
    --     Chaque etape est best-effort : en cas d'echec, le board garde
    --     les fonds unis.
    local imagesOk = 0
    pcall(function()
        local dir = GetPath(Enums.PathType.UserImageLibrary, true)
        local sep = "/"
        pcall(function() sep = GetPathSeparator() end)
        local function writeAndImport(imgNo, fname, r, g, b, filled)
            local okW = pcall(function()
                local f = assert(io.open(dir .. sep .. fname, "wb"))
                f:write(tilePng(r, g, b, filled))
                f:close()
            end)
            if not okW then return false end
            Cmd(string.format("Import Image 'Images'.%d /File '%s' /Path '%s' /NoOops",
                imgNo, fname, dir))
            local h
            pcall(function() h = ShowData().MediaPools.Images[imgNo] end)
            return h ~= nil
        end
        local function attach(imgNo, appNo)
            Cmd(string.format('Assign Image 3.%d At Appearance %d', imgNo, appNo))
            Cmd(string.format('Set Appearance %d Property "BackAlpha" "0"', appNo))
            pcall(function()
                local a = ObjectList("Appearance " .. appNo)[1]
                if a then
                    a:Set("Image", ShowData().MediaPools.Images[imgNo])
                    a:Set("BackAlpha", "0")
                end
            end)
        end
        for i, c in ipairs(colors) do
            -- Contour colore = repos (appearance sombre).
            if writeAndImport(imgC0 + i - 1, string.format("cp_neon_%02d.png", i),
                    c.r, c.g, c.b, false) then
                imagesOk = imagesOk + 1
                attach(imgC0 + i - 1, appDim0 + i - 1)
            end
            -- Pave arrondi rempli = actif (appearance pleine couleur,
            -- posee sur les CUES et les pastilles C1/C2 choisies).
            if writeAndImport(imgF0 + i - 1, string.format("cp_fill_%02d.png", i),
                    c.r, c.g, c.b, true) then
                imagesOk = imagesOk + 1
                attach(imgF0 + i - 1, baseId + i - 1)
            end
        end
        if writeAndImport(imgGrey, "cp_neon_grey.png", 150, 156, 168, false) then
            imagesOk = imagesOk + 1
            attach(imgGrey, appGrey)
        end
        if writeAndImport(imgFxO, "cp_neon_fx.png", 140, 80, 220, false) then
            imagesOk = imagesOk + 1
            attach(imgFxO, appFx)
        end
        if writeAndImport(imgFxF, "cp_fill_fx.png", 140, 80, 220, true) then
            imagesOk = imagesOk + 1
            attach(imgFxF, appFxOn)
        end
        pcall(function() SyncFS() end)
    end)

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
    --     couleur choisie DEDANS (Copy /Merge) -> les cues FX, qui
    --     REFERENCENT ces slots, changent de couleurs instantanement.
    --     Crees s'ils manquent (C1 = Red, C2 = Blue par defaut), jamais
    --     effaces. (Uniquement si des groupes existent : le FX est par groupe.)
    if nFx > 0 then
        if not objectExists(string.format("Preset %d.%d", PT, pFx1)) then
            Cmd(string.format('Copy Preset %d.%d At Preset %d.%d /NoOops', PT, baseId, PT, pFx1))
        end
        if not objectExists(string.format("Preset %d.%d", PT, pFx2)) then
            Cmd(string.format('Copy Preset %d.%d At Preset %d.%d /NoOops',
                PT, baseId + math.min(7, nColors - 1), PT, pFx2))
        end
        Cmd(string.format('Label Preset %d.%d "CP FX C1"', PT, pFx1))
        Cmd(string.format('Label Preset %d.%d "CP FX C2"', PT, pFx2))
    end

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
            -- CRUCIAL : une boucle FX re-affirme ses valeurs (LTP) a chaque
            -- cue Follow -> elle "reprendrait" la main juste apres le tap.
            -- La cue couleur porte donc une COMMANDE qui coupe la boucle FX
            -- de sa ligne (ALL coupe toutes les boucles). Sans ca, les
            -- tuiles couleur semblent mortes tant qu'un FX tourne.
            local offFx
            if fxNoOfTi[ti] then
                offFx = string.format("Off Sequence %d Fade 1", fxNoOfTi[ti])
            elseif nFx > 0 then
                offFx = string.format("Off Sequence %d Thru %d Fade 1", seqFx0, seqLast)
            end
            if offFx then
                Cmd(string.format('Set Sequence %d Cue 1 Property "Command" "%s"', sq, offFx))
                pcall(function()
                    local cueObj = ObjectList(string.format("Sequence %d Cue 1", sq))[1]
                    if cueObj then cueObj:Set("Command", offFx) end
                end)
            end
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

    -- 2b) Sequences FX (1 par groupe) : boucle 2 couleurs en RESTITUTION,
    --     construite par COMMANDES (le seul chemin valide sur la console
    --     de bout en bout — l'API objet recipes ne construisait rien) :
    --       cue 1 = groupe At Preset SLOT C1, cue 2 = SLOT C2,
    --       delay individuel 0 -> FX_SWEEP reparti sur le groupe
    --       (balayage jardin -> cour, ordre des fixtures du groupe),
    --       les deux cues en Trigger Follow + WrapAround -> boucle infinie.
    --     Les cues referencent les presets slots -> les pastilles C1/C2
    --     (Copy /Merge) re-teintent la boucle meme en cours de route.
    local fxBuilt = 0
    for gi, ti in ipairs(groupTis) do
        local t  = targets[ti]
        local no = seqFx0 + gi - 1
        for k, slot in ipairs({ pFx1, pFx2 }) do
            Cmd("ClearAll")
            Cmd(t.sel)
            Cmd(string.format('At Preset %d.%d', PT, slot))
            -- Balayage : delay individuel reparti sur la selection.
            Cmd(string.format("Delay 0 Thru %s", tostring(FX_SWEEP)))
            Cmd(string.format('Store Sequence %d Cue %d /NoConfirm', no, k))
            Cmd(string.format('Set Sequence %d Cue %d Property "CueInFade" "1"', no, k))
            Cmd(string.format('Set Sequence %d Cue %d Property "Trigger" "Follow"', no, k))
            -- Tuile FX remplie (violet) tant que la boucle tourne.
            Cmd(string.format('Assign Appearance %d At Sequence %d Cue %d', appFxOn, no, k))
        end
        Cmd(string.format('Label Sequence %d "FX %s"', no, t.label))
        Cmd(string.format('Assign Appearance %d At Sequence %d', appFx, no))
        Cmd(string.format('Set Sequence %d Property "WrapAround" "Yes"', no))
        Cmd(string.format('Set Sequence %d Property "OffFade" "%s"', no, tostring(offFade)))
        Cmd(string.format('Set Sequence %d Property "OffWhenOverridden" "Yes"', no))
        pcall(function()
            local s = ObjectList("Sequence " .. no)[1]
            if s then
                for _, cueIdx in ipairs({ 1, 2 }) do
                    pcall(function()
                        local cue = ObjectList(string.format("Sequence %d Cue %d", no, cueIdx))[1]
                        if cue then cue:Set("Trigger", "Follow") end
                    end)
                end
                pcall(function() s:Set("WrapAround", "Yes") end)
                s:Set("OffFade", tostring(offFade))
                s:Set("OffWhenOverridden", "Yes")
            end
        end)
        if objectExists(string.format("Sequence %d Cue 2", no)) then
            fxBuilt = fxBuilt + 1
        else
            Printf("[CP] FX sequence %d (%s) : construction incomplete", no, t.label)
        end
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

    -- Rangees FX C1 / C2 : pastilles couleur qui copient la couleur choisie
    -- dans le preset SLOT (Copy /Merge, pattern 2.3-teste) -> la boucle FX
    -- se re-teinte avec les nouvelles couleurs. Pastille choisie = remplie.
    -- Libelles : header long ("FX C1 Red"), boutons courts ("C1 Red") ->
    -- aucun doublon de nom (sinon MA3 suffixe "#2").
    if nFx > 0 then
        makeMacro(macC1Hdr, "FX C1 " .. colors[1].name, appDark, {})
        makeMacro(macC2Hdr, "FX C2 " .. colors[math.min(8, nColors)].name, appDark, {})
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
    end

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
        if fxNoOfTi[ti] then
            elements[#elements + 1] = {
                object = "Sequence " .. fxNoOfTi[ti],
                x = 2 + nColors, y = row, play = true, clean = true, text = "FX",
            }
        end
    end

    -- Barre Off All pleine largeur (rouge sombre), puis rangees FADE,
    -- puis pastilles C1 / C2 du FX, colonnes alignees.
    local yOff = rowTop + nTargets + 0.3
    local fy1  = yOff + 1.3
    local fy2  = fy1 + 1
    elements[#elements + 1] = { object = "Macro " .. macOffAll, x = 0, y = yOff, w = fullW }
    elements[#elements + 1] = { object = "Macro " .. macFadeCHdr, x = 0, y = fy1, w = 2 }
    elements[#elements + 1] = { object = "Macro " .. macFadeOHdr, x = 0, y = fy2, w = 2 }
    for vi = 1, nV do
        elements[#elements + 1] = { object = "Macro " .. (macFadeC0 + vi - 1), x = 2 + vi - 1, y = fy1 }
        elements[#elements + 1] = { object = "Macro " .. (macFadeO0 + vi - 1), x = 2 + vi - 1, y = fy2 }
    end
    -- Pastilles C1 / C2 (seulement si des lignes de groupes ont un FX).
    local yBottom = fy2
    if nFx > 0 then
        local fy3 = fy2 + 1.3
        local fy4 = fy3 + 1
        elements[#elements + 1] = { object = "Macro " .. macC1Hdr, x = 0, y = fy3, w = 2 }
        elements[#elements + 1] = { object = "Macro " .. macC2Hdr, x = 0, y = fy4, w = 2 }
        for ci = 1, nColors do
            elements[#elements + 1] = { object = "Macro " .. (macC1_0 + ci - 1),
                x = 2 + ci - 1, y = fy3, clean = true }
            elements[#elements + 1] = { object = "Macro " .. (macC2_0 + ci - 1),
                x = 2 + ci - 1, y = fy4, clean = true }
        end
        yBottom = fy4
    end

    -- Le layout MA3 rend l'axe Y vers le HAUT : on inverse les Y pour
    -- afficher le board dans l'ordre concu (titre en haut, FX en bas).
    for _, e in ipairs(elements) do e.y = yBottom - e.y end

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
     .. "en restitution, et la tuile SE REMPLIT (contour au repos, pave\n"
     .. "plein quand elle joue). Autre couleur pour changer.\n"
     .. "Rangees FADE en bas : le bouton ACTIF est surligne en blanc et\n"
     .. "le titre affiche la valeur courante (ex: FADE couleur 2s).\n"
     .. "FX (bout des lignes de groupes) : tape FX -> boucle C1<->C2 qui\n"
     .. "balaie le groupe (jardin->cour) en restitution. Choisis C1 / C2\n"
     .. "avec les pastilles du bas (meme en cours de boucle). Taper une\n"
     .. "couleur reprend la main et coupe le FX de la ligne.\n"
     .. "(%d boucle(s) FX construite(s))\n"
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
