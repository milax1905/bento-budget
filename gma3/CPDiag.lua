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
--  Usage : lance-le, donne le numero d'une sequence FX (149 par
--  defaut = la premiere), screenshot le resultat.
-- =====================================================================

local VERSION = "1.0"

local MAXDEPTH = 8      -- profondeur d'exploration
local MAXNODES = 200    -- garde-fou : on n'explore pas un show entier
local MAXPROPS = 60     -- proprietes listees par objet
local BOXLINES = 34     -- lignes montrees dans la fenetre

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
               .. "Donne le numero d'une sequence FX du board (la premiere\n"
               .. "est 149 avec les reglages par defaut), puis screenshot le\n"
               .. "resultat : il dit ou vit la transition des pas de phaser.",
        commands = { { value = 1, name = "Analyser" }, { value = 0, name = "Annuler" } },
        inputs   = { { name = "Sequence FX (No)", value = "149" } },
    })
    if not box or box.result ~= 1 then return end
    local sq = math.floor(tonumber(box.inputs["Sequence FX (No)"]) or 149)

    local out = {}
    local function add(fmt, ...)
        local ok, s = pcall(string.format, fmt, ...)
        out[#out + 1] = ok and s or tostring(fmt)
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

    -- tout part aussi dans la ligne de commande, au cas ou
    for _, l in ipairs(out) do Printf("[CPDiag] %s", l) end

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
