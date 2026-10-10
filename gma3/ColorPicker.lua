-- =====================================================================
--  Color Picker LIVE  -  Plugin Lua pour grandMA3 v2.5
-- ---------------------------------------------------------------------
--  Un color picker de busking, construit comme le font les pupitreurs :
--
--      LIGNE            COULEURS (tuiles tappables) ->            FX ->
--    [ ALL        ]   [Red][Orange][Amber] ... [White]
--    [ SPOT       ]   [Red][Orange][Amber] ... [White]   [J>C][C>J][E>I][I>E][1/2]
--    [ WASH       ]   [Red][Orange][Amber] ... [White]   [J>C][C>J][E>I][I>E][1/2]
--    [============== Off All (barre rouge) ===============]
--    [FADE couleur] [0s][0.5s][1s][2s][3s][4s]   (bouton actif surligne)
--    [FADE arret  ] [0][0.5][1][2][3][4]
--    [FX C1 <col> ] [pastilles couleur]   -> couleur 1 de la boucle
--    [FX C2 <col> ] [pastilles couleur]   -> couleur 2 de la boucle
--    [FX VITESSE  ] [0.5][1][2][4][8]     -> battement de la vague (s)
--    [FX FONDU    ] [0][0.5][1][2][4]     -> fondu de chaque machine (s)
--    [RE-CUISINER ]                       -> apres un repatch / groupe modifie
--
--  MECANIQUE (v9) — RECIPES, zero programmer :
--  - Chaque cue est une RECIPE : Selection = Group, Values = Preset 4.x,
--    et pour les FX les timings MAtricks (DelayFromX / DelayToX, XWings,
--    XGroup, InvertX). La console la CUISINE (Cook /Overwrite). Le plugin
--    n'ecrit jamais de valeurs depuis le programmer : il assemble des
--    objets (Store / Assign / Set / Cook) et VERIFIE le retour de chaque
--    commande ("Ok" ou une erreur) et l'etat des objets (lignes de
--    recipe, cue cuisinee). Tout echec est compte et affiche au bilan.
--  - Les tuiles couleur et FX sont LES SEQUENCES ELLES-MEMES posees dans
--    le layout : zero macro, zero repeinture -> reaction immediate. L'etat
--    visuel est tenu par la console : "PreferCueAppearance" -> tuile
--    sombre quand la sequence dort, couleur pleine quand elle joue.
--  - Exclusivite par LTP + "Off When Overridden" : la couleur tapee prend
--    toutes les valeurs de l'ancienne couleur de la ligne (et de la boucle
--    FX du meme groupe) -> elles s'eteignent seules.
--  - Les boucles FX des AUTRES groupes qui partagent des machines sont
--    coupees par la colonne CMD de la cue ("Off Sequence a Thru b Fade").
--    Le plugin verifie a la generation qu'un CMD de cue s'execute bien.
--  - FX : 5 tuiles par ligne de groupe = 5 FORMES de vague, chacune une
--    boucle C1<->C2 (2 cues Follow + WrapAround) :
--      J>C  jardin -> cour (DelayFromX 0, DelayToX = battement)
--      C>J  cour -> jardin (idem + InvertX)
--      E>I  des bords vers le centre (XWings 2)
--      I>E  du centre vers les bords (XWings 2 + InvertX)
--      1/2  damier : XGroup 2 -> une machine sur deux part en premier,
--           les deux moities sont toujours en couleurs opposees.
--    Battement (FX VITESSE) et fondu (FX FONDU) se reglent EN LIVE.
--  - Les pastilles C1/C2 re-teintent la boucle en live : Copy /Overwrite
--    dans deux presets slots que les cues cuisinees REFERENCENT.
--  - Look : boutons en images PNG "neon" generees par le plugin ; tuiles
--    couleur = aplat (sombre / plein), le seul rendu possible pour une
--    sequence dans un layout.
--
--  NB : apres toute modification de ce fichier -> "ReloadAllPlugins" (RP).
-- =====================================================================

-- Version affichee dans les dialogues : elle dit quelle version du .lua
-- la console a REELLEMENT chargee (apres un ReloadAllPlugins). Les objets
-- deja stockes dans le show, eux, datent de la derniere GENERATION.
local VERSION = "9.0"

-- Palette en ordre ARC-EN-CIEL (blanc en dernier).
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

local MAX_GROUP_ROWS = 12   -- lignes de groupes max (board lisible)

-- Valeurs proposees par les boutons de fade (secondes).
local FADE_VALUES = { 0, 0.5, 1, 2, 3, 4 }

-- Battement de la vague FX (secondes) : le temps que met la vague pour
-- traverser le groupe = la duree d'une cue de la boucle (DelayToX). Il
-- ne vaut jamais 0 : une cue de duree nulle emballerait la boucle.
local FX_SWEEPS        = { 0.5, 1, 2, 4, 8 }
local FX_SWEEP_DEFAULT = 2

-- Fondu de chaque machine dans la vague (CueInFade des cues de boucle) :
-- 0 = bascule nette, sinon fondu doux. Reglable en live.
local FX_FADES        = { 0, 0.5, 1, 2, 4 }
local FX_FADE_DEFAULT = 1

-- Fondu avec lequel une tuile FX relache les AUTRES boucles qui touchent
-- ses machines (colonne CMD de ses cues). Fixe : les tuiles FX ne sont
-- pas reecrites par les rangees FADE (macros courtes).
local FX_KILL_FADE = 1

