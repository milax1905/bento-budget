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
--    (Re-cuisiner, apres un repatch : bouton de l'assistant, pas du board)
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
-- quoi". Ici chaque refus est compte, le premier est cite au bilan, et
-- chaque propriete ecrite est RELUE : c'est la relecture qui fait foi,
-- pas la chaine renvoyee.
local CP = {}
local function resetCP()
    CP.fails      = 0       -- commandes refusees / relectures fausses
    CP.firstFail  = nil
    CP.cosmetic   = 0       -- habillage (labels) refuse
    CP.unknown    = 0       -- Cmd() sans retour (nil) : ni succes ni echec
    CP.unverified = 0       -- propriete ecrite mais illisible
    CP.cmdRefused = {}      -- [propriete] = true : ecrite par le handle, pas par la commande
    CP.display    = { prefer = { 0, 0 }, cueApp = { 0, 0 }, seqApp = { 0, 0 } }
    CP.warnings   = {}
end
resetCP()

local function warn(s)
    if #CP.warnings < 12 then CP.warnings[#CP.warnings + 1] = s end
    Printf("[CP] %s", s)
end

-- true = Ok, false = refus, nil = pas de retour (build muet)
local function cmdOk(r)
    if r == nil then return nil end
    local s = tostring(r):lower()
    return s:sub(1, 2) == "ok"
end

local function fail(s)
    CP.fails = CP.fails + 1
    if not CP.firstFail then CP.firstFail = s end
    Printf("[CP] refuse : %s", s)
end

-- cosmetic = true : commande d'habillage (label...) dont l'echec ne casse
-- pas le board -> comptee a part. Renvoie true si la commande est passee
-- (ou sans retour), false si elle est refusee.
local function run(s, cosmetic)
    local r = Cmd(s)
    local ok = cmdOk(r)
    if ok == nil then CP.unknown = CP.unknown + 1; return true end
    if ok then return true end
    if cosmetic then
        CP.cosmetic = CP.cosmetic + 1
        Printf("[CP] habillage refuse : %s -> %s", s, tostring(r))
    else
        fail(string.format("%s  ->  %s", s, tostring(r)))
    end
    return false
end

local function handleOf(addr)
    local h
    pcall(function() h = ObjectList(addr)[1] end)
    return h
end

-- Valeur pour la ligne de commande : nombres nus, textes entre guillemets
-- (formes relevees sur console : 'CueInFade' 2, 'WrapAround' 1,
-- "TrigType" "Follow").
local function fmtVal(v)
    if type(v) == "number" then return fmtNum(v) end
    local s = tostring(v)
    if s:match("^%-?%d+%.?%d*$") then return s end
    return '"' .. s .. '"'
end

-- Normalisation tolerante pour comparer ce qu'on a ecrit a ce qu'on relit
-- ("Yes"/"true"/1, "2"/"2.00"/"2s", "Follow"/"follow").
local function norm(v)
    if v == nil then return nil end
    local s = tostring(v):gsub("^%s+", ""):gsub("%s+$", ""):lower()
    if s == "yes" or s == "true" or s == "on" then return "1" end
    if s == "no" or s == "false" or s == "off" then return "0" end
    local n = s:match("^(%-?%d+%.?%d*)")
    if n and tonumber(n) then return string.format("%.3f", tonumber(n)) end
    return s
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

-- Ecriture d'une propriete, PROUVEE par relecture.
--   kind = nil        : propriete critique (echec -> compte comme refus)
--   kind = "display"  : affichage des tuiles (PreferCueAppearance...) ->
--                       compteurs d'affichage, cause de MODE DEGRADE
--   kind = "cosmetic" : pur habillage
-- Chemin : commande ; si refusee et que c'est le CMD d'une cue, forme
-- "Part 0" ; si encore refusee, handle objet. Puis relecture : egal ->
-- succes (note si seule la voie handle a marche : les macros live, elles,
-- n'ont que la commande) ; illisible -> "non verifiable" ; different ->
-- echec. Renvoie true si la propriete est posee ou non verifiable.
local function setProp(addr, name, value, kind)
    local want = norm(value)
    local s = string.format('Set %s Property "%s" %s', addr, name, fmtVal(value))
    local r = Cmd(s)
    local ok = cmdOk(r)
    if ok == nil then CP.unknown = CP.unknown + 1 end
    local viaCmd = (ok ~= false)
    if ok == false and name == "Command" and addr:match("^Sequence %d+ Cue %d+$") then
        local r2 = Cmd(string.format('Set %s Part 0 Property "%s" %s', addr, name, fmtVal(value)))
        if cmdOk(r2) == true then viaCmd = true end
    end
    if not viaCmd then
        pcall(function()
            local h = ObjectList(addr)[1]
            if h then h:Set(name, tostring(value)) end
        end)
    end
    local got = getProp(addr, name)
    local tally = CP.display and kind == "display"
    if got == nil then
        if tally then return true end           -- compte par l'appelant (want/ok)
        CP.unverified = CP.unverified + 1
        if not viaCmd then CP.cmdRefused[name] = true end
        return true
    end
    local same = (name == "Command") and (got:gsub("^%s+", ""):gsub("%s+$", "") == tostring(value))
                                     or (norm(got) == want)
    if same then
        if not viaCmd then CP.cmdRefused[name] = true end
        return true
    end
    if kind == "cosmetic" then
        CP.cosmetic = CP.cosmetic + 1
        return false
    end
    if not tally then
        fail(string.format('%s : ecrit %s, lu %s', s, tostring(value), got))
    end
    return false
end

-- Essaie plusieurs ecritures d'une meme propriete (1 puis "Yes"...) :
-- l'echec n'est compte que si aucune ne passe.
local function setPropTry(addr, name, values, kind)
    local saved = { CP.fails, CP.firstFail, CP.cosmetic, CP.unverified }
    for i, v in ipairs(values) do
        CP.fails, CP.firstFail, CP.cosmetic, CP.unverified = saved[1], saved[2], saved[3], saved[4]
        local ok = setProp(addr, name, v, kind)
        if ok and norm(getProp(addr, name)) == norm(v) then return true end
        if ok and getProp(addr, name) == nil then return true end   -- non verifiable
        if i == #values then return false end
    end
    return false
end

-- Propriete d'affichage d'une tuile : comptee dans CP.display[key].
local function setDisplayProp(key, addr, name, value)
    local d = CP.display[key]
    d[2] = d[2] + 1
    local ok = setProp(addr, name, value, "display")
    local got = getProp(addr, name)
    if ok and got ~= nil and norm(got) == norm(value) then
        d[1] = d[1] + 1
        return true
    end
    Printf("[CP] affichage : %s %s non pose", addr, name)
    return false
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

-- Lecture d'une propriete de ligne de recipe (texte), nil si illisible.
local function getLineProp(sq, cue, lineNo, name)
    local v
    pcall(function()
        local part = partOf(sq, cue)
        local line = part and part[lineNo]
        if not line then return end
        local ok, r = pcall(function() return line:Get(name, Enums.Roles.Edit) end)
        if ok and r ~= nil then v = r else
            ok, r = pcall(function() return line:Get(name) end)
            if ok and r ~= nil then v = r else v = line[name] end
        end
        if type(v) == "table" then v = v.Name or v.name or v.No or v.no end
    end)
    if v == nil then return nil end
    return tostring(v)
end

-- Premier nombre d'un texte de relecture ("1 'SPOT'", "Preset 4.113",
-- "4.113 'CP FX C1'") : pour un groupe le numero, pour un preset le
-- numero APRES le point s'il y en a un.
local function numIn(text, afterDot)
    if text == nil then return nil end
    local s = tostring(text)
    if afterDot then
        local a = s:match("%d+%.(%d+)")
        if a then return tonumber(a) end
    end
    local n = s:match("(%d+)")
    return n and tonumber(n) or nil
end

-- Ajoute la ligne L (Group -> Preset) a la cue. Chemin console-verifie :
-- "Assign Group ... At ... Part 0.L" cree la ligne quand elle n'existe
-- pas. Si la ligne n'apparait pas (Count), repli par l'API objet :
-- part:Acquire("StandardRecipe") + Set Selection/Values. Puis RELECTURE
-- de Selection / Values. Renvoie "ok", "unverified" (illisible) ou false.
local function addRecipeLine(sq, cue, lineNo, gid, pt, pNo)
    local addr = string.format("Sequence %d Cue %d Part 0.%d", sq, cue, lineNo)
    local assignCmd = string.format("Assign Group %d At %s", gid, addr)
    local r = Cmd(assignCmd)
    if cmdOk(r) == nil then CP.unknown = CP.unknown + 1 end
    local n = lineCount(sq, cue)
    if n ~= nil and n < lineNo then
        pcall(coroutine.yield, 0)                  -- la console peut etre en retard
        n = lineCount(sq, cue)
    end
    local created = (cmdOk(r) ~= false) and (n == nil or n >= lineNo)
    if created then
        run(string.format("Assign Preset %d.%d At %s", pt, pNo, addr))
    else
        if cmdOk(r) == false then Printf("[CP] %s -> %s (repli API objet)", assignCmd, tostring(r)) end
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
        if not (okLua and n and n >= lineNo) then
            fail(string.format("ligne de recipe %d de Sequence %d Cue %d non creee (%s)",
                lineNo, sq, cue, tostring(r)))
            return false
        end
    end
    -- Relecture du contenu de la ligne.
    local sel = getLineProp(sq, cue, lineNo, "Selection")
    local val = getLineProp(sq, cue, lineNo, "Values")
    if sel == nil and val == nil then return "unverified" end
    local gotG, gotP = numIn(sel, false), numIn(val, true)
    if (sel ~= nil and gotG ~= gid) or (val ~= nil and gotP ~= pNo) then
        fail(string.format("ligne %d de Sequence %d Cue %d : groupe %d / preset %d.%d attendus, lus %s / %s",
            lineNo, sq, cue, gid, pt, pNo, tostring(sel), tostring(val)))
        return false
    end
    return "ok"
end

-- Timing MAtricks d'une ligne de recipe : commande, puis handle si la
-- commande est refusee, puis RELECTURE (DelayFromX/ToX ou le texte
-- "DelayX" = "a Thru b"). Renvoie true si pose ou non verifiable.
local function setLineProp(sq, cue, lineNo, name, value)
    local addr = string.format("Sequence %d Cue %d Part 0.%d", sq, cue, lineNo)
    local s = string.format('Set %s Property "%s" %s', addr, name, fmtVal(value))
    local r = Cmd(s)
    local ok = cmdOk(r)
    if ok == nil then CP.unknown = CP.unknown + 1 end
    if ok == false then
        pcall(function()
            local part = partOf(sq, cue)
            local line = part and part[lineNo]
            if line then line:Set(name, tostring(value)) end
        end)
    end
    local got = getLineProp(sq, cue, lineNo, name)
    if got == nil and (name == "DelayFromX" or name == "DelayToX") then
        local dx = getLineProp(sq, cue, lineNo, "DelayX")
        if dx then
            local a, b = tostring(dx):match("([%d%.]+)%s+Thru%s+([%d%.]+)")
            if not a then a = tostring(dx):match("([%d%.]+)"); b = a end
            got = (name == "DelayFromX") and a or b
        end
    end
    if got == nil then
        CP.unverified = CP.unverified + 1
        if ok == false then CP.cmdRefused[name] = true end
        return true
    end
    if norm(got) == norm(value) then
        if ok == false then CP.cmdRefused[name] = true end
        return true
    end
    fail(string.format('%s : ecrit %s, lu %s', s, tostring(value), got))
    return false
end

-- Cuisson : TOUJOURS avec une option (sans option la console ouvre un
-- popup, impossible depuis un plugin). /Overwrite = la cue ne contient
-- que ce que dit la recipe (aucune valeur "dure" residuelle).
local function cook(sq, mode)
    return run(string.format("Cook Sequence %d /%s", sq, mode or "Overwrite"))
end

-- Une cue cuisinee a du contenu : "OwnDataPresent" (Yes/true). nil si la
-- propriete n'est pas lisible sur ce build.
local function cueHasData(sq, cue)
    local v = getProp(string.format("Sequence %d Cue %d Part 0", sq, cue), "OwnDataPresent")
    if v == nil then return nil end
    return norm(v) == "1"
end
local function cueHasHardData(sq, cue)
    local v = getProp(string.format("Sequence %d Cue %d Part 0", sq, cue), "OwnNonCookedDataPresent")
    if v == nil then return nil end
    return norm(v) == "1"
end

-- ------------------------ membres d'un groupe ------------------------
-- Sans programmer : le handle du groupe expose sa selection
-- (selectiondata[*].sf_index -> GetSubfixture). Sert a savoir quels
-- groupes se CHEVAUCHENT, a reperer les groupes VIDES (une recipe sur un
-- groupe vide ne cuit jamais) et les groupes trop petits pour une vague.
-- Renvoie (liste, connu) : connu = false si l'API manque.
local function groupMembers(gid)
    local list, known = nil, false
    pcall(function()
        local h = ObjectList("Group " .. gid)[1]
        if not h then return end
        local sd = h.selectiondata or h.SelectionData or h.SELECTIONDATA
        if type(sd) ~= "table" then return end
        known = true
        local seen = {}
        list = {}
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
    end)
    return list, known
end

-- Repli : lecture par la SELECTION (le programmer, en lecture seule :
-- "Group g" puis ClearAll). SelectionFirst/Next renvoient un index de
-- subfixture, pas un FID. Renvoie (liste, connu).
local function groupMembersBySelection(gid)
    local list, known = nil, false
    pcall(function()
        if type(SelectionFirst) ~= "function" then return end
        Cmd("ClearAll")
        Cmd("Group " .. gid)
        known = true
        list = {}
        local seen = {}
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
    end)
    pcall(Cmd, "ClearAll")
    return list, known
end

-- -------------------------- probes sur une sequence de test ------------
-- Une sequence vide (aucune sortie), au dernier numero reserve, sert a
-- verifier UNE fois sur ce build :
--   - qu'un CMD de cue s'execute au Go+ (et au re-Go+ : la retape) :
--     SetGlobalVariable puis lecture Lua ;
--   - que la forme "Off Sequence N Fade X" est acceptee.
-- Renvoie une table { cmd = true | "partial" | false | nil, offFade =
-- true | false | nil, leftover = bool, detail = texte }.
local function probeOnScratch(sq)
    local res = { cmd = nil, offFade = nil, leftover = false, detail = nil }
    local function readVar()
        local v
        pcall(function() v = GetVar(GlobalVars(), "cp_cmd") end)
        return v
    end
    local function waitFor(target)
        for _ = 1, 20 do
            local v = readVar()
            if v ~= nil and tonumber(v) == target then return true end
            pcall(coroutine.yield, 0.1)
        end
        local v = readVar()
        return v ~= nil and tonumber(v) == target
    end
    pcall(function()
        local r = Cmd(string.format("Store Sequence %d Cue 1 /Overwrite /NoConfirmation", sq))
        if cmdOk(r) == false then res.detail = "Store de la sequence de test refuse : " .. tostring(r); return end
        Cmd(string.format('Label Sequence %d "CP probe"', sq))
        Cmd(string.format('Set Sequence %d Property "WrapAround" 1', sq))
        r = Cmd("SetGlobalVariable 'cp_cmd' 0")
        local v = readVar()
        if cmdOk(r) == false or v == nil or tonumber(v) ~= 0 then
            res.detail = "canal variable indisponible (" .. tostring(r) .. " / " .. tostring(v) .. ")"
        else
            local addr = string.format("Sequence %d Cue 1", sq)
            local r2 = Cmd(string.format('Set %s Property "Command" "SetGlobalVariable \'cp_cmd\' 1"', addr))
            if cmdOk(r2) == false then
                r2 = Cmd(string.format('Set %s Part 0 Property "Command" "SetGlobalVariable \'cp_cmd\' 1"', addr))
            end
            if cmdOk(r2) == false then
                res.detail = "CMD de cue refuse : " .. tostring(r2)
            else
                Cmd(string.format("Go+ Sequence %d", sq))
                local first = waitFor(1)
                Cmd("SetGlobalVariable 'cp_cmd' 0")
                Cmd(string.format("Go+ Sequence %d", sq))          -- la retape d'une tuile allumee
                local again = waitFor(1)
                if first and again then res.cmd = true
                elseif first then res.cmd = "partial"
                else res.cmd = false end
            end
        end
        local r3 = Cmd(string.format("Off Sequence %d Fade 1", sq))
        res.offFade = cmdOk(r3)
        if res.offFade == false then Cmd(string.format("Off Sequence %d", sq)) end
        Cmd(string.format("Delete Sequence %d /NoConfirmation", sq))
        pcall(coroutine.yield, 0.1)
        res.leftover = objectExists("Sequence " .. sq)
    end)
    return res
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

-- "Off Sequence a Thru b + c + d Thru e Fade f" a partir d'une liste de
-- plages {a, b}. Sans "Fade" si ce build refuse cette forme (probe).
local OFF_FADE_OK = true
local function offListCmd(ranges, fade)
    local parts = {}
    for _, r in ipairs(ranges) do
        if r[2] > r[1] then parts[#parts + 1] = string.format("%d Thru %d", r[1], r[2])
        else parts[#parts + 1] = tostring(r[1]) end
    end
    if #parts == 0 then return nil end
    if OFF_FADE_OK == false then
        return string.format("Off Sequence %s", table.concat(parts, " + "))
    end
    return string.format("Off Sequence %s Fade %s", table.concat(parts, " + "), fmtNum(fade))
end

-- Labels que le plugin ecrit lui-meme : tout autre objet dans les plages
-- balayees est "a toi" et sera nomme dans le recapitulatif.
local function isOurLabel(kind, label)
    local l = tostring(label or "")
    if l == "" then return true end
    if kind == "Sequence" then
        if l:match("^FX ") or l == "CP probe" then return true end
        for _, c in ipairs(COLORS) do
            if l:sub(-#c.name - 1) == " " .. c.name then return true end
        end
        return false
    end
    if kind == "Macro" then
        if l == "Off All" or l == "ALL" or l == "ALL indisponible" or l:match("^C O L O R") then return true end
        if l:match("^FADE ") or l:match("^FX ") or l:match("^FXV ") or l:match("^FXF ") then return true end
        if l:match("^C[12] ") or l == "RE-CUISINER" then return true end
        if l:match("^%d+%.?%d*s?$") then return true end         -- "0.5s", "2"
        return false
    end
    return l:match("^CP ") ~= nil                                 -- appearances, presets
end

-- ------------------------------- main --------------------------------

local function main(display_handle)
    resetCP()
    macroLineFails = 0        -- compteurs de run : le chunk est mis en cache
    OFF_FADE_OK = true

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
                   .. "groupes.\n\n"
                   .. "Cree Group SPOT, WASH, ... (les machines dans l'ordre\n"
                   .. "jardin -> cour, c'est le sens des vagues), puis relance.",
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

    -- Reglages (tout est modifiable dans l'assistant).
    local grpStr    = joinIds(autoGroups, " + ", 100000)
    local allStr    = ""
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
                .. "construction. Chaque commande est verifiee et relue.\n"
                .. "\"Re-cuisiner\" : apres un repatch, recuit les cues d'un\n"
                .. "board existant sans rien reconstruire.",
        commands = {
            { value = 1, name = "Regler" },
            { value = 2, name = "Reglages par defaut" },
            { value = 3, name = "Re-cuisiner" },
            { value = 0, name = "Annuler" },
        },
    })
    if not box or box.result == 0 or box.result == nil then return end
    local useDefaults = (box.result == 2)

    -- ======================= RE-CUISINER (sans reconstruire) =======================
    if box.result == 3 then
        box = MessageBox({
            title    = "Color Picker LIVE  -  Re-cuisiner",
            message  = "Recuit (Cook /Overwrite) toutes les sequences d'un board\n"
                    .. "deja construit : apres un repatch, les cues reprennent\n"
                    .. "les machines actuelles des groupes.\n"
                    .. "Un groupe AJOUTE ou RETIRE du board -> regenere plutot\n"
                    .. "(les CMD de chevauchement ne sont pas recalcules).\n"
                    .. "A faire avant le show, pas pendant.",
            commands = { { value = 1, name = "Re-cuisiner" }, { value = 0, name = "Annuler" } },
            inputs   = { { name = "ID de depart du board", value = tostring(baseId) } },
        })
        if not box or box.result ~= 1 then return end
        local b0 = math.floor(toNum(box.inputs["ID de depart du board"], 101, 101, 100000))
        local last = b0 + (1 + MAX_GROUP_ROWS) * #COLORS + MAX_GROUP_ROWS * #FX_DIRS - 1
        local done, empty, hard = 0, 0, 0
        for sq = b0, last do
            if objectExists("Sequence " .. sq) then
                cook(sq)
                done = done + 1
                if cueHasData(sq, 1) == false then empty = empty + 1 end
                if cueHasHardData(sq, 1) == true then hard = hard + 1 end
                if done % 8 == 0 then breathe() end
            end
        end
        MessageBox({ title = "Color Picker LIVE  v" .. VERSION,
            message = string.format("%d sequence(s) recuisinee(s) (Sequence %d-%d).\n"
                .. "Cues restees vides : %d (groupe vide ou preset non applicable).\n"
                .. "Valeurs dures presentes : %d.\nCommandes refusees : %d%s",
                done, b0, last, empty, hard, CP.fails,
                CP.firstFail and ("\n1ere : " .. CP.firstFail) or ""),
            commands = { { value = 1, name = "OK" } } })
        return
    end

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
                    .. "Groupe ALL : si tu as un groupe \"toutes machines\",\n"
                    .. "donne-le, la ligne ALL devient une recipe simple.\n"
                    .. "\nCouleurs, dans l'ordre : Red Orange Amber Yellow Green\n"
                    .. "Cyan Azure Blue Violet Magenta Pink White.",
            commands = { { value = 1, name = "Suivant" }, { value = 0, name = "Annuler" } },
            inputs   = {
                { name = "Groupes du board",      value = grpStr },
                { name = "Groupe ALL (optionnel)", value = allStr },
                { name = "Nb couleurs (1-12)",     value = tostring(nColors) },
            },
        })
        if not box or box.result ~= 1 then return end
        nColors = math.floor(toNum(box.inputs["Nb couleurs (1-12)"], 12, 1, #COLORS))
        allStr  = tostring(box.inputs["Groupe ALL (optionnel)"] or ""):gsub("^%s+", ""):gsub("%s+$", "")
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
        if allStr ~= "" and not (tonumber(allStr) and objectExists("Group " .. math.floor(tonumber(allStr)))) then
            droppedIds[#droppedIds + 1] = "ALL=" .. allStr
            allStr = ""
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

    -- Groupes du board, et leurs MEMBRES (sans programmer si l'API le
    -- permet). Un groupe VIDE ne cuit jamais : sa ligne est retiree et
    -- annoncee. Les membres servent aussi aux chevauchements et aux
    -- groupes trop petits pour une vague.
    local groupIds  = parseRange(grpStr) or autoGroups
    local truncated = false
    if #groupIds > MAX_GROUP_ROWS then
        truncated = true
        while #groupIds > MAX_GROUP_ROWS do table.remove(groupIds) end
    end
    local members, usedSelection, emptyRows = {}, false, {}
    local function readMembers(gid)
        local list, known = groupMembers(gid)
        if not known then
            list, known = groupMembersBySelection(gid)
            if known then usedSelection = true end
        end
        return list, known
    end
    local keptIds = {}
    for _, gid in ipairs(groupIds) do
        local list, known = readMembers(gid)
        members[gid] = known and list or nil
        if known and #list == 0 then
            emptyRows[#emptyRows + 1] = string.format('Group %d "%s"', gid, groupName(gid))
        else
            keptIds[#keptIds + 1] = gid
        end
    end
    groupIds = keptIds
    if #groupIds == 0 then
        MessageBox({ title = "Color Picker LIVE  v" .. VERSION,
            message = "Tous les groupes du board sont vides :\n" .. table.concat(emptyRows, ", ")
                   .. "\n\nUne recipe sur un groupe vide ne cuit jamais.\nMets des machines dedans, puis relance.",
            commands = { { value = 1, name = "OK" } } })
        return
    end
    -- Groupe ALL optionnel (une recipe simple pour la ligne ALL).
    local allGid = (allStr ~= "" and tonumber(allStr)) and math.floor(tonumber(allStr)) or nil
    if allGid then
        local list, known = readMembers(allGid)
        members[allGid] = known and list or nil
        if known and #list == 0 then
            emptyRows[#emptyRows + 1] = string.format('Group %d "%s" (ALL)', allGid, groupName(allGid))
            allGid = nil
        end
    end
    -- La ligne ALL n'a de sens qu'avec au moins deux groupes (ou un groupe ALL donne).
    local hasAll  = (#groupIds >= 2) or (allGid ~= nil)
    local allMode = allGid and "group" or (hasAll and "lines" or "skip")

    -- Cibles : ALL (si elle existe) puis une ligne par groupe.
    local targets = {}
    if hasAll then targets[1] = { label = "ALL", isAll = true } end
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
    for ti, t in ipairs(targets) do
        if t.isGroup then
            if seenLbl[t.label] then
                local base, n = t.label, t.gid
                repeat
                    t.label = base .. " " .. tostring(n)
                    n = n + 1
                until not seenLbl[t.label]
            end
            seenLbl[t.label] = true
        end
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
    local macEnd      = macFxF0 + nFV - 1           -- +54 (+55 reserve)

    -- Plafonds de NETTOYAGE. Sequences / appearances / images : la plus
    -- grosse empreinte possible (une regeneration avec moins de lignes
    -- doit effacer les anciennes). Macros : l'empreinte v9 exacte, sauf si
    -- un board v8 (une macro par tuile) est detecte.
    local MAX_ROWS  = 1 + MAX_GROUP_ROWS
    local seqDelEnd = baseId + MAX_ROWS * NC + MAX_GROUP_ROWS * nDir - 1
    local macDelV8  = baseId + 8 + 2 * nV + 5 + 2 * NC + MAX_ROWS * NC + MAX_GROUP_ROWS * nDir - 1
    local macDelEnd = baseId + 55
    if objectExists("Macro " .. (baseId + 56)) then macDelEnd = macDelV8 end
    local appDelEnd = appLastNow
    local imgDelEnd = baseId + 2 * NC + 3
    local seqProbe  = seqDelEnd            -- sequence de test, effacee

    -- ------------------- occupation / confirmation -------------------
    local occupied = false
    local foreign  = {}      -- objets a toi dans les plages balayees
    local function scanRange(kind, fmt, a, b)
        for no = a, b do
            local addr = string.format(fmt, no)
            if objectExists(addr) then
                occupied = true
                local lbl = getProp(addr, "Name")
                if not isOurLabel(kind, lbl) and #foreign < 8 then
                    foreign[#foreign + 1] = string.format('%s "%s"', addr, tostring(lbl))
                end
            end
        end
    end
    scanRange("Sequence",   "Sequence %d",   baseId, seqDelEnd)
    scanRange("Macro",      "Macro %d",      baseId, macDelEnd)
    scanRange("Appearance", "Appearance %d", baseId, appDelEnd)
    for no = baseId, imgDelEnd do
        if objectExists(string.format("Image 3.%d", no)) then occupied = true end
    end

    -- Presets couleur d'une AUTRE palette : reutilises tels quels si le
    -- label correspond, sinon remis a la couleur du plugin (annonce).
    local staleColors = {}
    for ci, c in ipairs(colors) do
        local nm = presetName(PT, baseId + ci - 1)
        if nm and nm ~= c.name then
            staleColors[#staleColors + 1] = string.format("4.%d %s -> %s", baseId + ci - 1, nm, c.name)
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

    -- Vagues "pulsees" : un groupe d'1 machine (ou de 2 avec XWings) n'a
    -- rien a etaler ; DelayFromX = DelayToX = battement, sinon la cue
    -- durerait 0 et la boucle s'emballerait.
    local pulsed = {}      -- [sq] = true
    local pulsedNames = {}
    local sizeUnknown = false
    for gi, ti in ipairs(groupTis) do
        local m = members[targets[ti].gid]
        if m == nil then
            sizeUnknown = true
        else
            for di, dir in ipairs(FX_DIRS) do
                if #m == 1 or (#m == 2 and dir.wings) then
                    pulsed[seqFx(gi, di)] = true
                    pulsedNames[#pulsedNames + 1] = string.format("FX %s %s", targets[ti].label, dir.lbl)
                end
            end
        end
    end

    -- ==================== ASSISTANT : recapitulatif ====================
    local rowNames = {}
    for ti, t in ipairs(targets) do rowNames[ti] = t.label end
    local progNote = "un ClearAll au depart"
    if presetsToCreate + #staleColors > 0 then
        progNote = progNote .. string.format(", %d preset(s) a stocker (puis ClearAll)", presetsToCreate + #staleColors)
    end
    if usedSelection then
        progNote = progNote .. ", lecture des groupes par la selection (API absente) puis ClearAll"
    end
    local recap = string.format(
        "LIGNES (%d) : %s\n"
     .. "COULEURS : %d   FX : %d vagues (%d formes x %d groupes)\n"
     .. "ALL : %s\n\n"
     .. "Fade couleur %ss - Fade arret %ss\n"
     .. "Vitesse FX %ss - Fondu FX %ss\n\n"
     .. "ECRIT DANS LE SHOW (en recipes Group + Preset) :\n"
     .. "  Sequences %d-%d   Macros %d-%d\n"
     .. "  Appearances %d-%d   Images 3.%d-3.%d   Layout %d\n"
     .. "  Presets 4.%d-4.%d : %d reutilises, %d crees, %d corriges\n"
     .. "  (presets jamais effaces ; slots FX 4.%d et 4.%d)\n"
     .. "Plages reservees : Seq %d-%d, Macro %d-%d, App %d-%d, Img 3.%d-3.%d\n"
     .. "Programmer : %s.\n",
        nTargets, table.concat(rowNames, ", "),
        nColors, nFx * nDir, nDir, nFx,
        (allMode == "group") and string.format("Group %d \"%s\" (recipe simple)", allGid, groupName(allGid))
            or (allMode == "lines") and "une ligne de recipe par groupe du board"
            or "pas de ligne ALL (un seul groupe)",
        fmtNum(colorFade), fmtNum(offFade), fmtNum(fxSweep), fmtNum(fxFade),
        baseId, seqLast, baseId, macEnd,
        baseId, appDelEnd, baseId, baseId + nImages - 1, layNo,
        baseId, baseId + nColors - 1, presetsToReuse, presetsToCreate, #staleColors,
        pFx1, pFx2,
        baseId, seqDelEnd, baseId, macDelEnd, baseId, appDelEnd, baseId, imgDelEnd,
        progNote)
    if truncated then
        recap = recap .. string.format("(Lignes limitees a %d.)\n", MAX_GROUP_ROWS)
    end
    if #emptyRows > 0 then
        recap = recap .. "Lignes ignorees (groupe vide) : " .. table.concat(emptyRows, ", ") .. "\n"
    end
    if #pulsedNames > 0 then
        recap = recap .. "Vagues pulsees (groupe de 1-2 machines, rien a etaler) : "
                      .. table.concat(pulsedNames, ", ") .. "\n"
    end
    if #droppedIds > 0 then
        recap = recap .. "Ignores (inexistants) : " .. table.concat(droppedIds, ", ") .. "\n"
    end
    if occupied then
        recap = recap .. string.format(
            "\nATTENTION : ces plages contiennent deja des objets.\n"
         .. "Ils seront SUPPRIMES puis regeneres (nettoyage :\n"
         .. "Sequence %d-%d, Macro %d-%d, Appearance %d-%d,\n"
         .. "Image 3.%d-3.%d, Layout %d%s).\n"
         .. "Si ces sequences sont sur des executors, l'assignation est perdue.\n",
            baseId, seqDelEnd, baseId, macDelEnd, baseId, appDelEnd,
            baseId, imgDelEnd, layNo,
            oldMatricks and string.format(", MAtricks %d", baseId) or "")
        if #foreign > 0 then
            recap = recap .. "Objets A TOI qui seraient supprimes : " .. table.concat(foreign, ", ") .. "\n"
        end
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

    -- ============================ NETTOYAGE ============================
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
        pcall(coroutine.yield, 0.1)
        -- Rien ne doit rester : on ne construit JAMAIS par-dessus un objet.
        local left
        for no = baseId, seqDelEnd do
            if objectExists("Sequence " .. no) then left = "Sequence " .. no; break end
        end
        if not left then
            for no = baseId, macDelEnd do
                if objectExists("Macro " .. no) then left = "Macro " .. no; break end
            end
        end
        if not left then
            for no = baseId, appDelEnd do
                if objectExists("Appearance " .. no) then left = "Appearance " .. no; break end
            end
        end
        if left then
            MessageBox({ title = "Color Picker LIVE  v" .. VERSION,
                message = string.format("Impossible de nettoyer : %s \"%s\" existe encore.\n\n"
                    .. "Rien n'a ete construit. Supprime-le a la main\n(ou choisis un autre ID de depart), puis relance.",
                    left, tostring(getProp(left, "Name") or "")),
                commands = { { value = 1, name = "OK" } } })
            return
        end
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
    local c2Default = math.min(8, nColors)
    run(string.format('Copy Preset %d.%d At Preset %d.%d /Overwrite /NoConfirmation /NoOops',
        PT, baseId, PT, pFx1))
    run(string.format('Copy Preset %d.%d At Preset %d.%d /Overwrite /NoConfirmation /NoOops',
        PT, baseId + c2Default - 1, PT, pFx2))
    run(string.format('Label Preset %d.%d "CP FX C1"', PT, pFx1), true)
    run(string.format('Label Preset %d.%d "CP FX C2"', PT, pFx2), true)
    breathe()

    -- 2) Chevauchements : quels groupes partagent des machines.
    local grpSet, grpKnown = {}, 0
    for gi, ti in ipairs(groupTis) do
        local m = members[targets[ti].gid]
        if m then
            local set = {}
            for _, k in ipairs(m) do set[k] = true end
            grpSet[gi] = set
            grpKnown = grpKnown + 1
        end
    end
    local function overlappingGis(ti)
        local out = {}
        local mine = fxGiOfTi[ti]
        for gi = 1, nFx do
            local hit
            if targets[ti].isAll or gi == mine then
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

    -- 3) Probes sur la sequence de test : CMD de cue, "Off ... Fade".
    local probe = probeOnScratch(seqProbe)
    if probe.offFade == false then OFF_FADE_OK = false end
    breathe()

    -- ======================= 4) SEQUENCES EN RECIPES =======================
    local linesWanted, linesOk, linesUnverified = 0, 0, 0
    local cuesWanted, cuesCooked, cuesUnknown = 0, 0, 0
    local firstEmptyCue, hardCues = nil, 0
    local trigOk, trigWanted, trigUnknown = 0, 0, 0
    local cueColsOk = nil      -- les colonnes de cue survivent-elles a Cook /Overwrite ?
    local function noteLine(res)
        linesWanted = linesWanted + 1
        if res == "ok" then linesOk = linesOk + 1
        elseif res == "unverified" then linesUnverified = linesUnverified + 1 end
        return res ~= false
    end
    local function noteCue(sq, cue, label)
        cuesWanted = cuesWanted + 1
        local hd = cueHasData(sq, cue)
        if hd == nil then cuesUnknown = cuesUnknown + 1
        elseif hd then cuesCooked = cuesCooked + 1
        elseif not firstEmptyCue then
            firstEmptyCue = string.format('Sequence %d "%s" (groupe vide ou preset non applicable ?)', sq, label)
        end
        if cueHasHardData(sq, cue) == true then
            hardCues = hardCues + 1
            warn(string.format("Valeurs dures presentes dans Sequence %d (programmer non vide ?)", sq))
        end
    end
    -- Groupes d'une ligne : ALL = le groupe ALL donne, ou tous les groupes.
    local function rowGroupIds(ti)
        if targets[ti].isAll then
            if allMode == "group" then return { allGid } end
            local ids = {}
            for _, tj in ipairs(groupTis) do ids[#ids + 1] = targets[tj].gid end
            return ids
        end
        return { targets[ti].gid }
    end

    local okBuild, errBuild = pcall(function()
        -- 4a) Sequences couleur : 1 par (ligne x couleur), 1 cue, une ligne
        --     de recipe par groupe de la ligne. Cuisson PUIS proprietes de
        --     cue (ordre deliberement different des FX, voir 4b).
        for ti, t in ipairs(targets) do
            if not (t.isAll and allMode == "none") then
                for ci, c in ipairs(colors) do
                    local sq = seqColor(ti, ci)
                    run(string.format('Store Sequence %d Cue 1 /Overwrite /NoConfirmation', sq))
                    -- La premiere cue ALL a lignes multiples est une PROBE : si la
                    -- console ne sait pas creer une 2e ligne, ses refus ne sont pas
                    -- des erreurs mais un mode degrade (pas de demi-ALL : une ligne
                    -- ALL qui ne colorerait que le premier groupe n'est jamais posee).
                    local isProbe = t.isAll and allMode == "lines"
                    local sF, sFirst, sLW, sLO, sLU = CP.fails, CP.firstFail, linesWanted, linesOk, linesUnverified
                    local lineFailed = false
                    for k, gid in ipairs(rowGroupIds(ti)) do
                        if not noteLine(addRecipeLine(sq, 1, k, gid, PT, baseId + ci - 1)) then
                            lineFailed = true
                        end
                    end
                    if isProbe and lineFailed then
                        CP.fails, CP.firstFail, linesWanted, linesOk, linesUnverified = sF, sFirst, sLW, sLO, sLU
                        allMode = "none"
                        run(string.format('Delete Sequence %d /NoConfirmation', sq), true)
                        break
                    end
                    cook(sq)
                    run(string.format('Label Sequence %d "%s %s"', sq, t.label, c.name), true)
                    setProp("Sequence " .. sq, "OffWhenOverridden", "Yes")
                    setPropTry("Sequence " .. sq, "WrapAround", { 1, "Yes" })
                    setDisplayProp("prefer", "Sequence " .. sq, "PreferCueAppearance", "Yes")
                    setProp(string.format("Sequence %d Cue 1", sq), "CueInFade", colorFade)
                    CP.display.seqApp[2] = CP.display.seqApp[2] + 1
                    if run(string.format('Assign Appearance %d At Sequence %d', appSeqOff(ci), sq), true) then
                        CP.display.seqApp[1] = CP.display.seqApp[1] + 1
                    end
                    CP.display.cueApp[2] = CP.display.cueApp[2] + 1
                    if run(string.format('Assign Appearance %d At Sequence %d Cue 1', appSeqOn(ci), sq), true) then
                        CP.display.cueApp[1] = CP.display.cueApp[1] + 1
                    end
                    local cmd = rowKillCmd(ti, colorFade)
                    if cmd then setProp(string.format("Sequence %d Cue 1", sq), "Command", cmd) end
                    noteCue(sq, 1, t.label .. " " .. c.name)
                end
                breathe()
            end
        end

        -- 4b) Sequences FX : 5 par groupe, 2 cues Follow + WrapAround,
        --     une ligne de recipe par cue (Group -> slot C1 / C2) portant
        --     les timings MAtricks de la forme. Proprietes PUIS cuisson,
        --     puis relecture : c'est le test "Cook /Overwrite conserve les
        --     colonnes de cue" de ce build.
        for gi, ti in ipairs(groupTis) do
            local t = targets[ti]
            for di, dir in ipairs(FX_DIRS) do
                local sq = seqFx(gi, di)
                local killCmd = offListCmd(killRanges(ti, sq), FX_KILL_FADE)
                local fromX = pulsed[sq] and fxSweep or 0
                for k = 1, 2 do
                    run(string.format('Store Sequence %d Cue %d /Overwrite /NoConfirmation', sq, k))
                    noteLine(addRecipeLine(sq, k, 1, t.gid, PT, (k == 1) and pFx1 or pFx2))
                    setLineProp(sq, k, 1, "DelayFromX", fromX)
                    setLineProp(sq, k, 1, "DelayToX", fxSweep)
                    if dir.wings  then setLineProp(sq, k, 1, "XWings", 2) end
                    if dir.group2 then setLineProp(sq, k, 1, "XGroup", 2) end
                    if dir.invert then
                        setLineProp(sq, k, 1, "InvertX", "Yes")
                        setLineProp(sq, k, 1, "InvertStyle", "All")
                    end
                    setProp(string.format("Sequence %d Cue %d", sq, k), "TrigType", "Follow")
                    setProp(string.format("Sequence %d Cue %d", sq, k), "CueInFade", fxFade)
                    CP.display.cueApp[2] = CP.display.cueApp[2] + 1
                    if run(string.format('Assign Appearance %d At Sequence %d Cue %d', appFxOn, sq, k), true) then
                        CP.display.cueApp[1] = CP.display.cueApp[1] + 1
                    end
                    if killCmd then setProp(string.format("Sequence %d Cue %d", sq, k), "Command", killCmd) end
                end
                setPropTry("Sequence " .. sq, "WrapAround", { 1, "Yes" })
                setProp("Sequence " .. sq, "OffWhenOverridden", "Yes")
                setDisplayProp("prefer", "Sequence " .. sq, "PreferCueAppearance", "Yes")
                CP.display.seqApp[2] = CP.display.seqApp[2] + 1
                if run(string.format('Assign Appearance %d At Sequence %d', appFxSeq, sq), true) then
                    CP.display.seqApp[1] = CP.display.seqApp[1] + 1
                end
                cook(sq)
                run(string.format('Label Sequence %d "FX %s %s"', sq, t.label, dir.lbl), true)
                for k = 1, 2 do
                    noteCue(sq, k, string.format("FX %s %s", t.label, dir.lbl))
                    trigWanted = trigWanted + 1
                    local addr = string.format("Sequence %d Cue %d", sq, k)
                    local tt = getProp(addr, "TrigType")
                    if tt == nil then trigUnknown = trigUnknown + 1
                    elseif tt:lower() == "follow" then trigOk = trigOk + 1 end
                    -- Les colonnes de cue ont-elles survecu a la cuisson ?
                    local fd, cm = getProp(addr, "CueInFade"), getProp(addr, "Command")
                    if tt ~= nil and fd ~= nil then
                        local keep = (tt:lower() == "follow") and (norm(fd) == norm(fxFade))
                                     and (killCmd == nil or cm == killCmd)
                        if keep then
                            if cueColsOk == nil then cueColsOk = true end
                        else
                            cueColsOk = false
                            -- on les repose une fois (la cuisson est finie)
                            setProp(addr, "TrigType", "Follow")
                            setProp(addr, "CueInFade", fxFade)
                            if killCmd then setProp(addr, "Command", killCmd) end
                        end
                    end
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

    -- ================ 4c) PROBES des formes par PLAGE (macros courtes) ================
    -- Rien ne tourne encore : on peut tester sur les vraies sequences.
    -- R1 : Set par plage sur les cues couleur (rangees FADE / FX FONDU).
    -- Chaque probe ecrit une valeur TEMPORAIRE par plage, relit la derniere
    -- sequence (c'est la relecture qui prouve, pas le retour de Cmd), puis
    -- restaure la vraie valeur (par plage si ca marche, sinon une a une).
    local PROBE_VAL = 0.07
    local rangedOk = false
    do
        local firstC = (hasAll and allMode == "none") and seqColor(2, 1) or baseId
        if firstC <= seqEnd then
            local r = Cmd(string.format('Set Sequence %d Thru %d Cue 1 Property "CueInFade" %s',
                firstC, seqEnd, fmtNum(PROBE_VAL)))
            local back = getProp(string.format("Sequence %d Cue 1", seqEnd), "CueInFade")
            rangedOk = (cmdOk(r) ~= false) and back ~= nil and norm(back) == norm(PROBE_VAL)
            if rangedOk then
                run(string.format('Set Sequence %d Thru %d Cue 1 Property "CueInFade" %s',
                    firstC, seqEnd, fmtNum(colorFade)))
            else
                for sq = firstC, seqEnd do
                    setProp(string.format("Sequence %d Cue 1", sq), "CueInFade", colorFade)
                end
            end
        end
    end
    -- R2 : Cook par plage (/Remove vide, /Overwrite recuit) ; R3 : Set par
    -- plage d'un timing de ligne de recipe (FX VITESSE en 2 lignes).
    -- Liste des sequences pulsees ("a + b + c"), pour FX VITESSE.
    local pulsedList = {}
    for gi = 1, nFx do
        for di = 1, nDir do
            if pulsed[seqFx(gi, di)] then pulsedList[#pulsedList + 1] = seqFx(gi, di) end
        end
    end
    local pulsedExpr = table.concat((function()
        local t = {}
        for _, v in ipairs(pulsedList) do t[#t + 1] = tostring(v) end
        return t
    end)(), " + ")
    local rangeCookOk, rangedFxOk, listFxOk = false, false, true
    if nFx > 0 then
        local fxA, fxB = seqFx(1, 1), seqLast
        -- R2 : Cook par plage (/Remove vide les cues, visible sur OwnDataPresent)
        local r = Cmd(string.format("Cook Sequence %d Thru %d /Remove", fxA, fxB))
        if cmdOk(r) ~= false and cueHasData(fxA, 1) == false and cueHasData(fxB, 2) == false then
            rangeCookOk = true
        end
        -- R3 : Set par plage d'un timing de ligne de recipe
        rangedFxOk = true
        for k = 1, 2 do
            local r2 = Cmd(string.format('Set Sequence %d Thru %d Cue %d Part 0.1 Property "DelayToX" %s',
                fxA, fxB, k, fmtNum(PROBE_VAL)))
            local okK = cmdOk(r2) ~= false
                and norm(getLineProp(fxA, k, 1, "DelayToX") or "") == norm(PROBE_VAL)
                and norm(getLineProp(fxB, k, 1, "DelayToX") or "") == norm(PROBE_VAL)
                and (lineCount(fxA, k) or 1) == 1 and (lineCount(fxB, k) or 1) == 1
            if not okK then rangedFxOk = false end
            -- restauration du battement
            if okK then
                run(string.format('Set Sequence %d Thru %d Cue %d Part 0.1 Property "DelayToX" %s',
                    fxA, fxB, k, fmtNum(fxSweep)))
            else
                for sq = fxA, fxB do setLineProp(sq, k, 1, "DelayToX", fxSweep) end
            end
        end
        -- R3b : liste "a + b" (les vagues pulsees ne sont pas contigues)
        if #pulsedList >= 2 then
            local pA, pB = pulsedList[1], pulsedList[#pulsedList]
            local r3 = Cmd(string.format('Set Sequence %s Cue 1 Part 0.1 Property "DelayFromX" %s',
                pulsedExpr, fmtNum(PROBE_VAL)))
            listFxOk = cmdOk(r3) ~= false
                and norm(getLineProp(pA, 1, 1, "DelayFromX") or "") == norm(PROBE_VAL)
                and norm(getLineProp(pB, 1, 1, "DelayFromX") or "") == norm(PROBE_VAL)
            if listFxOk then
                run(string.format('Set Sequence %s Cue 1 Part 0.1 Property "DelayFromX" %s', pulsedExpr, fmtNum(fxSweep)))
            else
                for _, sq in ipairs(pulsedList) do setLineProp(sq, 1, 1, "DelayFromX", fxSweep) end
            end
        end
        -- Restauration : tout recuit, et verifie.
        if rangeCookOk then
            run(string.format("Cook Sequence %d Thru %d /Overwrite", fxA, fxB))
        else
            for sq = fxA, fxB do cook(sq) end
        end
        if cueHasData(fxA, 1) == false or cueHasData(fxB, 2) == false then
            fail("recuisson apres les probes : cue FX restee vide")
        end
    end

    -- 4d) La copie dans un slot garde-t-elle la reference des cues ?
    --     (les pastilles C1/C2 en dependent). On rejoue le seed du slot C1
    --     et on relit la ligne de recipe de la premiere boucle.
    local copyRefOk = nil
    if nFx > 0 then
        local before = getLineProp(seqFx(1, 1), 1, 1, "Values")
        run(string.format('Copy Preset %d.%d At Preset %d.%d /Overwrite /NoConfirmation /NoOops',
            PT, baseId, PT, pFx1))
        run(string.format('Recast Preset %d.%d', PT, pFx1), true)
        run(string.format('Label Preset %d.%d "CP FX C1"', PT, pFx1), true)
        local after = getLineProp(seqFx(1, 1), 1, 1, "Values")
        if before ~= nil then
            copyRefOk = after ~= nil and (numIn(after, true) == pFx1 or tostring(after):match("CP FX C1") ~= nil)
                        and cueHasData(seqFx(1, 1), 1) ~= false
            if not copyRefOk then warn("Copy Preset /Overwrite casse la reference des cues : pastilles par Assign Preset") end
        end
    end

    -- ============================ 5) MACROS ============================
    local placed, failed = 0, 0
    local macroLens = {}
    local okBoard, errBoard = pcall(function()
        -- 5a) Off All : relache tout avec le fade d'arret. L'etat des
        --     tuiles suit tout seul (sequences eteintes = sombres).
        makeMacro(macOffAll, "Off All", appRed,
            { offListCmd({ { baseId, seqLast } }, offFade) })
        makeMacro(macAllHdr, (allMode == "none") and "ALL indisponible" or "ALL", appDark, {})
        makeMacro(macTitle, "C O L O R  P I C K E R   -   v" .. VERSION, appDark, {})

        -- 5b) Rangees FADE : un bouton = reglage de tout le board + etat
        --     affiche (bouton actif surligne, en-tete relabellee).
        local function fadeLabel(v)
            if v == math.floor(v) then return string.format("%ds", v) end
            return tostring(v) .. "s"
        end
        local function fadeLabelO(v)
            if v == math.floor(v) then return string.format("%d", v) end
            return tostring(v)
        end
        local firstColorTi = (hasAll and allMode == "none") and 2 or 1
        makeMacro(macFadeCHdr, "FADE couleur " .. fadeLabel(colorFade), appDark, {})
        makeMacro(macFadeOHdr, "FADE arret "   .. fadeLabel(offFade),   appDark, {})
        for vi, v in ipairs(FADE_VALUES) do
            local linesC, linesO = {}, {}
            -- fade couleur : le CueInFade de toutes les cues couleur...
            if rangedOk then
                linesC[#linesC + 1] = string.format(
                    'Set Sequence %d Thru %d Cue 1 Property "CueInFade" %s', seqColor(firstColorTi, 1), seqEnd, fmtNum(v))
            else
                for ti = firstColorTi, nTargets do
                    for ci = 1, nColors do
                        linesC[#linesC + 1] = string.format(
                            'Set Sequence %d Cue 1 Property "CueInFade" %s', seqColor(ti, ci), fmtNum(v))
                    end
                end
            end
            -- ... et le fade du CMD (relache des boucles) de chaque ligne,
            -- seulement si "Off ... Fade" existe sur ce build.
            if OFF_FADE_OK ~= false then
                for ti = firstColorTi, nTargets do
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
            macroLens["FADE couleur"] = #linesC
        end
        breathe()

        -- 5c) Pastilles FX C1 / C2. Chemin normal : la couleur est copiee
        --     dans le preset SLOT (Copy /Overwrite + Recast) que les cues
        --     cuisinees REFERENCENT -> changement en live. Si la copie casse
        --     la reference sur ce build : Assign Preset sur chaque boucle.
        makeMacro(macC1Hdr, "FX C1 " .. colors[1].name, appDark, {})
        makeMacro(macC2Hdr, "FX C2 " .. colors[c2Default].name, appDark, {})
        local function makeSlotRow(hdrNo, base0, slotNo, cueNo, hdrName, btnPrefix, defaultCi)
            for ci, c in ipairs(colors) do
                local lines = {}
                if copyRefOk == false then
                    for gi = 1, nFx do
                        for di = 1, nDir do
                            lines[#lines + 1] = string.format('Assign Preset %d.%d At Sequence %d Cue %d Part 0.1',
                                PT, baseId + ci - 1, seqFx(gi, di), cueNo)
                        end
                    end
                else
                    lines[#lines + 1] = string.format('Copy Preset %d.%d At Preset %d.%d /Overwrite /NoConfirmation /NoOops',
                        PT, baseId + ci - 1, PT, slotNo)
                    lines[#lines + 1] = string.format('Recast Preset %d.%d', PT, slotNo)
                    lines[#lines + 1] = string.format('Label Preset %d.%d "CP %s"', PT, slotNo, hdrName)
                end
                lines[#lines + 1] = string.format('Label Macro %d "%s %s"', hdrNo, hdrName, c.name)
                for cj = 1, nColors do
                    lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d',
                        (cj == ci) and appOn(cj) or appOff(cj), base0 + cj - 1)
                end
                makeMacro(base0 + ci - 1, btnPrefix .. " " .. c.name,
                    (ci == defaultCi) and appOn(ci) or appOff(ci), lines)
                macroLens["C1/C2"] = #lines
            end
        end
        makeSlotRow(macC1Hdr, macC1_0, pFx1, 1, "FX C1", "C1", 1)
        makeSlotRow(macC2Hdr, macC2_0, pFx2, 2, "FX C2", "C2", c2Default)
        breathe()

        -- 5d) FX VITESSE : le battement = DelayToX des recipes de boucle,
        --     puis recuisson (/MergeLowPriority : le mode des cuissons
        --     automatiques de la console). Par plage quand ce build l'accepte.
        local function secLabel(v)
            if v == math.floor(v) then return string.format("%ds", v) end
            return tostring(v) .. "s"
        end
        makeMacro(macFxVHdr, "FX VITESSE " .. secLabel(fxSweep), appDark, {})
        for vi, v in ipairs(FX_SWEEPS) do
            local lines = {}
            if rangedFxOk then
                for k = 1, 2 do
                    lines[#lines + 1] = string.format(
                        'Set Sequence %d Thru %d Cue %d Part 0.1 Property "DelayToX" %s',
                        seqFx(1, 1), seqLast, k, fmtNum(v))
                end
            else
                for gi = 1, nFx do
                    for di = 1, nDir do
                        for k = 1, 2 do
                            lines[#lines + 1] = string.format(
                                'Set Sequence %d Cue %d Part 0.1 Property "DelayToX" %s',
                                seqFx(gi, di), k, fmtNum(v))
                        end
                    end
                end
            end
            -- vagues pulsees : le "From" suit aussi le battement
            if #pulsedList > 0 then
                if listFxOk then
                    for k = 1, 2 do
                        lines[#lines + 1] = string.format(
                            'Set Sequence %s Cue %d Part 0.1 Property "DelayFromX" %s', pulsedExpr, k, fmtNum(v))
                    end
                else
                    for _, sq in ipairs(pulsedList) do
                        for k = 1, 2 do
                            lines[#lines + 1] = string.format(
                                'Set Sequence %d Cue %d Part 0.1 Property "DelayFromX" %s', sq, k, fmtNum(v))
                        end
                    end
                end
            end
            if rangeCookOk then
                lines[#lines + 1] = string.format('Cook Sequence %d Thru %d /MergeLowPriority', seqFx(1, 1), seqLast)
            else
                for gi = 1, nFx do
                    for di = 1, nDir do
                        lines[#lines + 1] = string.format('Cook Sequence %d /MergeLowPriority', seqFx(gi, di))
                    end
                end
            end
            lines[#lines + 1] = string.format('Label Macro %d "FX VITESSE %s"', macFxVHdr, secLabel(v))
            for vj = 1, nFS do
                lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d',
                    (vj == vi) and appAccent or appGrey, macFxV0 + vj - 1)
            end
            makeMacro(macFxV0 + vi - 1, "FXV " .. fmtNum(v), (v == fxSweep) and appAccent or appGrey, lines)
            macroLens["FX VITESSE"] = #lines
        end

        -- 5e) FX FONDU : le fondu de chaque machine dans la vague
        --     (CueInFade des deux cues de chaque boucle), par plage si possible.
        makeMacro(macFxFHdr, "FX FONDU " .. secLabel(fxFade), appDark, {})
        for vi, v in ipairs(FX_FADES) do
            local lines = {}
            if rangedOk and nFx > 0 then
                for k = 1, 2 do
                    lines[#lines + 1] = string.format(
                        'Set Sequence %d Thru %d Cue %d Property "CueInFade" %s', seqFx(1, 1), seqLast, k, fmtNum(v))
                end
            else
                for gi = 1, nFx do
                    for di = 1, nDir do
                        for k = 1, 2 do
                            lines[#lines + 1] = string.format(
                                'Set Sequence %d Cue %d Property "CueInFade" %s', seqFx(gi, di), k, fmtNum(v))
                        end
                    end
                end
            end
            lines[#lines + 1] = string.format('Label Macro %d "FX FONDU %s"', macFxFHdr, secLabel(v))
            for vj = 1, nFV do
                lines[#lines + 1] = string.format('Assign Appearance %d At Macro %d',
                    (vj == vi) and appAccent or appGrey, macFxF0 + vj - 1)
            end
            makeMacro(macFxF0 + vi - 1, "FXF " .. fmtNum(v), (v == fxFade) and appAccent or appGrey, lines)
            macroLens["FX FONDU"] = #lines
        end
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
            if not (t.isAll and allMode == "none") then
                for ci = 1, nColors do
                    elements[#elements + 1] = { object = "Sequence " .. seqColor(ti, ci), x = 2 + ci - 1, y = row, clean = true }
                end
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
        local yBottom = fy6

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
    -- Le titre dit l'etat le plus GRAVE rencontre ; chaque cause de mode
    -- degrade est suivie de sa consequence en live.
    local causes = {}
    local degraded, partial = false, false
    local function cause(s) causes[#causes + 1] = s; degraded = true end
    local displayBad = (CP.display.prefer[1] < CP.display.prefer[2])
                    or (CP.display.cueApp[1] < CP.display.cueApp[2])
                    or (CP.display.seqApp[1] < CP.display.seqApp[2])
    if probe.cmd == false then
        cause("CMD de cue : NON. Une couleur SPOT tapee sous une boucle GENERAL sera reprise\n"
           .. "   par la boucle a la cue suivante. Remede : Sequence settings > Cue Command = Force Yes, ou Off All.")
    elseif probe.cmd == "partial" then
        cause("CMD de cue : au premier Go+ seulement. Retaper une tuile ALLUMEE ne recoupera pas les boucles.")
    end
    if probe.offFade == false then
        cause("\"Off ... Fade\" refuse sur ce build : les boucles sont relachees SANS fondu (Off All compris).")
    end
    if displayBad then
        cause(string.format("Affichage : PreferCueAppearance %d/%d, apparences de cue %d/%d, de sequence %d/%d\n"
           .. "   -> des tuiles sans etat ou sans couleur.",
            CP.display.prefer[1], CP.display.prefer[2], CP.display.cueApp[1], CP.display.cueApp[2],
            CP.display.seqApp[1], CP.display.seqApp[2]))
    end
    if grpKnown < nFx then
        cause(string.format("Groupes non enumeres (%d/%d) : chaque couleur coupe TOUTES les boucles FX.", grpKnown, nFx))
    end
    if sizeUnknown then
        cause("Taille des groupes inconnue : verifie les boucles FX des petits groupes (1-2 machines).")
    end
    if allMode == "none" then
        cause("ALL indisponible : pas de 2e ligne de recipe sur ce build. Donne un groupe\n"
           .. "   \"toutes machines\" dans l'assistant (Groupe ALL) et regenere.")
    end
    if copyRefOk == false then
        cause("C1/C2 par Assign Preset (la copie casse la reference) : pastilles plus lentes.")
    end
    if cueColsOk == false then
        cause("Cook /Overwrite efface les colonnes de cue sur ce build : elles ont ete reposees,\n"
           .. "   mais FX VITESSE (recuisson) peut les perdre. Verifie TrigType Follow apres usage.")
    end
    for name in pairs(CP.cmdRefused) do
        if name == "CueInFade" or name == "DelayToX" or name == "DelayFromX" or name == "Command" then
            cause(string.format("Syntaxe Cmd refusee pour %s (posee par l'API objet) : les rangees FADE / FX\n"
               .. "   ne pourront pas la reecrire en live.", name))
        end
    end
    do
        local longRows = {}
        for _, nm in ipairs({ "FADE couleur", "FX VITESSE", "FX FONDU", "C1/C2" }) do
            if (macroLens[nm] or 0) > 25 then longRows[#longRows + 1] = string.format("%s %d lignes", nm, macroLens[nm]) end
        end
        if #longRows > 0 then
            cause("Rangees de reglage longues (formes par plage refusees sur ce build) : "
               .. table.concat(longRows, ", ") .. " -> quelques secondes par appui, pas en rafale.")
        end
    end
    if macroLineFails > 0 then cause(string.format("%d macro(s) sans lignes : regenere.", macroLineFails)) end
    if failed > 0 then cause(string.format("%d case(s) de layout non placee(s).", failed)) end
    if probe.leftover then cause(string.format('Sequence %d "CP probe" a supprimer a la main.', seqProbe)) end
    if firstEmptyCue then cause("Cues non cuisinees, 1ere : " .. firstEmptyCue) end
    if CP.unknown > 0 or CP.unverified > 0 or linesUnverified > 0 or cuesUnknown > 0
        or trigUnknown > 0 or probe.cmd == nil or cueColsOk == nil or copyRefOk == nil then
        partial = true
    end
    local refused = (CP.fails > 0) or (linesOk + linesUnverified < linesWanted)
                 or (cuesCooked + cuesUnknown < cuesWanted) or (trigOk + trigUnknown < trigWanted)
    local headline
    if refused then headline = "Board construit AVEC DES REFUS : regarde les controles."
    elseif degraded then headline = "Board construit - MODE DEGRADE : lis les consequences ci-dessous."
    elseif partial then headline = "Board construit - controles partiels (certaines lectures impossibles sur ce build)."
    else headline = "Board construit - tous les controles passent." end

    local function tri(v, yes, no, unk)
        if v == true then return yes elseif v == false then return no else return unk end
    end
    local checks = string.format(
        "CONTROLES\n"
     .. "  Commandes refusees : %d%s\n"
     .. "  Commandes sans retour : %d   Habillage refuse : %d   Proprietes non verifiables : %d\n"
     .. "  Lignes de recipe : %d/%d%s   Cues cuisinees : %d/%d%s\n"
     .. "  Boucles en Follow : %d/%d%s   Groupes enumeres : %d/%d\n"
     .. "  CMD de cue : %s   Off ... Fade : %s\n"
     .. "  Colonnes de cue apres Cook : %s   C1/C2 : %s\n"
     .. "  ALL : %s   Set par plage : couleurs %s, FX %s, Cook %s\n"
     .. "  Macros live : FADE couleur %d lignes, FX VITESSE %d, FX FONDU %d, C1/C2 %d\n",
        CP.fails, (CP.fails > 0 and CP.firstFail) and ("\n    1ere : " .. CP.firstFail) or "",
        CP.unknown, CP.cosmetic, CP.unverified,
        linesOk, linesWanted, (linesUnverified > 0) and string.format(" (%d non verifiables)", linesUnverified) or "",
        cuesCooked, cuesWanted, (cuesUnknown > 0) and string.format(" (%d non verifiables)", cuesUnknown) or "",
        trigOk, trigWanted, (trigUnknown > 0) and string.format(" (%d non verifiables)", trigUnknown) or "",
        grpKnown, nFx,
        (probe.cmd == true) and "OK" or (probe.cmd == "partial") and "partiel" or (probe.cmd == false) and "NON"
            or ("non verifiable" .. (probe.detail and (" (" .. probe.detail .. ")") or "")),
        tri(probe.offFade, "accepte", "REFUSE", "non verifiable"),
        tri(cueColsOk, "conservees", "PERDUES (reposees)", "non verifiable"),
        tri(copyRefOk, "Copy + Recast", "Assign Preset", "Copy + Recast (non verifiable)"),
        (allMode == "group") and string.format("Group %d", allGid) or (allMode == "lines") and "lignes multiples"
            or (allMode == "none") and "INDISPONIBLE" or "sans (un seul groupe)",
        rangedOk and "oui" or "non", (rangedFxOk and listFxOk) and "oui" or "non", rangeCookOk and "oui" or "non",
        macroLens["FADE couleur"] or 0, macroLens["FX VITESSE"] or 0, macroLens["FX FONDU"] or 0, macroLens["C1/C2"] or 0)

    local msg = string.format(
        "%s\n%s\n"
     .. "Lignes %d (%s)\n"
     .. "%d couleurs - %d vagues FX (recipes Group + Preset)%s\n"
     .. "Sequences %d-%d - Macros %d-%d\n"
     .. "Images 3.%d-3.%d : %d/%d importees\n"
     .. "Presets 4.%d-4.%d : %d reutilises, %d crees, %d corriges\n"
     .. "Layout %d : %d/%d cases\n\n"
     .. "%s\n"
     .. "EN LIVE\n"
     .. "  Tuile couleur : la ligne change, la tuile s'allume. Retaper = relancer, jamais eteindre.\n"
     .. "  J>C  C>J  E>I  I>E  1/2 : vague C1<->C2 sur le groupe. Une couleur = stop.\n"
     .. "  C1 / C2 : couleurs de la vague, modifiables en cours.\n"
     .. "  FX VITESSE / FX FONDU : battement et douceur (prend a la cue suivante).\n"
     .. "  FADE couleur / arret : le bouton actif est surligne.\n"
     .. "  Off All : tout relacher.  Repatch : plugin > Re-cuisiner.",
        headline,
        (#causes > 0) and ("\n - " .. table.concat(causes, "\n - ") .. "\n") or "",
        nTargets, table.concat(rowNames, ", "), nColors, nFx * nDir,
        (#pulsedNames > 0) and string.format("\nVagues pulsees : %s", table.concat(pulsedNames, ", ")) or "",
        baseId, seqLast, baseId, macEnd,
        baseId, baseId + nImages - 1, imagesOk, nImages,
        baseId, baseId + nColors - 1, presetsReused, presetsCreated, presetsFixed,
        layNo, placed, placed + failed,
        checks)

    MessageBox({ title = "Color Picker LIVE  v" .. VERSION, message = msg,
        commands = { { value = 1, name = "OK" } } })
    Printf("[ColorPickerLive v%s] %s", VERSION, headline)
    for line in checks:gmatch("[^\n]+") do Printf("[ColorPickerLive] %s", line) end
    for _, w in ipairs(CP.warnings) do Printf("[ColorPickerLive] avertissement : %s", w) end
end

return main
