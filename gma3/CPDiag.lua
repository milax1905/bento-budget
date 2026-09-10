-- =====================================================================
--  CPDiag  —  outil de diagnostic pour Color Picker LIVE
--  ---------------------------------------------------------------
--  LECTURE SEULE. Il n'envoie AUCUNE commande, ne touche ni au
--  programmer ni au show : il ouvre une sequence FX et raconte ce
--  qu'il trouve dedans (cues, parts, lignes de recette, pas de phaser,
--  et le nom EXACT des proprietes de chaque objet).
--
--  A quoi ca sert : la rangee "FX TRANSIT" du board n'apparait que si
--  le plugin a pu confirmer, sur TA console, ou vit la transition d'un
--  pas de phaser. Chez toi il ne la trouve pas. Ce dump dit pourquoi.
--
--  Usage : lance-le et laisse "auto" — il BALAIE le pool, liste les
--  sequences du board et choisit tout seul la premiere FX. (Leur numero
--  depend du nombre de lignes : 3 lignes x 12 couleurs = FX a partir de
--  137, 4 lignes = 149... d'ou l'auto-detection.) Screenshot le resultat.
-- =====================================================================

local VERSION = "1.2"

local MAXDEPTH = 8      -- profondeur d'exploration
local MAXNODES = 500    -- garde-fou : on n'explore pas un show entier
local MAXPROPS = 60     -- proprietes listees par objet
local BOXLINES = 34     -- lignes montrees dans la fenetre
local SCAN_FROM = 101   -- plage balayee pour retrouver le board
local SCAN_TO   = 320

local function safe(f, dflt)
    local ok, v = pcall(f)
    if ok and v ~= nil then return v end
    return dflt
end

local function classOf(o)  return safe(function() return o:GetClass() end, "?") end
local function nameOf(o)   return safe(function() return o:Get("Name")  end, nil)  end

