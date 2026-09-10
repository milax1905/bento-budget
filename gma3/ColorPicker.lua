-- =====================================================================
--  Color Picker LIVE  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Un color picker de busking, construit comme le font les pupitreurs :
--
--      LIGNE            COULEURS (tuiles tappables) ->            FX ->
--    [ ALL        ]   [Red][Orange][Amber] ... [White]
--    [ SPOT       ]   [Red][Orange][Amber] ... [White]   [J>C][C>J][SYM]
--    [ WASH       ]   [Red][Orange][Amber] ... [White]   [J>C][C>J][SYM]
--    [============== Off All (barre rouge) ===============]
--    [FADE couleur] [0s][0.5s][1s][2s][3s][4s]   (bouton actif surligne)
--    [FADE arret  ] [0][0.5][1][2][3][4]
--    [FX C1 <col> ] [pastilles couleur]   -> couleur 1 de la boucle
--    [FX C2 <col> ] [pastilles couleur]   -> couleur 2 de la boucle
--    + banniere titre en haut (l'axe Y du layout est inverse a la fin).
--
--  MECANIQUE (v7) — tout le board est fait de MACROS :
--  - Chaque tuile est une MACRO qui (1) lance la sequence couleur en
--    RESTITUTION (Goto ... Fade), (2) coupe le FX de sa ligne, (3)
--    repeint les appearances de la ligne -> la tuile tapee SE REMPLIT,
--    les autres redeviennent des contours. C'est exactement le mecanisme
--    des pastilles FX C1/C2, valide sur console.
--    (Une tuile-sequence, elle, ne peut PAS se remplir avec l'image :
--     la console ne prend que la COULEUR de fond de l'appearance de cue,
--     d'ou l'ancienne "case pleine" moche.)
--  - Look "neon" : images PNG generees par le plugin (contour arrondi au
--    repos, pave arrondi PLEIN quand actif), tuiles nettoyees (ni icone,
--    ni barre, ni bordure).
--  - "Off When Overridden" sur les sequences : la couleur precedente se
--    relache toute seule -> une seule tuile allumee par ligne.
--  - FX : 3 tuiles par ligne de groupe = 3 SENS de balayage
--    (J>C jardin->cour, C>J cour->jardin, SYM symetrique). Chacune lance
--    une boucle C1<->C2 (2 cues en Follow + WrapAround) dont le delay
--    individuel est reparti sur le groupe. Les pastilles C1/C2 re-teintent
--    la boucle en live (Copy /Merge dans deux presets slots).
--  - AUCUNE action du board ne touche le programmer (seule la GENERATION
--    l'utilise, apres confirmation, et le rend propre).
--
--  NB : apres toute modification de ce fichier -> "ReloadAllPlugins" (RP).
-- =====================================================================

-- Palette en ordre ARC-EN-CIEL (blanc en dernier). Chaque couleur a deux
-- appearances : contour (repos) et pleine (tuile active -> "se remplit").
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
local MAX_GROUP_ROWS   = 12   -- limite de lignes de groupes (board lisible)

-- Valeurs proposees par les boutons de fade (secondes).
local FADE_VALUES = { 0, 0.5, 1, 2, 3, 4 }

-- Etalement du balayage FX (secondes) : delay individuel reparti sur le
-- groupe, dans l'ordre des fixtures.
local FX_SWEEP = 1

-- Sens du balayage : une sequence FX par sens et par groupe.
--   J = jardin (debut du groupe), C = cour (fin du groupe).
--   fan  = forme du delay individuel le long du groupe.
--   fb   = commande de repli si on ne peut pas enumerer les fixtures.
local FX_DIRS = {
    { lbl = "J>C", fan = "fwd", fb = "Delay 0 Thru %s" },
    { lbl = "C>J", fan = "rev", fb = "Delay %s Thru 0" },
    { lbl = "SYM", fan = "sym", fb = "Delay 0 Thru %s" },
}

-- Position du delay (0..1) de la i-eme machine d'un groupe de n.
local function fanFactor(fan, i, n)
    if n < 2 then return 0 end
    if fan == "rev" then return (n - i) / (n - 1) end
    if fan == "sym" then
        -- symetrique : les extremites a 0, le centre au maximum.
        local d   = math.min(i - 1, n - i)
        local mid = math.floor((n - 1) / 2)
        return (mid > 0) and (d / mid) or 0
    end
    return (i - 1) / (n - 1)             -- "fwd" : jardin -> cour
end

-- Nombre decimal propre pour la ligne de commande ("0.4", "1", "0").
local function fmtNum(v)
    local s = string.format("%.2f", v)
    s = s:gsub("0+$", ""):gsub("%.$", "")
    return (s == "" or s == "-0") and "0" or s
end

-- ------------------- generateur d'images "neon" ----------------------
-- PNG pur Lua (sans compression : blocs deflate "stored") : tuile a
-- coins arrondis, soit en contour, soit pleine. Valide octet par octet
-- hors console.

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
    -- accepte la virgule decimale ("0,5") — pupitre en francais
    local n = tonumber((tostring(value or ""):gsub(",", "."))) or default
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
            -- borne : plage remise a l'endroit, largeur et IDs plafonnes
            -- (sinon "1 Thru 100000000" gele la console).
            local a2, b2 = tonumber(a), tonumber(b)
            if a2 > b2 then a2, b2 = b2, a2 end
            a2 = math.min(a2, 100000)
            b2 = math.min(b2, a2 + 999, 100000)
            for i = a2, b2 do ids[#ids + 1] = i end
        else
            local n = token:match("^(%d+)$")
            if n then ids[#ids + 1] = math.min(tonumber(n), 100000) end
        end
        if #ids > 1000 then break end
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
    -- Sanitise : un guillemet ou un point casserait les commandes.
    if nm and tostring(nm) ~= "" then
        return (tostring(nm):gsub('["%.]', ""))
    end
    return "Group " .. gid
end

-- Laisse respirer la console entre deux gros blocs de construction.
local function breathe()
    pcall(coroutine.yield, 0)
end

-- Machines de la selection courante, RANGEES DE JARDIN A COUR : c'est ce
-- qui definit le sens d'un balayage.
--   ATTENTION : SelectionFirst()/SelectionNext() renvoient un index de
--   SUBFIXTURE (index de patch interne), PAS un numero de machine — il
--   faut passer par GetSubfixture(idx) pour obtenir le FID (ou l'adresse
--   d'une cellule). Ils renvoient aussi la position dans la grille de
--   selection (gridX) : c'est l'ordre que MA3 utilise lui-meme pour
--   etaler une valeur sur une selection, donc on trie dessus.
-- Renvoie nil si l'API n'est pas disponible sur ce build (-> repli sur le
-- fan "Delay a Thru b").
local function selectionAddrs(cap)
    local out, seen = {}, {}
    local hitCap = false
    local ok = pcall(function()
        local idx, gx = SelectionFirst()
        local rank = 0
        while idx ~= nil do
            if #out >= cap then hitCap = true; break end
            rank = rank + 1
            local addr
            pcall(function()
                local sf = GetSubfixture(idx)
                if not sf then return end
                local fid = sf.FID or sf.fid
                if fid and tonumber(fid) then
                    addr = string.format("Fixture %d", math.floor(tonumber(fid)))
                elseif sf.ToAddr then
                    -- cellule (subfixture) : "Fixture 301.1"
                    local a = tostring(sf:ToAddr() or "")
                    if a ~= "" then
                        addr = a:match("^Fixture ") and a or ("Fixture " .. a)
                    end
                end
            end)
            if addr and not seen[addr] then
                seen[addr] = true
                out[#out + 1] = { addr = addr, x = tonumber(gx) or 0, rank = rank }
            end
            idx, gx = SelectionNext(idx)
        end
    end)
    -- Groupe enorme : construire le balayage machine par machine couterait
    -- des milliers de commandes -> on repasse sur le fan par plage.
    if hitCap then return nil end
    if not ok or #out < 2 then return nil end
    table.sort(out, function(a, b)
        if a.x ~= b.x then return a.x < b.x end
        return a.rank < b.rank
    end)
    local addrs = {}
    for i, e in ipairs(out) do addrs[i] = e.addr end
    return addrs
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

-- Fade d'entree d'une cue : dans le modele MA3 la propriete vit sur la
-- PART 0 de la cue -> double ecriture, commande cue-level + handle Part 0
-- (best-effort, l'une des deux passe selon le build).
local function setCueFade(sq, cueNo, sec)
    Cmd(string.format('Set Sequence %d Cue %d Property "CueInFade" "%s"',
        sq, cueNo, tostring(sec)))
    pcall(function()
        local part = ObjectList(string.format("Sequence %d Cue %d Part 0", sq, cueNo))[1]
        if part then part:Set("CueInFade", tostring(sec)) end
    end)
end

-- Commandes de restitution (aucune ne touche le programmer).
-- Goto = saut direct a la cue 1 avec un fondu (syntaxe manuel 2.4 :
-- "Goto [Object] ... (Fade [Fade_Time])"). Parfait pour une sequence
-- couleur a UNE cue.
local function gotoCmd(sq, fade)
    return string.format("Goto Sequence %d Cue 1 Fade %s", sq, tostring(fade))
end

-- ATTENTION : "Goto" ne declenche PAS les cues suivantes en Follow — seul
-- "Go+" enchaine les cues follow/timed (manuel : Play Back Cues). Les
-- boucles FX doivent donc partir avec Go+, sinon elles restent bloquees
-- sur la cue 1.
local function goPlusCmd(sq)
    return string.format("Go+ Sequence %d", sq)
end

local function offCmd(a, b, fade)
    if b and b > a then
        return string.format("Off Sequence %d Thru %d Fade %s", a, b, tostring(fade))
    end
    return string.format("Off Sequence %d Fade %s", a, tostring(fade))
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

    -- Decor d'un element de layout : tout est masquable par
    -- Visibility<X> = "Hidden" (enum LayoutVisibility). On ne touche PAS
    -- a "VisibilityElement" (ce serait cacher la case elle-meme).
    local HIDE_DECOR = {
        "VisibilityID", "VisibilityCID", "VisibilityBar", "VisibilityValue",
        "VisibilityIcon", "VisibilityIndicatorBar", "VisibilityBorder",
    }

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
            -- Taper une case de macro DOIT lancer la macro. La propriete
            -- s'appelle "Action" (ni "PlaybackFunction" ni "Function", qui
            -- n'existent pas) et sa valeur par defaut depend du profil
            -- utilisateur -> on la pose explicitement.
            if e.object:match("^Macro ") then
                pcall(function() elem:Set("Action", "Go+") end)
            elseif e.inert then
                -- En-tete de ligne : c'est le vrai objet Group/Fixture (on
                -- voit sa couleur live), mais taper dessus ne doit RIEN
                -- faire — sinon un coup de pouce selectionne le groupe dans
                -- le programmer en plein show.
                pcall(function() elem:Set("Action", "None") end)
            end
            -- Toutes les cases du board : pas de decor (icone, barres,
            -- bordure, ID...). L'etat "actif" est montre par l'image.
            if e.clean or e.noicon then
                for _, prop in ipairs(HIDE_DECOR) do
                    pcall(function() elem:Set(prop, "Hidden") end)
                end
                -- Le voile "selection relevance" a son propre enum
                -- (Off / Background) : "Hidden" n'y voudrait rien dire.
                pcall(function() elem:Set("VisibilitySelectionRelevance", "Off") end)
            end
            -- Pastilles couleur : meme pas le nom (la couleur seule parle).
            if e.clean then
                pcall(function() elem:Set("VisibilityObjectName", "Hidden") end)
            end
            -- Texte personnalise par-dessus une tuile sans nom (ex. "J>C").
            if e.text then
                pcall(function()
                    elem:Set("CustomTextText", e.text)
                    elem:Set("CustomTextSize", e.textSize or 16)
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
    -- Il faut des fixtures. Detection SANS toucher au programmer :
    -- annuler le dialogue doit etre un vrai no-op.
    if not scanFixtures(200, 1) then
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
         .. "3 tuiles FX par groupe (J>C / C>J / SYM),\n"
         .. "tout en restitution (fondu %ds), sans programmer.\n"
         .. "Objets ranges a partir du %d, Layout %d.\n"
         .. "NB : la GENERATION, elle, passe par le programmer et prend\n"
         .. "quelques dizaines de secondes — a faire avant le show.",
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
        if #groupIds > MAX_GROUP_ROWS then
            truncated = true
            while #groupIds > MAX_GROUP_ROWS do table.remove(groupIds) end
        end
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

    -- Labels UNIQUES entre lignes : deux groupes au meme nom (ou un groupe
    -- nomme "ALL") donneraient des labels de sequences identiques -> MA3
    -- suffixerait "#2". On suffixe par le numero de groupe a la place.
    local seenLbl = { ALL = true }
    for ti = 2, nTargets do
        local t = targets[ti]
        if seenLbl[t.label] then
            t.label = t.label .. " " .. tostring(t.gid or ti)
        end
        seenLbl[t.label] = true
    end

    -- Cibles de type groupe (les seules a recevoir des sequences FX).
    local groupTis = {}
    for ti, t in ipairs(targets) do
        if t.isGroup then groupTis[#groupTis + 1] = ti end
    end
    local nFx  = #groupTis
    local nDir = #FX_DIRS

    -- ------------------------- numerotation --------------------------
    -- Les numeros derives des couleurs utilisent NC = #COLORS (capacite
    -- MAX), PAS nColors : regenerer avec un autre nombre de couleurs ne
    -- doit JAMAIS decaler un slot (sinon les presets slots FX, jamais
    -- effaces, atterriraient sur les presets couleur du run precedent).
    local NC = #COLORS
    local nV = #FADE_VALUES

    -- Sequences : couleurs, puis 3 sequences FX par groupe (1 par sens).
    local nSeq    = nTargets * nColors
    local seqEnd  = baseId + nSeq - 1
    local seqFx0  = baseId + nSeq
    local seqLast = (nFx > 0) and (seqFx0 + nFx * nDir - 1) or seqEnd
    local function seqColor(ti, ci) return baseId + (ti - 1) * nColors + (ci - 1) end
    local function seqFx(gi, di)    return seqFx0 + (gi - 1) * nDir + (di - 1) end

    -- Appearances : pleine (active) / contour (repos) par couleur, puis
    -- les utilitaires.
    local function appOn(ci)  return baseId + ci - 1 end
    local function appOff(ci) return baseId + NC + ci - 1 end
    local appDark   = baseId + 2 * NC        -- headers, banniere (a plat)
    local appGrey   = baseId + 2 * NC + 1    -- bouton fade au repos
    local appAccent = baseId + 2 * NC + 2    -- bouton fade actif (rempli)
    local appRed    = baseId + 2 * NC + 3    -- barre Off All (a plat)
    local appFx     = baseId + 2 * NC + 4    -- tuile FX au repos
    local appFxOn   = baseId + 2 * NC + 5    -- tuile FX active (remplie)

    -- Presets : couleurs universelles + 2 slots FX (adresses STABLES).
    local PT   = 4
    local pFx1 = baseId + NC
    local pFx2 = baseId + NC + 1

    -- Images : contours, puis pleines, puis utilitaires.
    local function imgOut(ci)  return baseId + ci - 1 end
    local function imgFill(ci) return baseId + NC + ci - 1 end
    local imgGrey = baseId + 2 * NC
    local imgAcc  = baseId + 2 * NC + 1
    local imgFxO  = baseId + 2 * NC + 2
    local imgFxF  = baseId + 2 * NC + 3

    -- Macros : outils, rangees FADE, pastilles C1/C2, puis TOUTES les
    -- tuiles du board (couleurs + FX).
    local macOffAll, macAllHdr, macTitle = baseId, baseId + 1, baseId + 2
    local macFadeCHdr = baseId + 3
    local macFadeC0   = baseId + 4                  -- .. baseId + 3 + nV
    local macFadeOHdr = baseId + 4 + nV
    local macFadeO0   = baseId + 5 + nV             -- .. baseId + 4 + 2*nV
    local macC1Hdr    = baseId + 5 + 2 * nV
    local macC1_0     = macC1Hdr + 1                -- .. + NC - 1
    local macC2Hdr    = macC1_0 + NC
    local macC2_0     = macC2Hdr + 1                -- .. + NC - 1
    local macTile0    = macC2_0 + NC                -- tuiles couleur
    local macFx0      = macTile0 + nTargets * nColors
    local macEnd      = (nFx > 0) and (macFx0 + nFx * nDir - 1)
                                  or (macTile0 + nTargets * nColors - 1)
    local function macTile(ti, ci) return macTile0 + (ti - 1) * nColors + (ci - 1) end
    local function macFx(gi, di)   return macFx0 + (gi - 1) * nDir + (di - 1) end

    -- Plafonds de NETTOYAGE : ils couvrent la PLUS GROSSE empreinte
    -- possible (nb max de lignes/couleurs, et les versions precedentes du
    -- plugin), pas seulement la config courante. Sinon une regeneration
    -- plus petite laisse des orphelins : labels dupliques (#2) et boucles
    -- FX fantomes que le nouveau Off All ne peut plus eteindre.
    local MAX_ROWS  = 1 + math.max(MAX_GROUP_ROWS, MAX_FIXTURE_ROWS)
    local seqDelEnd = baseId + MAX_ROWS * NC + MAX_GROUP_ROWS * nDir - 1
    local macDelEnd = baseId + 7 + 2 * nV + 2 * NC
                        + MAX_ROWS * NC + MAX_GROUP_ROWS * nDir
    local appDelEnd = baseId + 2 * NC + 5
    local imgDelEnd = baseId + 2 * NC + 3

    -- ------------------- occupation / confirmation -------------------
    local occupied, detectOk = false, true
    local function checkUsed(fmt, a, b)
        for no = a, b do
            local used, ok = objectUsed(string.format(fmt, no))
            if not ok then detectOk = false; return end
            if used then occupied = true; return end
        end
    end
    local function checkExists(fmt, a, b)
        for no = a, b do
            if objectExists(string.format(fmt, no)) then occupied = true; return end
        end
    end
    checkUsed("Sequence %d", baseId, seqDelEnd)
    -- Macros par EXISTENCE : une macro labellisee mais vide est quand meme
    -- du contenu utilisateur, elle doit declencher la confirmation.
    if detectOk and not occupied then checkExists("Macro %d", baseId, macDelEnd) end
    if detectOk and not occupied then checkExists("Appearance %d", baseId, appDelEnd) end
    -- (MAtricks "CPFX" : reliquat des anciennes versions -> nettoye aussi.)
    if detectOk and not occupied and objectExists("MAtricks " .. baseId) then
        occupied = true
    end
    -- Le Layout aussi : un layout existant, meme VIDE (prepare/renomme par
    -- l'utilisateur), doit etre confirme.
    if detectOk and not occupied and
            (objectExists("Layout " .. layNo) or objectUsed("Layout " .. layNo)) then
        occupied = true
    end

    if occupied or not detectOk then
        local confirm = MessageBox({ title = "Color Picker LIVE",
            message = string.format(
                "Des objets existent peut-etre dans les plages du plugin.\n"
             .. "Seront SUPPRIMES puis regeneres :\n"
             .. "Sequence %d -> %d\nMacro %d -> %d\nAppearance %d -> %d\n"
             .. "Image 3.%d -> 3.%d\nMAtricks %d\nLayout %d\n"
             .. "(plages larges : elles nettoient aussi les restes des\n"
             .. "generations precedentes, meme plus grosses).\n\n"
             .. "Les PRESETS couleur (pool 4) sont conserves, jamais effaces.\n"
             .. "Tout ecraser et regenerer ?",
                baseId, seqDelEnd, baseId, macDelEnd, baseId, appDelEnd,
                baseId, imgDelEnd, baseId, layNo),
            commands = { { value = 1, name = "Ecraser" }, { value = 0, name = "Annuler" } } })
        if not confirm or confirm.result ~= 1 then return end
        -- Relacher AVANT de supprimer : une sequence effacee en cours de
        -- lecture coupe sa couleur d'un seul coup sur le plateau.
        Cmd(string.format('Off Sequence %d Thru %d Fade 0', baseId, seqDelEnd))
        Cmd(string.format('Delete Sequence %d Thru %d /NoConfirm', baseId, seqDelEnd))
        Cmd(string.format('Delete Macro %d Thru %d /NoConfirm', baseId, macDelEnd))
        Cmd(string.format('Delete Appearance %d Thru %d /NoConfirm', baseId, appDelEnd))
        -- Le pool Images aussi : sans ce Delete, "Import Image" retombe sur
        -- un slot occupe et le test de reussite ne peut pas distinguer un
        -- import frais d'un PNG perime.
        Cmd(string.format('Delete Image 3.%d Thru 3.%d /NoConfirm', baseId, imgDelEnd))
        Cmd(string.format('Delete MAtricks %d /NoConfirm', baseId))
        Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    end

    -- 1) Appearances : pleine couleur (active) + version sombre (repos)
    --    pour chaque couleur, puis les utilitaires.
    for i, c in ipairs(colors) do
        makeAppearance(appOn(i), "CP " .. c.name, c.r, c.g, c.b)
        makeAppearance(appOff(i), "CP " .. c.name .. " Dim",
            math.floor(c.r * 0.30), math.floor(c.g * 0.30), math.floor(c.b * 0.30))
    end
    makeAppearance(appDark,   "CP Dark",    36, 40, 48)
    makeAppearance(appGrey,   "CP Grey",    66, 72, 84)
    makeAppearance(appAccent, "CP Fade On", 235, 238, 245)
    makeAppearance(appRed,    "CP Off Red", 128, 34, 40)
    -- Repos VS actif : deux violets bien differents, pour que les tuiles FX
    -- gardent un etat lisible meme si les images n'ont pas pu etre importees.
    makeAppearance(appFx,     "CP FX",       52, 30,  80)
    makeAppearance(appFxOn,   "CP FX On",   150, 90, 235)
    breathe()

    -- 1a) Images NEON : tuiles arrondies generees en PNG par le plugin,
    --     ecrites dans la User Image Library, importees dans le pool
    --     Images et posees sur les appearances. Le fond de l'appearance
    --     passe en alpha 0 UNIQUEMENT si l'image est bien en place (sinon
    --     on garde le fond uni comme repli visible).
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
                    -- "Bar" = image entiere, aspect conserve (letterbox) :
                    -- les coins arrondis restent ronds meme si la case
                    -- n'est pas parfaitement carree. ("Stretch", le defaut,
                    -- les deformerait.) Silencieux si le build differe.
                    a:Set("ImageMode", "Bar")
                end
            end)
        end
        for i, c in ipairs(colors) do
            if writeAndImport(imgOut(i), string.format("cp_neon_%02d.png", i),
                    c.r, c.g, c.b, false) then
                imagesOk = imagesOk + 1
                attach(imgOut(i), appOff(i))
            end
            if writeAndImport(imgFill(i), string.format("cp_fill_%02d.png", i),
                    c.r, c.g, c.b, true) then
                imagesOk = imagesOk + 1
                attach(imgFill(i), appOn(i))
            end
        end
        if writeAndImport(imgGrey, "cp_neon_grey.png", 150, 156, 168, false) then
            imagesOk = imagesOk + 1
            attach(imgGrey, appGrey)
        end
        if writeAndImport(imgAcc, "cp_fill_white.png", 235, 238, 245, true) then
            imagesOk = imagesOk + 1
            attach(imgAcc, appAccent)
        end
        if writeAndImport(imgFxO, "cp_neon_fx.png", 150, 90, 235, false) then
            imagesOk = imagesOk + 1
            attach(imgFxO, appFx)
        end
        if writeAndImport(imgFxF, "cp_fill_fx.png", 150, 90, 235, true) then
            imagesOk = imagesOk + 1
            attach(imgFxF, appFxOn)
        end
        pcall(function() SyncFS() end)
    end)
    breathe()

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

    -- 1c) Presets SLOTS du FX (C1 / C2) : les pastilles copient la couleur
    --     choisie DEDANS (Copy /Merge) -> les cues FX, qui REFERENCENT ces
    --     slots, changent de couleurs instantanement. Crees s'ils manquent
    --     (C1 = Red, C2 = Blue par defaut), jamais effaces.
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
    breathe()

    -- 2) Mini-sequences couleur : 1 par (cible x couleur), 1 cue.
    --    La cue applique d'abord les attributs directs (filet de securite),
    --    puis le PRESET par-dessus : si la reference passe, la cue est LIEE
    --    au preset -> modifier le preset met a jour tout le board.
    --    (Ces sequences ne sont PAS sur le layout : ce sont les macros du
    --     board qui les lancent. Elles gardent une appearance pour rester
    --     lisibles dans le pool.)
    for ti, t in ipairs(targets) do
        for ci, c in ipairs(colors) do
            local sq = seqColor(ti, ci)
            Cmd("ClearAll")
            Cmd(t.sel)
            Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(c.r / 255 * 100 + 0.5)))
            Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(c.g / 255 * 100 + 0.5)))
            Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(c.b / 255 * 100 + 0.5)))
            Cmd(string.format('At Preset %d.%d', PT, baseId + ci - 1))
            Cmd(string.format('Store Sequence %d Cue 1 /NoConfirm', sq))
            Cmd(string.format('Label Sequence %d "%s %s"', sq, t.label, c.name))
            Cmd(string.format('Assign Appearance %d At Sequence %d', appOn(ci), sq))
            setCueFade(sq, 1, colorFade)
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
        breathe()
    end
    Cmd("ClearAll")

    -- 2b) Sequences FX : 3 par groupe (un SENS de balayage chacune).
    --     Construites par COMMANDES (le seul chemin fiable de bout en
    --     bout) : cue 1 = groupe At Preset SLOT C1, cue 2 = SLOT C2, avec
    --     un delay individuel reparti sur le groupe (sens = J>C, C>J ou
    --     SYM), les deux cues en TrigType Follow + WrapAround -> boucle.
    --     Les cues referencent les presets slots -> les pastilles C1/C2
    --     re-teintent la boucle meme en cours de route.
    -- Machines de chaque groupe, dans l'ordre : sert au balayage (construit
    -- machine par machine) ET a savoir quels groupes SE CHEVAUCHENT, pour
    -- qu'une couleur coupe toutes les boucles qui touchent ses machines.
    local grpAddrs, grpSet = {}, {}
    for gi, ti in ipairs(groupTis) do
        Cmd("ClearAll")
        Cmd(targets[ti].sel)
        local addrs = selectionAddrs(64)
        grpAddrs[gi] = addrs
        if addrs then
            local set = {}
            for _, a in ipairs(addrs) do set[a] = true end
            grpSet[gi] = set
        end
    end
    Cmd("ClearAll")
    breathe()

    local fxBuilt = 0
    for gi, ti in ipairs(groupTis) do
        local t = targets[ti]
        -- Balayage machine par machine avec un "Delay <t>" individuel
        -- (syntaxe documentee) : controle EXACT du sens. Sans enumeration
        -- possible, repli sur le fan par plage "Delay a Thru b".
        local addrs = grpAddrs[gi]
        for di, dir in ipairs(FX_DIRS) do
            local no = seqFx(gi, di)
            for k, slot in ipairs({ pFx1, pFx2 }) do
                Cmd("ClearAll")
                if addrs then
                    local n = #addrs
                    for i, addr in ipairs(addrs) do
                        Cmd(addr)
                        Cmd(string.format('At Preset %d.%d', PT, slot))
                        Cmd("Delay " .. fmtNum(fanFactor(dir.fan, i, n) * FX_SWEEP))
                    end
                else
                    Cmd(t.sel)
                    Cmd(string.format('At Preset %d.%d', PT, slot))
                    Cmd(string.format(dir.fb, tostring(FX_SWEEP)))
                end
                Cmd(string.format('Store Sequence %d Cue %d /NoConfirm', no, k))
                setCueFade(no, k, 1)
                -- La propriete du trigger s'appelle TrigType (valeur
                -- sensible a la casse : "Follow") — manuel + forum MA.
                Cmd(string.format('Set Sequence %d Cue %d Property "TrigType" "Follow"', no, k))
            end
            Cmd(string.format('Label Sequence %d "FX %s %s"', no, t.label, dir.lbl))
            Cmd(string.format('Assign Appearance %d At Sequence %d', appFxOn, no))
            Cmd(string.format('Set Sequence %d Property "WrapAround" "Yes"', no))
            Cmd(string.format('Set Sequence %d Property "OffFade" "%s"', no, tostring(offFade)))
            Cmd(string.format('Set Sequence %d Property "OffWhenOverridden" "Yes"', no))
            pcall(function()
                local s = ObjectList("Sequence " .. no)[1]
                if s then
                    for ki = 1, 2 do
                        pcall(function()
                            local cue = ObjectList(string.format("Sequence %d Cue %d", no, ki))[1]
                            if cue then cue:Set("TrigType", "Follow") end
                        end)
                    end
                    pcall(function() s:Set("WrapAround", "Yes") end)
                    -- Go+ repart de la cue courante ou de la premiere selon
                    -- le "Restart Mode" ; on demande la premiere (silencieux
                    -- si le build nomme la propriete autrement — la boucle a
                    -- 2 cues tourne de toute facon).
                    pcall(function() s:Set("RestartMode", "FirstCue") end)
                    s:Set("OffFade", tostring(offFade))
                    s:Set("OffWhenOverridden", "Yes")
                end
            end)
            if objectExists(string.format("Sequence %d Cue 2", no)) then
                fxBuilt = fxBuilt + 1
            else
                Printf("[CP] FX sequence %d (%s %s) : construction incomplete",
                    no, t.label, dir.lbl)
            end
        end
        breathe()
    end
    -- Le programmer ne doit pas rester charge pendant la construction des
    -- macros et du layout — ni si quelque chose echoue entre-temps.
    Cmd("ClearAll")

    -- ------------------------- 3) les macros -------------------------
    -- TOUT le board est fait de macros : c'est le seul mecanisme ou la
    -- tuile prend vraiment l'IMAGE (contour au repos / pave plein quand
    -- actif). Chaque tuile : lance sa sequence en restitution, coupe le FX
    -- de sa ligne, et repeint la ligne (feedback radio).

    -- Quels groupes FX touchent les machines de la ligne ti ? (Groupes
    -- imbriques : "General" contient "Contres" — sans ca, la boucle du
    -- groupe englobant reprendrait la couleur a sa cue suivante.)
    -- En cas de doute (enumeration impossible), on repond OUI : mieux vaut
    -- couper un effet de trop que de perdre la main sur la couleur.
    local fxGiOfTi0 = {}
    for gi, ti in ipairs(groupTis) do fxGiOfTi0[ti] = gi end
    local function overlappingGis(ti)
        local out = {}
        if nFx == 0 then return out end
        local mine = fxGiOfTi0[ti]
        for gi = 1, nFx do
            local hit
            if ti == 1 or gi == mine then                 -- ALL, ou son propre groupe
                hit = true
            elseif not mine or not grpSet[gi] or not grpSet[mine] then
                hit = true                                -- inconnu -> prudent
            else
                for addr in pairs(grpSet[mine]) do
                    if grpSet[gi][addr] then hit = true; break end
                end
            end
            if hit then out[#out + 1] = gi end
        end
        return out
    end

    -- Lignes de "remise au repos" d'un ensemble de lignes du board.
    local function resetLines(rows, out, skipMac)
        local isRow = {}
        for _, ti in ipairs(rows) do isRow[ti] = true end
        for _, ti in ipairs(rows) do
            for cj = 1, nColors do
                local m = macTile(ti, cj)
                if m ~= skipMac then
                    out[#out + 1] = string.format('Assign Appearance %d At Macro %d',
                        appOff(cj), m)
                end
            end
        end
        for gi, ti in ipairs(groupTis) do
            if isRow[ti] then
                for dj = 1, nDir do
                    local m = macFx(gi, dj)
                    if m ~= skipMac then
                        out[#out + 1] = string.format('Assign Appearance %d At Macro %d',
                            appFx, m)
                    end
                end
            end
        end
    end

    local allRows = {}
    for ti = 1, nTargets do allRows[ti] = ti end
    local fxGiOfTi = fxGiOfTi0

    -- Commandes "coupe les boucles FX qui touchent cette ligne". Le fondu
    -- vaut celui de la couleur : la boucle se relache pendant que la
    -- couleur monte -> aucun trou (sinon les machines retombent a leur
    -- couleur par defaut, gros flash blanc).
    local function killFxLines(ti, out, fade)
        local gis = overlappingGis(ti)
        if #gis == 0 then return end
        if #gis == nFx then                                -- tout le bloc FX
            out[#out + 1] = offCmd(seqFx0, seqLast, fade)
            return
        end
        for _, gi in ipairs(gis) do
            out[#out + 1] = offCmd(seqFx(gi, 1), seqFx(gi, nDir), fade)
        end
    end

    -- Lignes du board dont les tuiles doivent etre repeintes quand on tape
    -- la ligne ti : la sienne, la ligne ALL (qui n'a plus la main partout),
    -- et toute ligne de groupe qui partage des machines.
    local function affectedRows(ti)
        if ti == 1 then return allRows end
        local rows, seen = { ti }, { [ti] = true }
        if not seen[1] then rows[#rows + 1] = 1; seen[1] = true end
        for _, gi in ipairs(overlappingGis(ti)) do
            local tj = groupTis[gi]
            if tj and not seen[tj] then rows[#rows + 1] = tj; seen[tj] = true end
        end
        return rows
    end

    -- 3a) Tuiles COULEUR.
    for ti, t in ipairs(targets) do
        for ci, c in ipairs(colors) do
            local me    = macTile(ti, ci)
            local lines = { gotoCmd(seqColor(ti, ci), colorFade) }  -- ligne 1 : reecrite par les FADE
            killFxLines(ti, lines, colorFade)
            -- La tuile tapee s'allume TOUT DE SUITE (juste apres l'action),
            -- le menage de la ligne suit.
            lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d', appOn(ci), me)
            resetLines(affectedRows(ti), lines, me)
            makeMacro(me, string.format("%s %s", t.label, c.name), appOff(ci), lines)
        end
        breathe()
    end

    -- 3b) Tuiles FX (3 sens par ligne de groupe).
    for gi, ti in ipairs(groupTis) do
        local t = targets[ti]
        for di, dir in ipairs(FX_DIRS) do
            local me = macFx(gi, di)
            -- Relache les 3 sens de la ligne AVEC un fondu : sans lui, la
            -- boucle en cours lache d'un coup et le groupe retombe a sa
            -- couleur par defaut (flash blanc) avant que la nouvelle
            -- boucle ne monte. Go+ (et non Goto) enchaine les cues Follow.
            local lines = {
                offCmd(seqFx(gi, 1), seqFx(gi, nDir), colorFade),
                goPlusCmd(seqFx(gi, di)),
            }
            lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d', appFxOn, me)
            resetLines(affectedRows(ti), lines, me)
            makeMacro(me, string.format("FX %s %s", t.label, dir.lbl), appFx, lines)
        end
        breathe()
    end

    -- 3c) Outils : Off All (relache tout + remet toutes les tuiles au
    --     repos), etiquette ALL, banniere.
    local offAllLines = { offCmd(baseId, seqLast, offFade) }   -- ligne 1 : reecrite par FADE arret
    resetLines(allRows, offAllLines, nil)
    makeMacro(macOffAll, "Off All", appRed, offAllLines)
    makeMacro(macAllHdr, "ALL", appDark, {})
    makeMacro(macTitle, "C O L O R  P I C K E R", appDark, {})

    -- 3d) Boutons de fade : chaque bouton regle d'un coup tout le board ET
    --     affiche l'etat courant (bouton actif surligne, header relabelle).
    --     Libelles UNIQUES entre les deux rangees (sinon MA3 suffixe "#2").
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
                -- fade couleur : reecrit la ligne 1 (le Goto) de la tuile.
                linesC[#linesC + 1] = string.format(
                    'Set Macro %d.1 Property "Command" "%s"',
                    macTile(ti2, ci2), gotoCmd(seqColor(ti2, ci2), vs))
                -- fade arret : relache des sequences.
                linesO[#linesO + 1] = string.format(
                    'Set Sequence %d Property "OffFade" "%s"', seqColor(ti2, ci2), vs)
            end
        end
        -- Le vrai fade d'arret : reecrit la ligne 1 du macro Off All.
        linesO[#linesO + 1] = string.format(
            'Set Macro %d.1 Property "Command" "%s"',
            macOffAll, offCmd(baseId, seqLast, vs))
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
        makeMacro(macFadeC0 + vi - 1, fadeLabel(v),
            (v == colorFade) and appAccent or appGrey, linesC)
        makeMacro(macFadeO0 + vi - 1, fadeLabelO(v),
            (v == offFade) and appAccent or appGrey, linesO)
    end
    breathe()

    -- 3e) Pastilles FX C1 / C2 : copient la couleur choisie dans le preset
    --     SLOT (Copy /Merge) -> la boucle FX se re-teinte. Pastille
    --     choisie = remplie. Header long ("FX C1 Red") / bouton court
    --     ("C1 Red") -> aucun doublon de nom.
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
                        (cj == ci) and appOn(cj) or appOff(cj), base0 + cj - 1)
                end
                makeMacro(base0 + ci - 1, btnPrefix .. " " .. c.name,
                    (ci == defaultCi) and appOn(ci) or appOff(ci), lines)
            end
        end
        makeSlotRow(macC1Hdr, macC1_0, pFx1, "FX C1", "C1", 1)
        makeSlotRow(macC2Hdr, macC2_0, pFx2, "FX C2", "C2", math.min(8, nColors))
    end
    breathe()

    -- ------------------------- 4) le layout --------------------------
    Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Picker LIVE"', layNo))

    local elements = {}
    local fullW = 2 + nColors + ((nFx > 0) and nDir or 0)

    -- Banniere titre, pleine largeur.
    elements[#elements + 1] = { object = "Macro " .. macTitle, x = 0, y = 0,
        w = fullW, noicon = true }

    -- Lignes : ALL puis groupes/machines. Colonnes FX en bout de ligne
    -- pour les groupes (3 sens de balayage).
    local rowTop = 1.3
    for ti, t in ipairs(targets) do
        local row = rowTop + (ti - 1)
        if t.header then
            elements[#elements + 1] = { object = t.header, x = 0, y = row,
                w = 2, noicon = true, inert = true }
        else
            elements[#elements + 1] = { object = "Macro " .. macAllHdr, x = 0, y = row,
                w = 2, noicon = true }
        end
        for ci = 1, nColors do
            elements[#elements + 1] = {
                object = "Macro " .. macTile(ti, ci),
                x = 2 + ci - 1, y = row, clean = true,
            }
        end
        local gi = fxGiOfTi[ti]
        if gi then
            for di, dir in ipairs(FX_DIRS) do
                elements[#elements + 1] = {
                    object = "Macro " .. macFx(gi, di),
                    x = 2 + nColors + di - 1, y = row, clean = true,
                    text = dir.lbl, textSize = 14,
                }
            end
        end
    end

    -- Barre Off All pleine largeur, puis rangees FADE, puis pastilles FX.
    local yOff = rowTop + nTargets + 0.3
    local fy1  = yOff + 1.3
    local fy2  = fy1 + 1
    elements[#elements + 1] = { object = "Macro " .. macOffAll, x = 0, y = yOff,
        w = fullW, noicon = true }
    elements[#elements + 1] = { object = "Macro " .. macFadeCHdr, x = 0, y = fy1,
        w = 2, noicon = true }
    elements[#elements + 1] = { object = "Macro " .. macFadeOHdr, x = 0, y = fy2,
        w = 2, noicon = true }
    for vi = 1, nV do
        elements[#elements + 1] = { object = "Macro " .. (macFadeC0 + vi - 1),
            x = 2 + vi - 1, y = fy1, noicon = true }
        elements[#elements + 1] = { object = "Macro " .. (macFadeO0 + vi - 1),
            x = 2 + vi - 1, y = fy2, noicon = true }
    end
    -- Pastilles C1 / C2 (seulement si des lignes de groupes ont un FX).
    local yBottom = fy2
    if nFx > 0 then
        local fy3 = fy2 + 1.3
        local fy4 = fy3 + 1
        elements[#elements + 1] = { object = "Macro " .. macC1Hdr, x = 0, y = fy3,
            w = 2, noicon = true }
        elements[#elements + 1] = { object = "Macro " .. macC2Hdr, x = 0, y = fy4,
            w = 2, noicon = true }
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
            "\n(Lignes limitees a %d — regroupe tes machines pour plus)",
            math.max(MAX_GROUP_ROWS, MAX_FIXTURE_ROWS))
    end

    local msg = string.format(
        "Color Picker LIVE pret !\n\n"
     .. "Lignes : %d (ALL + %s)   Couleurs : %d\n"
     .. "Presets couleur : 4.%d -> 4.%d (%d crees, %d reutilises)\n"
     .. "Sequences %d -> %d   Macros %d -> %d   Images : %d\n"
     .. "Fade couleur %ss / arret %ss\n"
     .. "Layout %d : %d/%d cases placees%s\n\n"
     .. "EN LIVE : tape une tuile couleur -> la ligne passe a cette couleur\n"
     .. "en restitution et la tuile SE REMPLIT (contour au repos, pave\n"
     .. "plein quand elle joue). Autre tuile = changement de couleur.\n"
     .. "FADE : le bouton ACTIF est surligne, le titre affiche la valeur.\n"
     .. "FX (bout des lignes de groupes) : 3 sens de balayage —\n"
     .. "J>C (jardin vers cour), C>J (cour vers jardin), SYM (symetrique).\n"
     .. "Tape un sens -> boucle C1<->C2 sur le groupe. Choisis C1 et C2\n"
     .. "avec les pastilles du bas, meme en cours de boucle. Taper une\n"
     .. "couleur ou Off All coupe le FX. (%d boucles FX construites)\n"
     .. "COULEURS PAS A TON GOUT ? Modifie le Preset 4.x (pool Color) ->\n"
     .. "tout le board suit. Regenerer ne touche jamais tes presets.\n"
     .. "Le board est 100%% restitution : zero programmer (les en-tetes de\n"
     .. "ligne sont inertes, elles ne selectionnent rien).\n"
     .. "SI L'AFFICHAGE TE SEMBLE FAUX : Off All remet tout d'aplomb.\n"
     .. "APRES UN REPATCH ou une modif de groupe : regenere le board, les\n"
     .. "cues gardent les machines telles qu'elles etaient.",
        nTargets, (groupIds and "groupes" or "machines"), nColors,
        baseId, baseId + nColors - 1, presetsCreated, presetsReused,
        baseId, seqLast, baseId, macEnd, imagesOk,
        tostring(colorFade), tostring(offFade),
        layNo, placed, placed + failed, note, fxBuilt)

    MessageBox({ title = "Color Picker LIVE", message = msg,
        commands = { { value = 1, name = "Super !" } } })
    Printf("[ColorPickerLive] %d lignes x %d couleurs, %d FX, layout %d : %d/%d cases.",
        nTargets, nColors, fxBuilt, layNo, placed, placed + failed)
end

return main