-- Formes de la vague : une sequence FX par forme et par groupe.
--   J = jardin (debut du groupe), C = cour (fin du groupe),
--   E = exterieur (les bords), I = interieur (le centre).
-- Tout passe par les timings MAtricks de la ligne de recipe :
--   DelayFromX 0 / DelayToX <battement> pour toutes les formes, puis
--   wings  : XWings 2  -> les deux moities se repondent (bords d'abord)
--   invert : InvertX Yes + InvertStyle All -> sens inverse
--   group2 : XGroup 2  -> une machine sur deux (damier)
local FX_DIRS = {
    { lbl = "J>C" },
    { lbl = "C>J", invert = true },
    { lbl = "E>I", wings = true },
    { lbl = "I>E", wings = true, invert = true },
    { lbl = "1/2", group2 = true },
}

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

-- Rend (ids, rejetes) : ids = numeros lus, rejetes = jetons non compris.
-- Separateurs acceptes : + , ; et les espaces entre nombres isoles.
local function parseRange(str)
    if not str or str:match("^%s*$") then return nil, {} end
    local ids, rejected = {}, {}
    local norm = str:gsub("[,;]", "+")
    for raw in (norm .. "+"):gmatch("([^+]+)") do
        local token = raw:gsub("^%s+", ""):gsub("%s+$", "")
        local a, b = token:lower():match("^(%d+)%s*thru%s*(%d+)$")
        if token == "" then
            -- rien
        elseif a then
            -- borne : plage remise a l'endroit, largeur et IDs plafonnes
            -- (sinon "1 Thru 100000000" gele la console).
            local a2, b2 = tonumber(a), tonumber(b)
            if a2 > b2 then a2, b2 = b2, a2 end
            a2 = math.min(a2, 100000)
            b2 = math.min(b2, a2 + 999, 100000)
            for i = a2, b2 do ids[#ids + 1] = i end
        elseif token:match("^[%d%s]+$") then
            -- "1 2 3" : des nombres separes par des espaces
            for n in token:gmatch("%d+") do ids[#ids + 1] = math.min(tonumber(n), 100000) end
        else
            rejected[#rejected + 1] = token
        end
        if #ids > 1000 then break end
    end
    return (#ids > 0) and ids or nil, rejected
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
    -- Sanitise : un guillemet, une apostrophe ou un point casserait les
    -- commandes (MA3 accepte les deux styles de guillemets).
    if nm and tostring(nm) ~= "" then
        return (tostring(nm):gsub('["\'%.]', ""))
    end
    return "Group " .. gid
end

-- Label d'un preset (nil si illisible / inexistant).
local function presetName(pt, pNo)
    local nm
    pcall(function()
        local h = ObjectList(string.format("Preset %d.%d", pt, pNo))[1]
        if h then nm = h:Get("Name") end
    end)
    if nm == nil then return nil end
    nm = tostring(nm)
    return (nm ~= "") and nm or nil
end

-- Laisse respirer la console entre deux gros blocs de construction.
local function breathe()
    pcall(coroutine.yield, 0)
end

-- --------------------------- constructeurs ---------------------------

-- Appearance pleine couleur (fond). Proprietes BackR/G/B/Alpha en 0-255,
-- ecrites via la commande "Set ... Property" ET via le handle objet.
local function makeAppearance(no, name, r, g, b)
    Cmd(string.format('Store Appearance %d /NoConfirmation', no))
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

-- Nombre de macros dont les LIGNES n'ont pas pu etre ecrites : une macro
-- vide a l'air parfaite sur le layout et ne fait rien -> on le signale.
local macroLineFails = 0

local function makeMacro(no, name, appNo, lines)
    Cmd(string.format('Store Macro %d /NoConfirmation', no))
    Cmd(string.format('Label Macro %d "%s"', no, name))
    if appNo then
        Cmd(string.format('Assign Appearance %d At Macro %d', appNo, no))
    end
    if #lines == 0 then return end
    -- Cmd() poste sur la ligne de commande : l'objet n'existe pas
    -- forcement a l'instruction Lua suivante. On retente en laissant la
    -- console respirer plutot que de fabriquer une tuile morte.
    local written, done = false, 0
    for attempt = 1, 3 do
        pcall(function()
            local m = ObjectList("Macro " .. no)[1]
            if m then
                -- on reprend la ou on s'est arrete : jamais de doublon
                for i = done + 1, #lines do
                    local ml = m:Append()
                    ml:Set("Command", lines[i])
                    done = i
                end
                written = true
            end
        end)
        if written then break end
        pcall(coroutine.yield, 0.05)
    end
    if not written then
        macroLineFails = macroLineFails + 1
        Printf("[CP] Macro %d (%s) : lignes non ecrites", no, name)
    end
end

-- ------------------- commandes VERIFIEES (le coeur v9) -----------------
-- Cmd() renvoie une chaine : "Ok", ou une erreur ("Illegal object",
-- "Syntax Error", "Illegal property", ...). La v8 ne la lisait pas : une
-- commande refusee passait en silence et le board "faisait n'importe
-- quoi". Ici chaque refus est compte, le premier est cite au bilan.
local CP = { fails = 0, firstFail = nil, cosmetic = 0, log = {} }

local function cmdOk(r)
    if r == nil then return true end        -- build qui ne renvoie rien
    local s = tostring(r):lower()
    return s:sub(1, 2) == "ok"
end

-- cosmetic = true : commande d'habillage (appearance, label...) dont
-- l'echec ne casse pas le board -> comptee a part.
local function run(s, cosmetic)
    local r = Cmd(s)
    if cmdOk(r) then return true end
    if cosmetic then
        CP.cosmetic = CP.cosmetic + 1
    else
        CP.fails = CP.fails + 1
        if not CP.firstFail then
            CP.firstFail = string.format("%s  ->  %s", s, tostring(r))
        end
    end
    if #CP.log < 40 then
        CP.log[#CP.log + 1] = string.format("%s -> %s", s, tostring(r))
    end
    Printf("[CP] refuse : %s -> %s", s, tostring(r))
    return false
end

local function handleOf(addr)
    local h
    pcall(function() h = ObjectList(addr)[1] end)
    return h
end

-- Set d'une propriete : commande, et si elle est refusee, ecriture par
-- le handle objet (certaines proprietes ne passent que par l'un des deux
-- selon le build). L'echec n'est compte que si LES DEUX refusent.
local function setProp(addr, name, value, cosmetic)
    local s = string.format('Set %s Property "%s" "%s"', addr, name, tostring(value))
    local r = Cmd(s)
    if cmdOk(r) then return true end
    local ok = pcall(function()
        local h = ObjectList(addr)[1]
        if not h then error("no handle") end
        h:Set(name, tostring(value))
    end)
    if ok then return true end
    if cosmetic then
        CP.cosmetic = CP.cosmetic + 1
    else
        CP.fails = CP.fails + 1
        if not CP.firstFail then
            CP.firstFail = string.format("%s  ->  %s", s, tostring(r))
        end
    end
    Printf("[CP] refuse : %s -> %s", s, tostring(r))
    return false
end

-- Lecture d'une propriete (texte), nil si illisible.
local function getProp(addr, name)
    local v
    pcall(function()
        local h = ObjectList(addr)[1]
        if h then
            local ok, r = pcall(function() return h:Get(name, Enums.Roles.Edit) end)
            if ok and r ~= nil then v = r else v = h:Get(name) end
        end
    end)
    if v == nil then return nil end
    return tostring(v)
end

-- ------------------------------ recipes ------------------------------
-- Une ligne de recipe est un enfant de la PART 0 de la cue, adressee
-- "Sequence N Cue K Part 0.L" (L = numero de ligne, a partir de 1).
local function partOf(sq, cue)
    return handleOf(string.format("Sequence %d Cue %d Part 0", sq, cue))
end

-- Nombre de lignes de recipe d'une cue (nil si la console ne le dit pas).
local function lineCount(sq, cue)
    local n
    pcall(function()
        local part = partOf(sq, cue)
        if not part then return end
        local ok, c = pcall(function() return part:Count() end)
        if ok and type(c) == "number" then n = c; return end
        local ch = part:Children()
        if ch then n = #ch end
    end)
    return n
end

-- Ajoute la ligne L (Group -> Preset) a la cue. Chemin console-verifie :
-- "Assign Group ... At ... Part 0.L" cree la ligne quand elle n'existe
-- pas. Si la ligne n'apparait pas (verification par Count), repli par
-- l'API objet : part:Acquire("StandardRecipe") + Set Selection/Values.
-- Renvoie true si la ligne est la (ou si on ne peut pas le verifier).
local function addRecipeLine(sq, cue, lineNo, gid, pt, pNo)
    local addr = string.format("Sequence %d Cue %d Part 0.%d", sq, cue, lineNo)
    -- (pas run() : un refus ici n'est une erreur que si le repli echoue aussi)
    local assignCmd = string.format("Assign Group %d At %s", gid, addr)
    local r = Cmd(assignCmd)
    local n = lineCount(sq, cue)
    if cmdOk(r) and (n == nil or n >= lineNo) then
        run(string.format("Assign Preset %d.%d At %s", pt, pNo, addr))
        return true, "cmd"
    end
    if not cmdOk(r) then Printf("[CP] %s -> %s (repli API objet)", assignCmd, tostring(r)) end
    -- La commande n'a pas cree la ligne : API objet.
    local okLua = pcall(function()
        local part = partOf(sq, cue)
        if not part then error("no part") end
        local line = part:Acquire("StandardRecipe")
        if not line then error("no line") end
        local g = ObjectList("Group " .. gid)[1]
        local p = ObjectList(string.format("Preset %d.%d", pt, pNo))[1]
        if not g or not p then error("no refs") end
        line:Set("Selection", g)
        line:Set("Values", p)
    end)
    n = lineCount(sq, cue)
    if okLua and n and n >= lineNo then return true, "lua" end
    CP.fails = CP.fails + 1
    if not CP.firstFail then
        CP.firstFail = string.format("ligne de recipe %d de Sequence %d Cue %d non creee", lineNo, sq, cue)
    end
    Printf("[CP] %s", CP.firstFail)
    return false
end

-- Propriete d'une ligne de recipe (timings MAtricks) : commande, puis
-- handle de la ligne si la commande est refusee.
local function setLineProp(sq, cue, lineNo, name, value)
    local addr = string.format("Sequence %d Cue %d Part 0.%d", sq, cue, lineNo)
    local s = string.format('Set %s Property "%s" "%s"', addr, name, tostring(value))
    local r = Cmd(s)
    if cmdOk(r) then return true end
    local ok = pcall(function()
        local part = partOf(sq, cue)
        local line = part and part[lineNo]
        if not line then error("no line") end
        line:Set(name, tostring(value))
    end)
    if ok then return true end
    CP.fails = CP.fails + 1
    if not CP.firstFail then CP.firstFail = string.format("%s  ->  %s", s, tostring(r)) end
    Printf("[CP] refuse : %s -> %s", s, tostring(r))
    return false
end

-- Cuisson : TOUJOURS avec une option (sans option la console ouvre un
-- popup, impossible depuis un plugin). /Overwrite = la cue ne contient
-- que ce que dit la recipe (aucune valeur "dure" residuelle).
local function cook(sq)
    return run(string.format("Cook Sequence %d /Overwrite", sq))
end

-- Une cue cuisinee a du contenu : "OwnDataPresent" (Yes/true). nil si la
-- propriete n'est pas lisible sur ce build.
local function cueHasData(sq, cue)
    local v = getProp(string.format("Sequence %d Cue %d Part 0", sq, cue), "OwnDataPresent")
    if v == nil then return nil end
    v = v:lower()
    return v == "yes" or v == "true" or v == "1"
end

-- ------------------------ membres d'un groupe ------------------------
-- Sans programmer : le handle du groupe expose sa selection
-- (selectiondata[*].sf_index -> GetSubfixture). Sert a savoir quels
-- groupes se CHEVAUCHENT (une couleur sur SPOT doit couper la boucle
-- d'un GENERAL qui contient les spots). Renvoie nil si l'API manque.
local function groupMembers(gid)
    local out
    pcall(function()
        local h = ObjectList("Group " .. gid)[1]
        if not h then return end
        local sd = h.selectiondata or h.SelectionData or h.SELECTIONDATA
        if type(sd) ~= "table" then return end
        local seen, list = {}, {}
        for _, f in pairs(sd) do
            local idx = type(f) == "table" and (f.sf_index or f.SF_INDEX or f.sfIndex) or nil
            if idx then
                local key
                pcall(function()
                    local sf = GetSubfixture(idx)
                    if not sf then return end
                    local fix = sf.fixture or sf.Fixture
                    local fid = (fix and (fix.fid or fix.FID)) or sf.FID or sf.fid
                    if fid and tonumber(fid) then
                        key = "F" .. tostring(math.floor(tonumber(fid)))
                    elseif sf.ToAddr then
                        key = tostring(sf:ToAddr())
                    end
                end)
                key = key or ("S" .. tostring(idx))
                if not seen[key] then seen[key] = true; list[#list + 1] = key end
            end
        end
        if #list > 0 then out = list end
    end)
    return out
end

-- Repli : lecture par la SELECTION (le programmer, en lecture seule :
-- "Group g" puis ClearAll). SelectionFirst/Next renvoient un index de
-- subfixture, pas un FID.
local function groupMembersBySelection(gid)
    local out
    pcall(function()
        Cmd("ClearAll")
        Cmd("Group " .. gid)
        local list, seen = {}, {}
        local idx = SelectionFirst()
        local guard = 0
        while idx ~= nil and guard < 4096 do
            guard = guard + 1
            local key
            pcall(function()
                local sf = GetSubfixture(idx)
                if not sf then return end
                local fix = sf.fixture or sf.Fixture
                local fid = (fix and (fix.fid or fix.FID)) or sf.FID or sf.fid
                if fid and tonumber(fid) then
                    key = "F" .. tostring(math.floor(tonumber(fid)))
                elseif sf.ToAddr then
                    key = tostring(sf:ToAddr())
                end
            end)
            key = key or ("S" .. tostring(idx))
            if not seen[key] then seen[key] = true; list[#list + 1] = key end
            idx = SelectionNext(idx)
        end
        Cmd("ClearAll")
        if #list > 0 then out = list end
    end)
    pcall(Cmd, "ClearAll")
    return out
end

-- -------------------------- probe du CMD de cue ------------------------
-- Les boucles chevauchantes sont coupees par la colonne CMD des cues.
-- On verifie UNE fois, sur une sequence de test vide (aucune sortie),
-- qu'un CMD s'execute bien au Go+ : SetUserVar puis lecture Lua.
local function probeCueCommand(sq)
    local result = nil
    pcall(function()
        run("SetUserVar 'cp_cmd' 0", true)
        run(string.format("Store Sequence %d Cue 1 /Overwrite /NoConfirmation", sq), true)
        run(string.format("Label Sequence %d \"CP probe\"", sq), true)
        setProp(string.format("Sequence %d Cue 1", sq), "Command", "SetUserVar 'cp_cmd' 1", true)
        run(string.format("Go+ Sequence %d", sq), true)
        for _ = 1, 5 do pcall(coroutine.yield, 0.1) end
        local v
        pcall(function() v = GetVar(UserVars(), "cp_cmd") end)
        result = (tostring(v) == "1")
        run(string.format("Off Sequence %d", sq), true)
        run(string.format("Delete Sequence %d /NoConfirmation", sq), true)
    end)
    return result
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
        -- Deux chemins possibles selon le build : il suffit que l'UN des
        -- deux passe pour que la case soit posee.
        local okA = pcall(function()
            elem.posx = px; elem.posy = py
            elem.positionw = pw; elem.positionh = ph
        end)
        local okB = pcall(function()
            elem:Set("PositionX", px);  elem:Set("PositionY", py)
            elem:Set("DimensionW", pw); elem:Set("DimensionH", ph)
        end)
        return okA or okB
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
            Printf("[CP] taille native w=%s h=%s -> pas %dx%d",
                tostring(w0), tostring(h0), pitchX, pitchY)
        end

        local ok = false
        if elem ~= nil then
            ok = place(elem, e)
            -- Taper une case (macro ou sequence) DOIT la lancer (Go+). La propriete
            -- s'appelle "Action" (ni "PlaybackFunction" ni "Function", qui
            -- n'existent pas) et sa valeur par defaut depend du profil
            -- utilisateur -> on la pose explicitement.
            if e.object:match("^Macro ") or e.object:match("^Sequence ") then
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
        if ok then
            placed = placed + 1
        else
            failed = failed + 1
            Printf("[CP] case %d non placee : %s (element %s)", idx, e.object,
                (elem ~= nil) and "cree" or "absent")
        end
        -- Laisse respirer la console : une centaine de cases, chacune avec
        -- une dizaine d'ecritures de proprietes.
        if idx % 16 == 0 then pcall(coroutine.yield, 0) end
    end

    return placed, failed
end

-- Essaie plusieurs ecritures d'une meme propriete ("Yes" puis 1...) :
-- l'echec n'est compte que si aucune ne passe.
local function setPropTry(addr, name, values, cosmetic)
    local savedFails, savedFirst, savedCos = CP.fails, CP.firstFail, CP.cosmetic
    for i, v in ipairs(values) do
        CP.fails, CP.firstFail, CP.cosmetic = savedFails, savedFirst, savedCos
        if setProp(addr, name, v, cosmetic) then return true end
        if i < #values then
            CP.fails, CP.firstFail, CP.cosmetic = savedFails, savedFirst, savedCos
        end
    end
    return false
end

-- "Off Sequence a Thru b + c + d Thru e Fade f" a partir d'une liste de
-- plages {a, b}.
local function offListCmd(ranges, fade)
    local parts = {}
    for _, r in ipairs(ranges) do
        if r[2] > r[1] then parts[#parts + 1] = string.format("%d Thru %d", r[1], r[2])
        else parts[#parts + 1] = tostring(r[1]) end
    end
    if #parts == 0 then return nil end
    return string.format("Off Sequence %s Fade %s", table.concat(parts, " + "), fmtNum(fade))
end

-- ------------------------------- main --------------------------------

local function main(display_handle)
    CP.fails, CP.firstFail, CP.cosmetic, CP.log = 0, nil, 0, {}
    macroLineFails = 0        -- compteurs de run : le chunk est mis en cache

    -- Il faut des fixtures et des GROUPES (une recipe selectionne un
    -- Group). Detection SANS toucher au programmer : annuler l'assistant
    -- doit etre un vrai no-op.
    if not scanFixtures(2000, 1) then
        MessageBox({ title = "Color Picker LIVE",
            message = "Aucune fixture disponible.\nPatche au moins un projecteur RGB.",
            commands = { { value = 1, name = "OK" } } })
        return
    end
    local autoGroups = scanGroups(1000)
    if not autoGroups then
        MessageBox({ title = "Color Picker LIVE  v" .. VERSION,
            message = "Aucun groupe dans le show.\n\n"
                   .. "Le board est construit en RECIPES : chaque cue dit\n"
                   .. "\"ce groupe prend ce preset\". Il lui faut donc tes\n"
                   .. "groupes (SPOT, WASH, ...), dans l'ordre jardin -> cour\n"
                   .. "pour que les vagues FX aient un sens.\n\n"
                   .. "Cree tes groupes, puis relance le plugin.",
            commands = { { value = 1, name = "OK" } } })
        return
    end

    local function joinIds(ids, sep, max)
        local t = {}
        for i, v in ipairs(ids) do
            if i > max then t[#t + 1] = "..."; break end
            t[#t + 1] = tostring(v)
        end
        return table.concat(t, sep)
    end
    local names = {}
    for i, gid in ipairs(autoGroups) do
        if i > MAX_GROUP_ROWS then names[#names + 1] = "..."; break end
        names[#names + 1] = groupName(gid)
    end
    local found = string.format("%d groupe(s) : %s", #autoGroups, table.concat(names, ", "))

    -- Reglages (tout est modifiable dans l'assistant). La liste
    -- pre-remplie est COMPLETE : c'est le recapitulatif qui signale une
    -- troncature a 12 lignes.
    local grpStr    = joinIds(autoGroups, " + ", 100000)
    local nColors   = 12
    local colorFade = 1
    local offFade   = 2
    local baseId    = 101
    local layNo     = 1
    local fxSweep   = FX_SWEEP_DEFAULT
    local fxFade    = FX_FADE_DEFAULT

    -- =================== ASSISTANT : ecran 1, accueil ===================
    local box = MessageBox({
        title    = "Color Picker LIVE  v" .. VERSION,
        message  = "Rig detecte : " .. found .. ".\n\n"
                .. "Je construis un board de busking couleur :\n"
                .. "  - 1 ligne par groupe + ALL, 12 couleurs\n"
                .. "  - 5 vagues FX par groupe (MAtricks), pastilles C1/C2,\n"
                .. "    vitesse et fondu FX reglables en live\n"
                .. "  - rangees FADE couleur / arret, Off All\n"
                .. "  - tout en RECIPES (Group + Preset), cuisinees par la\n"
                .. "    console : zero programmer, en live comme a la generation\n\n"
                .. "Trois ecrans de reglages, un recapitulatif, puis la\n"
                .. "construction. Chaque commande est verifiee.",
        commands = {
            { value = 1, name = "Regler" },
            { value = 2, name = "Reglages par defaut" },
            { value = 0, name = "Annuler" },
        },
    })
    if not box or box.result == 0 or box.result == nil then return end
    local useDefaults = (box.result == 2)

    local droppedIds = {}     -- numeros tapes qui n'existent pas (pour le recap)
    ::configure::
    if not useDefaults then
        -- ------------------- ecran 2 : lignes et couleurs -------------------
        local m = {}
        for i, gid in ipairs(autoGroups) do
            if i > MAX_GROUP_ROWS then m[#m + 1] = "..."; break end
            m[#m + 1] = string.format("%d=%s", gid, groupName(gid))
        end
        box = MessageBox({
            title    = "Color Picker LIVE  -  1/3  Lignes et couleurs",
            message  = "Chaque groupe devient une ligne du board (12 max),\n"
                    .. "avec ses 5 vagues FX. La ligne ALL = tous ces groupes.\n"
                    .. "Numeros separes par + ou une plage : 1 + 2, 1 Thru 8.\n"
                    .. "Groupes : " .. table.concat(m, ", ") .. "\n"
                    .. "\nCouleurs, dans l'ordre : Red Orange Amber Yellow Green\n"
                    .. "Cyan Azure Blue Violet Magenta Pink White.",
            commands = { { value = 1, name = "Suivant" }, { value = 0, name = "Annuler" } },
            inputs   = {
                { name = "Groupes du board",   value = grpStr },
                { name = "Nb couleurs (1-12)", value = tostring(nColors) },
            },
        })
        if not box or box.result ~= 1 then return end
        nColors = math.floor(toNum(box.inputs["Nb couleurs (1-12)"], 12, 1, #COLORS))
        -- Les numeros tapes doivent EXISTER : on garde les bons, on note
        -- les autres pour le recap ; si rien n'est valide, on redemande.
        local typed = box.inputs["Groupes du board"]
        local ids, rejected = parseRange(typed)
        droppedIds = {}
        for _, tok in ipairs(rejected or {}) do droppedIds[#droppedIds + 1] = tok end
        local kept = {}
        for _, id in ipairs(ids or {}) do
            if objectExists("Group " .. id) then kept[#kept + 1] = id
            else droppedIds[#droppedIds + 1] = tostring(id) end
        end
        if #kept == 0 then
            MessageBox({ title = "Color Picker LIVE  -  1/3  Lignes et couleurs",
                message  = "Aucun numero valide dans : " .. tostring(typed or "") .. "\n"
                        .. ((#droppedIds > 0) and ("Inconnus : " .. table.concat(droppedIds, ", ") .. "\n") or "")
                        .. "Reprends la liste.",
                commands = { { value = 1, name = "OK" } } })
            goto configure
        end
        grpStr = joinIds(kept, " + ", 100000)

        -- ------------------------- ecran 3 : temps -------------------------
        box = MessageBox({
            title    = "Color Picker LIVE  -  2/3  Temps",
            message  = "Fade couleur : fondu quand tu tapes une tuile.\n"
                    .. "Fade arret : fondu du Off All.\n"
                    .. "Vitesse FX : temps que met la vague pour traverser le\n"
                    .. "groupe (= le battement de la boucle). 2 s = ample.\n"
                    .. "Fondu FX : fondu de chaque machine dans la vague\n"
                    .. "(0 = bascule nette, 1 s = doux).\n\n"
                    .. "Les quatre restent reglables sur le board, en live.",
            commands = { { value = 1, name = "Suivant" }, { value = 0, name = "Annuler" } },
            inputs   = {
                { name = "Fade couleur (s)", value = fmtNum(colorFade) },
                { name = "Fade arret (s)",   value = fmtNum(offFade) },
                { name = "Vitesse FX (s)",   value = fmtNum(fxSweep) },
                { name = "Fondu FX (s)",     value = fmtNum(fxFade) },
            },
        })
        if not box or box.result ~= 1 then return end
        colorFade = toNum(box.inputs["Fade couleur (s)"], 1, 0, 600)
        offFade   = toNum(box.inputs["Fade arret (s)"], 2, 0, 600)
        -- plancher a 0.1 s : une cue de duree nulle emballerait la boucle
        fxSweep   = toNum(box.inputs["Vitesse FX (s)"], FX_SWEEP_DEFAULT, 0.1, 60)
        fxFade    = toNum(box.inputs["Fondu FX (s)"], FX_FADE_DEFAULT, 0, 60)

        -- ---------------------- ecran 4 : emplacement ----------------------
        box = MessageBox({
            title    = "Color Picker LIVE  -  3/3  Emplacement",
            message  = "Les objets du board sont ranges a partir d'un meme\n"
                    .. "numero dans les pools Sequences, Macros, Appearances,\n"
                    .. "Images 3.x et Presets 4.x (couleurs universelles).\n"
                    .. "Les numeros 1 a 100 ne sont jamais touches.\n\n"
                    .. "Le Layout indique est VIDE puis reconstruit.",
            commands = { { value = 1, name = "Suivant" }, { value = 0, name = "Annuler" } },
            inputs   = {
                { name = "ID de depart (101+)", value = tostring(baseId) },
                { name = "Layout (No)",         value = tostring(layNo) },
            },
        })
        if not box or box.result ~= 1 then return end
        baseId = math.floor(toNum(box.inputs["ID de depart (101+)"], 101, 101, 100000))
        layNo  = math.floor(toNum(box.inputs["Layout (No)"], 1, 1, 100000))
    end

    local colors = {}
    for i = 1, nColors do colors[i] = COLORS[i] end

    -- Cibles : ALL en premiere ligne (= tous les groupes du board), puis
    -- une ligne par groupe.
    local groupIds  = parseRange(grpStr) or autoGroups
    local truncated = false
    if #groupIds > MAX_GROUP_ROWS then
        truncated = true
        while #groupIds > MAX_GROUP_ROWS do table.remove(groupIds) end
    end
    local targets = { { label = "ALL", header = nil } }
    for _, gid in ipairs(groupIds) do
        targets[#targets + 1] = {
            label = groupName(gid), header = "Group " .. gid, isGroup = true, gid = gid,
        }
    end
    local nTargets = #targets

    -- Labels UNIQUES entre lignes : deux groupes au meme nom (ou un groupe
    -- nomme "ALL") donneraient des labels de sequences identiques -> MA3
    -- suffixerait "#2". On suffixe par le numero de groupe a la place.
    local seenLbl = { ALL = true }
    for ti = 2, nTargets do
        local t = targets[ti]
        if seenLbl[t.label] then
            local base, n = t.label, t.gid or ti
            repeat
                t.label = base .. " " .. tostring(n)
                n = n + 1
            until not seenLbl[t.label]
        end
        seenLbl[t.label] = true
    end

    -- Lignes de groupe (les seules a recevoir des sequences FX) : gi <-> ti.
    local groupTis, fxGiOfTi = {}, {}
    for ti, t in ipairs(targets) do
        if t.isGroup then
            groupTis[#groupTis + 1] = ti
            fxGiOfTi[ti] = #groupTis
        end
    end
    local nFx  = #groupTis
    local nDir = #FX_DIRS

    -- ------------------------- numerotation --------------------------
    -- Les numeros derives des couleurs utilisent NC = #COLORS (capacite
    -- MAX), PAS nColors : regenerer avec un autre nombre de couleurs ne
    -- doit JAMAIS decaler un slot.
    local NC  = #COLORS
    local nV  = #FADE_VALUES
    local nFV = #FX_FADES
    local nFS = #FX_SWEEPS

    -- Sequences : couleurs, puis 5 sequences FX par groupe (1 par forme).
    local nSeq    = nTargets * nColors
    local seqEnd  = baseId + nSeq - 1
    local seqFx0  = baseId + nSeq
    local seqLast = seqFx0 + nFx * nDir - 1
    local function seqColor(ti, ci) return baseId + (ti - 1) * nColors + (ci - 1) end
    local function seqFx(gi, di)    return seqFx0 + (gi - 1) * nDir + (di - 1) end

    -- Appearances. Avec image (boutons = macros) : pleine / contour par
    -- couleur + utilitaires. A PLAT (tuiles = sequences, un layout ne rend
    -- pas l'image d'une sequence) : sombre / pleine par couleur + FX.
    local function appOn(ci)  return baseId + ci - 1 end           -- pastille pleine
    local function appOff(ci) return baseId + NC + ci - 1 end      -- pastille contour
    local appDark   = baseId + 2 * NC        -- headers, banniere (a plat)
    local appGrey   = baseId + 2 * NC + 1    -- bouton fade au repos
    local appAccent = baseId + 2 * NC + 2    -- bouton fade actif (rempli)
    local appRed    = baseId + 2 * NC + 3    -- barre Off All (a plat)
    local appFxSeq  = baseId + 2 * NC + 4    -- tuile FX qui dort (a plat)
    local appFxOn   = baseId + 2 * NC + 5    -- tuile FX qui joue (a plat)
    local function appSeqOn(ci)  return baseId + 2 * NC + 6 + ci - 1 end       -- tuile qui joue
    local function appSeqOff(ci) return baseId + 3 * NC + 6 + ci - 1 end       -- tuile qui dort
    local appLastNow = baseId + 4 * NC + 5

    -- Presets : couleurs universelles + 2 slots FX (adresses STABLES).
    local PT   = 4
    local pFx1 = baseId + NC
    local pFx2 = baseId + NC + 1

    -- Images : contours, puis pleines, puis utilitaires (boutons seulement).
    local function imgOut(ci)  return baseId + ci - 1 end
    local function imgFill(ci) return baseId + NC + ci - 1 end
    local imgGrey = baseId + 2 * NC
    local imgAcc  = baseId + 2 * NC + 1
    local nImages = 2 * nColors + 2

    -- Macros : SEULEMENT les boutons de reglage (plus aucune tuile).
    local macOffAll, macAllHdr, macTitle = baseId, baseId + 1, baseId + 2
    local macFadeCHdr = baseId + 3
    local macFadeC0   = baseId + 4                  -- .. +9
    local macFadeOHdr = baseId + 4 + nV             -- +10
    local macFadeO0   = baseId + 5 + nV             -- +11 .. +16
    local macC1Hdr    = baseId + 5 + 2 * nV         -- +17
    local macC1_0     = macC1Hdr + 1                -- +18 .. +29
    local macC2Hdr    = macC1_0 + NC                -- +30
    local macC2_0     = macC2Hdr + 1                -- +31 .. +42
    local macFxVHdr   = macC2_0 + NC                -- +43  "FX VITESSE <v>"
    local macFxV0     = macFxVHdr + 1               -- +44 .. +48
    local macFxFHdr   = macFxV0 + nFS               -- +49  "FX FONDU <v>"
    local macFxF0     = macFxFHdr + 1               -- +50 .. +54
    local macReCook   = macFxF0 + nFV               -- +55
    local macEnd      = macReCook

    -- Plafonds de NETTOYAGE : la PLUS GROSSE empreinte possible, versions
    -- precedentes comprises (la v8 avait une macro par tuile), pour qu'une
    -- regeneration ne laisse jamais d'orphelins.
    local MAX_ROWS  = 1 + MAX_GROUP_ROWS
    local seqDelEnd = baseId + MAX_ROWS * NC + MAX_GROUP_ROWS * nDir - 1
    local macDelEnd = baseId + 8 + 2 * nV + 5 + 2 * NC
                        + MAX_ROWS * NC + MAX_GROUP_ROWS * nDir - 1
    local appDelEnd = appLastNow
    local imgDelEnd = baseId + 2 * NC + 3
    local seqProbe  = seqDelEnd            -- sequence de test du CMD, effacee

    -- ------------------- occupation / confirmation -------------------
    local occupied, detectOk = false, true
    local function checkExists(fmt, a, b)
        for no = a, b do
            if objectExists(string.format(fmt, no)) then occupied = true; return end
        end
    end
    checkExists("Sequence %d", baseId, seqDelEnd)
    if not occupied then checkExists("Macro %d", baseId, macDelEnd) end
    if not occupied then checkExists("Appearance %d", baseId, appDelEnd) end
    if not occupied then checkExists("Image 3.%d", baseId, imgDelEnd) end

    -- Presets couleur d'une AUTRE palette : reutilises tels quels si le
    -- label correspond, sinon remis a la couleur du plugin (annonce).
    local staleColors = {}
    for ci, c in ipairs(colors) do
        local nm = presetName(PT, baseId + ci - 1)
        if nm and nm ~= c.name then
            staleColors[#staleColors + 1] = string.format("4.%d %s -> %s",
                baseId + ci - 1, nm, c.name)
        end
    end
    if #staleColors > 0 then occupied = true end
    -- Les deux SLOTS FX appartiennent au plugin ("CP FX C1" / "CP FX C2").
    local foreignSlots = {}
    for _, slot in ipairs({ pFx1, pFx2 }) do
        if objectExists(string.format("Preset %d.%d", PT, slot)) then
            local nm = presetName(PT, slot)
            if nm == nil or not nm:match("^CP FX") then
                foreignSlots[#foreignSlots + 1] = string.format("4.%d (%s)", slot, nm or "?")
            end
        end
    end
    if #foreignSlots > 0 then occupied = true end
    -- (MAtricks "CPFX" : reliquat des versions 7 -> nettoye s'il existe.)
    local oldMatricks = objectExists("MAtricks " .. baseId)
    if oldMatricks then occupied = true end
    if not occupied and (objectExists("Layout " .. layNo) or objectUsed("Layout " .. layNo)) then
        occupied = true
    end

    -- Presets a creer (= le seul moment ou le programmer sert : un preset
    -- ne se cree pas sans valeurs).
    local presetsToCreate, presetsToReuse = 0, 0
    for ci, c in ipairs(colors) do
        local pNo    = baseId + ci - 1
        local exists = objectExists(string.format("Preset %d.%d", PT, pNo))
        local nm     = exists and presetName(PT, pNo) or nil
        if not exists then presetsToCreate = presetsToCreate + 1
        elseif nm == nil or nm == c.name then presetsToReuse = presetsToReuse + 1 end
    end

    -- ==================== ASSISTANT : recapitulatif ====================
    local rowNames = {}
    for ti, t in ipairs(targets) do rowNames[ti] = t.label end
    local recap = string.format(
        "LIGNES (%d) : %s\n"
     .. "COULEURS : %d   FX : %d vagues (%d formes x %d groupes)\n\n"
     .. "Fade couleur %ss - Fade arret %ss\n"
     .. "Vitesse FX %ss - Fondu FX %ss\n\n"
     .. "ECRIT DANS LE SHOW (en recipes Group + Preset) :\n"
     .. "  Sequences %d-%d   Macros %d-%d\n"
     .. "  Appearances %d-%d   Images 3.%d-3.%d   Layout %d\n"
     .. "  Presets 4.%d-4.%d : %d reutilises, %d crees, %d corriges\n"
     .. "  (presets jamais effaces ; slots FX 4.%d et 4.%d)\n"
     .. "Programmer : un ClearAll au depart%s.\n",
        nTargets, table.concat(rowNames, ", "),
        nColors, nFx * nDir, nDir, nFx,
        fmtNum(colorFade), fmtNum(offFade), fmtNum(fxSweep), fmtNum(fxFade),
        baseId, seqLast, baseId, macEnd,
        baseId, appDelEnd, baseId, baseId + nImages - 1, layNo,
        baseId, baseId + nColors - 1, presetsToReuse, presetsToCreate, #staleColors,
        pFx1, pFx2,
        ((presetsToCreate + #staleColors) > 0)
            and string.format(", et %d preset(s) a stocker (puis ClearAll)", presetsToCreate + #staleColors)
            or ", rien d'autre")
    if truncated then
        recap = recap .. string.format("\n(Lignes limitees a %d.)\n", MAX_GROUP_ROWS)
    end
    if #droppedIds > 0 then
        recap = recap .. "\nIgnores (inexistants) : " .. table.concat(droppedIds, ", ") .. "\n"
    end
    if occupied then
        recap = recap .. string.format(
            "\nATTENTION : ces plages contiennent deja des objets.\n"
         .. "Ils seront SUPPRIMES puis regeneres (nettoyage large :\n"
         .. "Sequence %d-%d, Macro %d-%d, Appearance %d-%d,\n"
         .. "Image 3.%d-3.%d, Layout %d%s).\n",
            baseId, seqDelEnd, baseId, macDelEnd, baseId, appDelEnd,
            baseId, imgDelEnd, layNo,
            oldMatricks and string.format(", MAtricks %d", baseId) or "")
        if #staleColors > 0 then
            recap = recap .. string.format(
                "%d preset(s) d'une autre palette seront remis a leur\n"
             .. "couleur (ex. %s).\n", #staleColors, staleColors[1])
        end
        if #foreignSlots > 0 then
            recap = recap .. "Preset(s) a toi pris comme slots FX (ecrases) : "
                          .. table.concat(foreignSlots, ", ") .. "\n"
        end
    else
        recap = recap .. "\nPlages libres : rien d'existant ne sera touche.\n"
    end
    box = MessageBox({
        title    = "Color Picker LIVE  -  Recapitulatif",
        message  = recap,
        commands = {
            { value = 1, name = "Construire" },
            { value = 2, name = "Modifier" },
            { value = 0, name = "Annuler" },
        },
    })
    if not box or box.result == 0 or box.result == nil then return end
    if box.result == 2 then
        useDefaults = false
        goto configure
    end
    if occupied then
        -- Relacher AVANT de supprimer : une sequence effacee en cours de
        -- lecture coupe sa couleur d'un seul coup sur le plateau.
        run(string.format('Off Sequence %d Thru %d Fade %s', baseId, seqDelEnd, fmtNum(offFade)), true)
        for _ = 1, math.min(50, math.ceil(offFade * 10)) do pcall(coroutine.yield, 0.1) end
        run(string.format('Delete Sequence %d Thru %d /NoConfirmation', baseId, seqDelEnd), true)
        run(string.format('Delete Macro %d Thru %d /NoConfirmation', baseId, macDelEnd), true)
        run(string.format('Delete Appearance %d Thru %d /NoConfirmation', baseId, appDelEnd), true)
        run(string.format('Delete Image 3.%d Thru Image 3.%d /NoConfirmation', baseId, imgDelEnd), true)
        if oldMatricks then
            run(string.format('Delete MAtricks %d /NoConfirmation', baseId), true)
        end
        run(string.format('Delete Layout %d /NoConfirmation', layNo), true)
    end
    -- Le seul ClearAll "de principe" : un programmer charge au moment du
    -- Store mettrait des valeurs dures dans les cues (Cook /Overwrite les
    -- effacerait, mais autant partir propre).
    Cmd("ClearAll")

    -- 1) Appearances.
    for i, c in ipairs(colors) do
        makeAppearance(appOn(i),     "CP " .. c.name,            c.r, c.g, c.b)
        makeAppearance(appOff(i),    "CP " .. c.name .. " Dim",
            math.floor(c.r * 0.30), math.floor(c.g * 0.30), math.floor(c.b * 0.30))
        makeAppearance(appSeqOn(i),  "CP Tile " .. c.name,       c.r, c.g, c.b)
        makeAppearance(appSeqOff(i), "CP Tile " .. c.name .. " Dim",
            math.floor(c.r * 0.30), math.floor(c.g * 0.30), math.floor(c.b * 0.30))
    end
    makeAppearance(appDark,   "CP Dark",    36, 40, 48)
    makeAppearance(appGrey,   "CP Grey",    66, 72, 84)
    makeAppearance(appAccent, "CP Fade On", 235, 238, 245)
    makeAppearance(appRed,    "CP Off Red", 128, 34, 40)
    makeAppearance(appFxSeq,  "CP FX",       52, 30,  80)
    makeAppearance(appFxOn,   "CP FX On",   150, 90, 235)
    breathe()

    -- 1a) Images NEON pour les BOUTONS (macros) : pastilles C1/C2 et
    --     rangees de reglage. Le fond de l'appearance passe en alpha 0
    --     UNIQUEMENT si l'image est bien en place.
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
            Cmd(string.format("Import Image 'Images'.%d /File '%s' /Path '%s' /NoConfirmation /NoOops",
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
                    a:Set("ImageMode", "Bar")
                end
            end)
        end
        for i, c in ipairs(colors) do
            if writeAndImport(imgOut(i), string.format("cp_neon_%02d.png", i), c.r, c.g, c.b, false) then
                imagesOk = imagesOk + 1
                attach(imgOut(i), appOff(i))
            end
            if writeAndImport(imgFill(i), string.format("cp_fill_%02d.png", i), c.r, c.g, c.b, true) then
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
        pcall(function() SyncFS() end)
    end)
    breathe()

    -- 1b) Presets couleur UNIVERSELS (pool Color = 4). Existants et bien
    --     labellises -> REUTILISES. Sinon -> stockes depuis le programmer
    --     (le seul objet qui l'exige), puis ClearAll.
    local presetsCreated, presetsReused, presetsFixed = 0, 0, 0
    local okPresets, errPresets = pcall(function()
        for ci, c in ipairs(colors) do
            local pNo    = baseId + ci - 1
            local exists = objectExists(string.format("Preset %d.%d", PT, pNo))
            local nm     = exists and presetName(PT, pNo) or nil
            if exists and (nm == nil or nm == c.name) then
                presetsReused = presetsReused + 1
            else
                Cmd("ClearAll")
                Cmd("Fixture Thru")
                Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(c.r / 255 * 100 + 0.5)))
                Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(c.g / 255 * 100 + 0.5)))
                Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(c.b / 255 * 100 + 0.5)))
                run(string.format('Store Preset %d.%d /Overwrite /NoConfirmation /Universal', PT, pNo))
                run(string.format('Label Preset %d.%d "%s"', PT, pNo, c.name), true)
                if exists then presetsFixed = presetsFixed + 1
                else presetsCreated = presetsCreated + 1 end
            end
        end
    end)
    Cmd("ClearAll")
    if not okPresets then
        Printf("[CP] presets : %s", tostring(errPresets))
    end
    -- 1c) Slots FX (C1 / C2) : re-semes a chaque generation (C1 = 1ere
    --     couleur, C2 = 8e), pour que l'en-tete dise ce que la boucle joue.
    run(string.format('Copy Preset %d.%d At Preset %d.%d /Overwrite /NoConfirmation /NoOops',
        PT, baseId, PT, pFx1))
    run(string.format('Copy Preset %d.%d At Preset %d.%d /Overwrite /NoConfirmation /NoOops',
        PT, baseId + math.min(7, nColors - 1), PT, pFx2))
    run(string.format('Label Preset %d.%d "CP FX C1"', PT, pFx1), true)
    run(string.format('Label Preset %d.%d "CP FX C2"', PT, pFx2), true)
    breathe()

    -- 2) Membres des groupes : pour savoir qui CHEVAUCHE qui (une couleur
    --    doit couper toutes les boucles qui touchent ses machines).
    local grpSet, grpKnown = {}, 0
    for gi, ti in ipairs(groupTis) do
        local gid = targets[ti].gid
        local members = groupMembers(gid)
        if not members then members = groupMembersBySelection(gid) end
        if members then
            local set = {}
            for _, k in ipairs(members) do set[k] = true end
            grpSet[gi] = set
            grpKnown = grpKnown + 1
        end
    end
    local function overlappingGis(ti)
        local out = {}
        local mine = fxGiOfTi[ti]
        for gi = 1, nFx do
            local hit
            if ti == 1 or gi == mine then
                hit = true                                -- ALL, ou son propre groupe
            elseif not mine or not grpSet[gi] or not grpSet[mine] then
                hit = true                                -- inconnu -> prudent
            else
                for k in pairs(grpSet[mine]) do
                    if grpSet[gi][k] then hit = true; break end
                end
            end
            if hit then out[#out + 1] = gi end
        end
        return out
    end
    -- Plages de boucles a couper quand on tape la ligne ti, moins "except".
    local function killRanges(ti, except)
        local gis = overlappingGis(ti)
        local ranges = {}
        local function add(a, b)
            if except and except >= a and except <= b then
                if except > a then ranges[#ranges + 1] = { a, except - 1 } end
                if except < b then ranges[#ranges + 1] = { except + 1, b } end
            else
                ranges[#ranges + 1] = { a, b }
            end
        end
        if #gis == nFx and nFx > 0 then
            add(seqFx0, seqLast)
        else
            for _, gi in ipairs(gis) do add(seqFx(gi, 1), seqFx(gi, nDir)) end
        end
        return ranges
    end
    local function rowKillCmd(ti, fade)
        return offListCmd(killRanges(ti), fade)
    end

    -- 3) Probe : un CMD de cue s'execute-t-il au Go+ sur ce build ?
    local cmdProbe = probeCueCommand(seqProbe)
    breathe()

    -- ======================= 4) SEQUENCES EN RECIPES =======================
    local linesWanted, linesOk, cuesWanted, cuesCooked, cuesUnknown = 0, 0, 0, 0, 0
    local trigOk, trigWanted, trigUnknown = 0, 0, 0
    local function noteCue(sq, cue)
        cuesWanted = cuesWanted + 1
        local hd = cueHasData(sq, cue)
        if hd == nil then cuesUnknown = cuesUnknown + 1
        elseif hd then cuesCooked = cuesCooked + 1 end
    end
    -- Groupes d'une ligne : ALL = tous les groupes du board.
    local function rowGroupIds(ti)
        if ti == 1 then
            local ids = {}
            for _, tj in ipairs(groupTis) do ids[#ids + 1] = targets[tj].gid end
            return ids
        end
        return { targets[ti].gid }
    end

    local okBuild, errBuild = pcall(function()
        -- 4a) Sequences couleur : 1 par (ligne x couleur), 1 cue, une ligne
        --     de recipe par groupe de la ligne.
        for ti, t in ipairs(targets) do
            for ci, c in ipairs(colors) do
                local sq = seqColor(ti, ci)
                run(string.format('Store Sequence %d Cue 1 /Overwrite /NoConfirmation', sq))
                for k, gid in ipairs(rowGroupIds(ti)) do
                    linesWanted = linesWanted + 1
                    if addRecipeLine(sq, 1, k, gid, PT, baseId + ci - 1) then linesOk = linesOk + 1 end
                end
                cook(sq)
                run(string.format('Label Sequence %d "%s %s"', sq, t.label, c.name), true)
                setProp("Sequence " .. sq, "OffWhenOverridden", "Yes")
                setProp("Sequence " .. sq, "PreferCueAppearance", "Yes", true)
                setProp(string.format("Sequence %d Cue 1", sq), "CueInFade", fmtNum(colorFade))
                run(string.format('Assign Appearance %d At Sequence %d', appSeqOff(ci), sq), true)
                run(string.format('Assign Appearance %d At Sequence %d Cue 1', appSeqOn(ci), sq), true)
                local cmd = rowKillCmd(ti, colorFade)
                if cmd then setProp(string.format("Sequence %d Cue 1", sq), "Command", cmd) end
                noteCue(sq, 1)
            end
            breathe()
        end

        -- 4b) Sequences FX : 5 par groupe, 2 cues Follow + WrapAround,
        --     une ligne de recipe par cue (Group -> slot C1 / C2) portant
        --     les timings MAtricks de la forme.
        for gi, ti in ipairs(groupTis) do
            local t = targets[ti]
            for di, dir in ipairs(FX_DIRS) do
                local sq = seqFx(gi, di)
                local killCmd = offListCmd(killRanges(ti, sq), FX_KILL_FADE)
                for k = 1, 2 do
                    run(string.format('Store Sequence %d Cue %d /Overwrite /NoConfirmation', sq, k))
                    linesWanted = linesWanted + 1
                    if addRecipeLine(sq, k, 1, t.gid, PT, (k == 1) and pFx1 or pFx2) then
                        linesOk = linesOk + 1
                    end
                    setLineProp(sq, k, 1, "DelayFromX", "0")
                    setLineProp(sq, k, 1, "DelayToX", fmtNum(fxSweep))
                    if dir.wings  then setLineProp(sq, k, 1, "XWings", "2") end
                    if dir.group2 then setLineProp(sq, k, 1, "XGroup", "2") end
                    if dir.invert then
                        setLineProp(sq, k, 1, "InvertX", "Yes")
                        setLineProp(sq, k, 1, "InvertStyle", "All")
                    end
                    setProp(string.format("Sequence %d Cue %d", sq, k), "TrigType", "Follow")
                    setProp(string.format("Sequence %d Cue %d", sq, k), "CueInFade", fmtNum(fxFade))
                    run(string.format('Assign Appearance %d At Sequence %d Cue %d', appFxOn, sq, k), true)
                    if killCmd then setProp(string.format("Sequence %d Cue %d", sq, k), "Command", killCmd) end
                end
                setPropTry("Sequence " .. sq, "WrapAround", { "Yes", "1" })
                setProp("Sequence " .. sq, "OffWhenOverridden", "Yes")
                setProp("Sequence " .. sq, "PreferCueAppearance", "Yes", true)
                run(string.format('Assign Appearance %d At Sequence %d', appFxSeq, sq), true)
                cook(sq)
                run(string.format('Label Sequence %d "FX %s %s"', sq, t.label, dir.lbl), true)
                for k = 1, 2 do
                    noteCue(sq, k)
                    trigWanted = trigWanted + 1
                    local tt = getProp(string.format("Sequence %d Cue %d", sq, k), "TrigType")
                    if tt == nil then trigUnknown = trigUnknown + 1
                    elseif tt:lower() == "follow" then trigOk = trigOk + 1 end
                end
            end
            breathe()
        end
    end)
    Cmd("ClearAll")
    if not okBuild then
        Printf("[CP] echec pendant la construction : %s", tostring(errBuild))
        MessageBox({ title = "Color Picker LIVE",
            message = "La construction s'est interrompue.\n\n"
                   .. "Le programmer est vide. Le board est incomplet :\n"
                   .. "relance la generation (les plages seront nettoyees).\n\n"
                   .. "Detail : " .. tostring(errBuild),
            commands = { { value = 1, name = "OK" } } })
        return
    end

    -- Les rangees FADE reecrivent les cues par PLAGE ("Sequence a Thru b
    -- Cue 1") : une seule ligne de macro. On verifie ici que la console
    -- accepte cette forme ; sinon les macros detaillent sequence par
    -- sequence (plus long, mais sur).
    local rangedOk = run(string.format('Set Sequence %d Thru %d Cue 1 Property "CueInFade" "%s"',
        baseId, seqEnd, fmtNum(colorFade)))

    -- ============================ 5) MACROS ============================
    local placed, failed = 0, 0
    local okBoard, errBoard = pcall(function()
        -- 5a) Off All : relache tout avec le fade d'arret. L'etat des
        --     tuiles suit tout seul (sequences eteintes = sombres).
        makeMacro(macOffAll, "Off All", appRed,
            { offListCmd({ { baseId, seqLast } }, offFade) })
        makeMacro(macAllHdr, "ALL", appDark, {})
        makeMacro(macTitle, "C O L O R  P I C K E R   -   v" .. VERSION, appDark, {})

        -- 5b) Rangees FADE : un bouton = reglage de tout le board + etat
        --     affiche (bouton actif surligne, en-tete relabellee). Libelles
        --     UNIQUES entre les deux rangees (sinon MA3 suffixe "#2").
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
            local vs = fmtNum(v)
            local linesC, linesO = {}, {}
            -- fade couleur : le CueInFade de toutes les cues couleur...
            if rangedOk then
                linesC[#linesC + 1] = string.format(
                    'Set Sequence %d Thru %d Cue 1 Property "CueInFade" "%s"', baseId, seqEnd, vs)
            else
                for sq = baseId, seqEnd do
                    linesC[#linesC + 1] = string.format(
                        'Set Sequence %d Cue 1 Property "CueInFade" "%s"', sq, vs)
                end
            end
            -- ... et le fade du CMD (relache des boucles) de chaque ligne.
            for ti = 1, nTargets do
                local cmd = rowKillCmd(ti, v)
                if cmd then
                    if rangedOk then
                        linesC[#linesC + 1] = string.format(
                            'Set Sequence %d Thru %d Cue 1 Property "Command" "%s"',
                            seqColor(ti, 1), seqColor(ti, nColors), cmd)
                    else
                        for ci = 1, nColors do
                            linesC[#linesC + 1] = string.format(
                                'Set Sequence %d Cue 1 Property "Command" "%s"', seqColor(ti, ci), cmd)
                        end
                    end
                end
            end
            -- fade d'arret : la ligne 1 d'Off All.
            linesO[#linesO + 1] = string.format(
                'Set Macro %d.1 Property "Command" "%s"',
                macOffAll, offListCmd({ { baseId, seqLast } }, v))
            linesC[#linesC + 1] = string.format('Label Macro %d "FADE couleur %s"', macFadeCHdr, fadeLabel(v))
            linesO[#linesO + 1] = string.format('Label Macro %d "FADE arret %s"', macFadeOHdr, fadeLabel(v))
            for vj = 1, nV do
                linesC[#linesC + 1] = string.format('Assign Appearance %d At Macro %d',
                    (vj == vi) and appAccent or appGrey, macFadeC0 + vj - 1)
                linesO[#linesO + 1] = string.format('Assign Appearance %d At Macro %d',
                    (vj == vi) and appAccent or appGrey, macFadeO0 + vj - 1)
            end
            makeMacro(macFadeC0 + vi - 1, fadeLabel(v),  (v == colorFade) and appAccent or appGrey, linesC)
            makeMacro(macFadeO0 + vi - 1, fadeLabelO(v), (v == offFade)   and appAccent or appGrey, linesO)
        end
        breathe()

        -- 5c) Pastilles FX C1 / C2 : copient la couleur choisie dans le
        --     preset SLOT (Copy /Overwrite) -> les cues cuisinees, qui
        --     REFERENCENT le slot, changent de couleur en live.
        makeMacro(macC1Hdr, "FX C1 " .. colors[1].name, appDark, {})
        makeMacro(macC2Hdr, "FX C2 " .. colors[math.min(8, nColors)].name, appDark, {})
        local function makeSlotRow(hdrNo, base0, slotNo, hdrName, btnPrefix, defaultCi)
            for ci, c in ipairs(colors) do
                local lines = {
                    string.format('Copy Preset %d.%d At Preset %d.%d /Overwrite /NoConfirmation /NoOops',
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
        breathe()

        -- 5d) FX VITESSE : le battement de la vague = DelayToX des recipes
        --     de boucle, puis recuisson. (Possible en cours de lecture.)
        local function secLabel(v)
            if v == math.floor(v) then return string.format("%ds", v) end
            return tostring(v) .. "s"
        end
        makeMacro(macFxVHdr, "FX VITESSE " .. secLabel(fxSweep), appDark, {})
        for vi, v in ipairs(FX_SWEEPS) do
            local lines = {}
            for gi = 1, nFx do
                for di = 1, nDir do
                    for k = 1, 2 do
                        lines[#lines + 1] = string.format(
                            'Set Sequence %d Cue %d Part 0.1 Property "DelayToX" "%s"',
                            seqFx(gi, di), k, fmtNum(v))
                    end
                end
            end
            for gi = 1, nFx do
                for di = 1, nDir do
                    lines[#lines + 1] = string.format('Cook Sequence %d /Overwrite', seqFx(gi, di))
                end
            end
            lines[#lines + 1] = string.format('Label Macro %d "FX VITESSE %s"', macFxVHdr, secLabel(v))
            for vj = 1, nFS do
                lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d',
                    (vj == vi) and appAccent or appGrey, macFxV0 + vj - 1)
            end
            makeMacro(macFxV0 + vi - 1, "FXV " .. fmtNum(v), (v == fxSweep) and appAccent or appGrey, lines)
        end

        -- 5e) FX FONDU : le fondu de chaque machine dans la vague
        --     (CueInFade des deux cues de chaque boucle).
        makeMacro(macFxFHdr, "FX FONDU " .. secLabel(fxFade), appDark, {})
        for vi, v in ipairs(FX_FADES) do
            local lines = {}
            for gi = 1, nFx do
                for di = 1, nDir do
                    for k = 1, 2 do
                        lines[#lines + 1] = string.format(
                            'Set Sequence %d Cue %d Property "CueInFade" "%s"', seqFx(gi, di), k, fmtNum(v))
                    end
                end
            end
            lines[#lines + 1] = string.format('Label Macro %d "FX FONDU %s"', macFxFHdr, secLabel(v))
            for vj = 1, nFV do
                lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d',
                    (vj == vi) and appAccent or appGrey, macFxF0 + vj - 1)
            end
            makeMacro(macFxF0 + vi - 1, "FXF " .. fmtNum(v), (v == fxFade) and appAccent or appGrey, lines)
        end

        -- 5f) RE-CUISINER : apres un repatch ou un groupe modifie, toutes
        --     les cues sont recuisinees depuis leurs recipes.
        local reLines = {}
        for sq = baseId, seqLast do
            reLines[#reLines + 1] = string.format('Cook Sequence %d /Overwrite', sq)
        end
        makeMacro(macReCook, "RE-CUISINER", appDark, reLines)
        breathe()

        -- ============================ 6) LAYOUT ============================
        run(string.format('Store Layout %d /NoConfirmation', layNo))
        run(string.format('Label Layout %d "Color Picker LIVE"', layNo), true)

        local elements = {}
        local fullW = 2 + nColors + nDir

        elements[#elements + 1] = { object = "Macro " .. macTitle, x = 0, y = 0, w = fullW, noicon = true }

        -- Lignes : ALL puis groupes ; tuiles = les SEQUENCES.
        local rowTop = 1.3
        for ti, t in ipairs(targets) do
            local row = rowTop + (ti - 1)
            if t.header then
                elements[#elements + 1] = { object = t.header, x = 0, y = row, w = 2, noicon = true, inert = true }
            else
                elements[#elements + 1] = { object = "Macro " .. macAllHdr, x = 0, y = row, w = 2, noicon = true }
            end
            for ci = 1, nColors do
                elements[#elements + 1] = { object = "Sequence " .. seqColor(ti, ci), x = 2 + ci - 1, y = row, clean = true }
            end
            local gi = fxGiOfTi[ti]
            if gi then
                for di, dir in ipairs(FX_DIRS) do
                    elements[#elements + 1] = {
                        object = "Sequence " .. seqFx(gi, di), x = 2 + nColors + di - 1, y = row,
                        clean = true, text = dir.lbl, textSize = 14,
                    }
                end
            end
        end

        -- Barre Off All, rangees FADE, pastilles, rangees FX.
        local yOff = rowTop + nTargets + 0.3
        local fy1  = yOff + 1.3
        local fy2  = fy1 + 1
        elements[#elements + 1] = { object = "Macro " .. macOffAll,   x = 0, y = yOff, w = fullW, noicon = true }
        elements[#elements + 1] = { object = "Macro " .. macFadeCHdr, x = 0, y = fy1, w = 2, noicon = true }
        elements[#elements + 1] = { object = "Macro " .. macFadeOHdr, x = 0, y = fy2, w = 2, noicon = true }
        for vi = 1, nV do
            elements[#elements + 1] = { object = "Macro " .. (macFadeC0 + vi - 1), x = 2 + vi - 1, y = fy1, noicon = true }
            elements[#elements + 1] = { object = "Macro " .. (macFadeO0 + vi - 1), x = 2 + vi - 1, y = fy2, noicon = true }
        end
        local fy3 = fy2 + 1.3
        local fy4 = fy3 + 1
        elements[#elements + 1] = { object = "Macro " .. macC1Hdr, x = 0, y = fy3, w = 2, noicon = true }
        elements[#elements + 1] = { object = "Macro " .. macC2Hdr, x = 0, y = fy4, w = 2, noicon = true }
        for ci = 1, nColors do
            elements[#elements + 1] = { object = "Macro " .. (macC1_0 + ci - 1), x = 2 + ci - 1, y = fy3, clean = true }
            elements[#elements + 1] = { object = "Macro " .. (macC2_0 + ci - 1), x = 2 + ci - 1, y = fy4, clean = true }
        end
        local fy5 = fy4 + 1.3
        local fy6 = fy5 + 1
        elements[#elements + 1] = { object = "Macro " .. macFxVHdr, x = 0, y = fy5, w = 2, noicon = true }
        elements[#elements + 1] = { object = "Macro " .. macFxFHdr, x = 0, y = fy6, w = 2, noicon = true }
        for vi = 1, nFS do
            elements[#elements + 1] = { object = "Macro " .. (macFxV0 + vi - 1), x = 2 + vi - 1, y = fy5,
                noicon = true, text = fmtNum(FX_SWEEPS[vi]) .. "s", textSize = 14 }
        end
        for vi = 1, nFV do
            elements[#elements + 1] = { object = "Macro " .. (macFxF0 + vi - 1), x = 2 + vi - 1, y = fy6,
                noicon = true, text = fmtNum(FX_FADES[vi]) .. "s", textSize = 14 }
        end
        -- RE-CUISINER a droite de la rangee FX VITESSE si la place existe.
        local yBottom = fy6
        if fullW >= 2 + nFS + 1 + 2 then
            elements[#elements + 1] = { object = "Macro " .. macReCook, x = fullW - 2, y = fy5, w = 2, noicon = true }
        else
            yBottom = fy6 + 1.3
            elements[#elements + 1] = { object = "Macro " .. macReCook, x = 0, y = yBottom, w = 2, noicon = true }
        end

        -- Le layout MA3 rend l'axe Y vers le HAUT : on inverse les Y pour
        -- afficher le board dans l'ordre concu (titre en haut, FX en bas).
        for _, e in ipairs(elements) do e.y = yBottom - e.y end

        placed, failed = fillLayout(layNo, elements)
    end)
    Cmd("ClearAll")
    if not okBoard then
        Printf("[CP] echec pendant la construction du board : %s", tostring(errBoard))
        MessageBox({ title = "Color Picker LIVE",
            message = "La construction du board s'est interrompue.\n\n"
                   .. "Les sequences sont la, mais des cases manquent :\n"
                   .. "relance la generation.\n\n"
                   .. "Detail : " .. tostring(errBoard),
            commands = { { value = 1, name = "OK" } } })
        return
    end

    -- ===================== ASSISTANT : ecran final =====================
    local checks = string.format(
        "CONTROLES\n"
     .. "  Commandes refusees : %d%s\n"
     .. "  Lignes de recipe : %d/%d   Cues cuisinees : %d/%d%s\n"
     .. "  Boucles en Follow : %d/%d%s   Groupes enumeres : %d/%d\n"
     .. "  CMD de cue : %s\n",
        CP.fails, (CP.fails > 0 and CP.firstFail) and ("\n    1ere : " .. CP.firstFail) or "",
        linesOk, linesWanted, cuesCooked, cuesWanted,
        (cuesUnknown > 0) and string.format(" (%d non verifiables)", cuesUnknown) or "",
        trigOk, trigWanted,
        (trigUnknown > 0) and string.format(" (%d non verifiables)", trigUnknown) or "",
        grpKnown, nFx,
        (cmdProbe == true) and "OK"
            or (cmdProbe == false) and "NON (les boucles d'autres groupes ne seront pas coupees)"
            or "non verifiable")
    local note = ""
    if failed > 0 then
        note = string.format("  (%d case(s) non placee(s))", failed)
    end
    if macroLineFails > 0 then
        note = note .. string.format("  (%d macro(s) sans lignes : regenere)", macroLineFails)
    end
    if not rangedOk then
        note = note .. "\n(Set par plage refuse : rangees FADE detaillees, un peu plus lentes.)"
    end
    local headline = (CP.fails == 0 and linesOk == linesWanted and cuesCooked + cuesUnknown == cuesWanted)
        and "Board construit."
        or  "Board construit AVEC DES REFUS : regarde les controles."
    local msg = string.format(
        "%s\n\n"
     .. "Lignes %d (%s)\n"
     .. "%d couleurs - %d vagues FX (recipes Group + Preset)\n"
     .. "Sequences %d-%d - Macros %d-%d\n"
     .. "Images 3.%d-3.%d : %d/%d importees\n"
     .. "Presets 4.%d-4.%d : %d reutilises, %d crees, %d corriges\n"
     .. "Layout %d : %d/%d cases%s\n\n"
     .. "%s\n"
     .. "EN LIVE\n"
     .. "  Tuile couleur : la ligne change, la tuile s'allume.\n"
     .. "  J>C  C>J  E>I  I>E  1/2 : vague C1<->C2 sur le groupe.\n"
     .. "  C1 / C2 : couleurs de la vague, modifiables en cours.\n"
     .. "  FX VITESSE / FX FONDU : battement et douceur de la vague.\n"
     .. "  FADE couleur / arret : le bouton actif est surligne.\n"
     .. "  Off All : tout relacher.  RE-CUISINER : apres un repatch.",
        headline,
        nTargets, table.concat(rowNames, ", "), nColors, nFx * nDir,
        baseId, seqLast, baseId, macEnd,
        baseId, baseId + nImages - 1, imagesOk, nImages,
        baseId, baseId + nColors - 1, presetsReused, presetsCreated, presetsFixed,
        layNo, placed, placed + failed, note,
        checks)

    MessageBox({ title = "Color Picker LIVE  v" .. VERSION, message = msg,
        commands = { { value = 1, name = "OK" } } })
    Printf("[ColorPickerLive v%s] %d lignes x %d couleurs, %d FX, layout %d : %d/%d cases, %d refus.",
        VERSION, nTargets, nColors, nFx * nDir, layNo, placed, placed + failed, CP.fails)
end

return main