local function propNames(o)
    local t = {}
    pcall(function()
        local n = o:PropertyCount()
        for i = 1, math.min(n, MAXPROPS) do
            local pn = o:PropertyName(i)
            if pn then t[#t + 1] = pn end
        end
    end)
    return t
end

local function isObj(v)
    return v ~= nil and type(v) ~= "string" and type(v) ~= "number"
        and type(v) ~= "boolean"
end

local function childrenOf(o)
    local t = {}
    pcall(function()
        local ch = o:Children()
        if ch then for i = 1, #ch do t[i] = ch[i] end end
    end)
    return t
end

local function exists(addr)
    local h
    pcall(function() h = ObjectList(addr)[1] end)
    return h
end

local function main()
    local box = MessageBox({
        title   = "CPDiag  v" .. VERSION .. "  -  diagnostic Color Picker",
        message = "Outil de LECTURE SEULE : aucune commande n'est envoyee,\n"
               .. "rien n'est modifie dans le show.\n\n"
               .. "Laisse 'auto' : il balaie le pool, liste les sequences du\n"
               .. "board et prend la premiere FX tout seul (leur numero depend\n"
               .. "du nombre de lignes, autant ne pas le deviner).\n\n"
               .. "Puis screenshot chaque page (bouton Suite).",
        commands = { { value = 1, name = "Analyser" }, { value = 0, name = "Annuler" } },
        inputs   = { { name = "Sequence (No, ou 'auto')", value = "auto" } },
    })
    if not box or box.result ~= 1 then return end
    local typed = tostring(box.inputs["Sequence (No, ou 'auto')"] or "auto")
    local sq = tonumber(typed)
    if sq then sq = math.floor(sq) end

    local out = {}
    local function add(fmt, ...)
        local ok, s = pcall(string.format, fmt, ...)
        out[#out + 1] = ok and s or tostring(fmt)
    end

    -- 0) inventaire : quelles sequences le board a-t-il vraiment creees ?
    --    Leur numero depend du nombre de lignes, donc on ne le devine pas.
    add("--- sequences trouvees (%d..%d) ---", SCAN_FROM, SCAN_TO)
    local found, firstFx = {}, nil
    for n = SCAN_FROM, SCAN_TO do
        local h = exists(string.format("Sequence %d", n))
        if h then
            local nm = tostring(nameOf(h) or "")
            found[#found + 1] = { no = n, name = nm }
            if not firstFx and nm:sub(1, 2) == "FX" then firstFx = n end
        end
    end
    if #found == 0 then
        add("aucune sequence dans cette plage — le board a-t-il ete genere ?")
    else
        add("%d sequences, de %d a %d", #found, found[1].no, found[#found].no)
        -- on n'imprime pas les 60 couleurs : seulement les FX et les bornes
        for _, f in ipairs(found) do
            if f.name:sub(1, 2) == "FX" then add("  %d  %s", f.no, f.name) end
        end
        if not firstFx then
            add("  (aucune nommee 'FX ...' : premiere = %d '%s')",
                found[1].no, found[1].name)
        end
    end

    if not sq then
        sq = firstFx or (found[1] and found[1].no) or 101
        add("auto -> sequence %d", sq)
    end

    add("CPDiag v%s  -  Sequence %d", VERSION, sq)

    -- 1) les adresses que le plugin essaie, une par une
    add("--- adresses (ObjectList) ---")
    local probes = {
        string.format("Sequence %d", sq),
        string.format("Sequence %d Cue 1", sq),
        string.format("Sequence %d Cue 1 Part 0", sq),
        string.format("Sequence %d Cue 1 Part 0.1", sq),
        string.format("Sequence %d Cue 1 Part 0.1.'PhaserRecipeSteps'", sq),
        string.format("Sequence %d Cue 1 Part 0.1.'PhaserRecipeSteps'.1", sq),
        string.format("Sequence %d Cue 1 Part 0.1.'PhaserRecipeSteps'.1.1", sq),
    }
    for _, a in ipairs(probes) do
        add("%s  ->  %s", a, exists(a) and "OK" or "rien")
    end

    local seq = exists(string.format("Sequence %d", sq))
    if not seq then
        add("!! la sequence n'existe pas : mauvais numero ?")
    else
        -- LA question : la recette de phaser a-t-elle ete creee ? Elle
        -- vivrait comme ENFANT de la Part 0 de la cue 1. Une part sans
        -- enfant = pas de recette = la cue est vide et le FX ne fait rien.
        add("--- verdict ---")
        local cue1 = exists(string.format("Sequence %d Cue 1", sq))
        if not cue1 then
            add("pas de cue 1 : la sequence est vide")
        else
            local parts = childrenOf(cue1)
            add("cue 1 : %d part(s)", #parts)
            for i, pt in ipairs(parts) do
                local kids = childrenOf(pt)
                add("  part %d (%s) : %d enfant(s)", i, classOf(pt), #kids)
                for j, k in ipairs(kids) do
                    add("    [%d] %s", j, classOf(k))
                end
                if #kids == 0 then
                    add("    -> AUCUNE ligne de recette : le phaser n'a pas ete cree")
                end
            end
        end

        add("--- arbre d'objets ---")
        local nodes = 0
        local function dump(o, depth, tag)
            if nodes >= MAXNODES or depth > MAXDEPTH then return end
            nodes = nodes + 1
            local pad = string.rep("  ", depth)
            local nm  = nameOf(o)
            local ch  = childrenOf(o)
            add("%s%s%s%s  (%d enf.)", pad, tag,
                classOf(o), nm and (" '" .. tostring(nm) .. "'") or "", #ch)
            local pn = propNames(o)
            if #pn > 0 then
                add("%s   props: %s", pad, table.concat(pn, " "))
            end
            -- Certains conteneurs (dont 'PhaserRecipeSteps') ne sont PAS
            -- des enfants : on ne les atteint que par Get(). On teste donc
            -- chaque propriete : si elle rend un objet, c'est une branche.
            local subs = {}
            for _, name in ipairs(pn) do
                local v = safe(function() return o:Get(name) end, nil)
                if isObj(v) then subs[#subs + 1] = { name = name, obj = v } end
            end
            for _, s in ipairs(subs) do
                dump(s.obj, depth + 1, "<" .. s.name .. "> ")
            end
            for i = 1, #ch do
                dump(ch[i], depth + 1, "[" .. i .. "] ")
            end
        end
        dump(seq, 0, "")
        if nodes >= MAXNODES then add("... (coupe a %d objets)", MAXNODES) end
    end

    -- tout part dans la ligne de commande...
    for _, l in ipairs(out) do Printf("[CPDiag] %s", l) end

    -- ... et surtout dans un FICHIER : la fenetre centre le texte et le
    -- tronque, un fichier se lit et se copie en entier.
    local path
    pcall(function()
        local dir = GetPath(Enums.PathType.UserImageLibrary, true)
        local sep = "/"
        pcall(function() sep = GetPathSeparator() end)
        local p = dir .. sep .. string.format("CPDiag_%d.txt", sq)
        local f = assert(io.open(p, "w"))
        f:write(table.concat(out, "\n"))
        f:write("\n")
        f:close()
        pcall(function() SyncFS() end)
        path = p
    end)
    if path then
        table.insert(out, 1, "DUMP COMPLET ECRIT DANS :")
        table.insert(out, 2, path)
        table.insert(out, 3, "(ouvre-le dans un editeur de texte)")
    else
        table.insert(out, 1, "(fichier non ecrit : lis les pages ci-dessous)")
    end

    -- ... et par paquets a l'ecran, pour pouvoir screenshoter
    local i = 1
    while i <= #out do
        local chunk = {}
        for k = i, math.min(i + BOXLINES - 1, #out) do chunk[#chunk + 1] = out[k] end
        local more = (i + BOXLINES - 1) < #out
        local r = MessageBox({
            title    = string.format("CPDiag  -  Sequence %d  (%d-%d / %d)",
                                     sq, i, math.min(i + BOXLINES - 1, #out), #out),
            message  = table.concat(chunk, "\n"),
            commands = more and { { value = 1, name = "Suite" }, { value = 0, name = "Fermer" } }
                             or { { value = 0, name = "Fermer" } },
        })
        if not more or not r or r.result ~= 1 then break end
        i = i + BOXLINES
    end
end

return main
