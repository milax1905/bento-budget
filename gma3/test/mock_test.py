#!/usr/bin/env python3
"""Rejoue ColorPicker.lua (v9, recipes) dans une console grandMA3 factice.

La console factice (Lua, via lupa) modelise ce que le plugin observe :
  - Cmd() renvoie "Ok" ou une ERREUR ("Illegal object", "Illegal property",
    "Syntax Error", "Popup" pour une commande qui ouvrirait un popup) ;
  - les sequences, cues, LIGNES DE RECIPE (Selection / Values / timings
    MAtricks), leur cuisson (Cook /Overwrite, /Remove, /MergeLowPriority,
    par plage ou non), leurs proprietes, relisibles par handle ;
  - "Assign ... Part 0.L" cree la ligne L (configurable pour la ligne 2+,
    afin d'exercer le repli Lua part:Acquire) ;
  - Go+ execute la colonne CMD de la cue (SetGlobalVariable -> GetVar) ;
  - les groupes exposent leurs membres (selectiondata), un groupe VIDE ne
    cuit jamais ;
  - le handle objet accepte EN SILENCE une propriete inconnue (comme la
    console 2.5.1) : seule la relecture peut l'attraper ;
  - "Group a + b + c" selectionne l'union, "Store Group N" la stocke (le
    groupe union "CP ALL" de la ligne ALL) ;
  - "Go+ Macro N" execute les lignes de la macro en substituant "$var"
    (configurable) : c'est la probe de substitution du plugin ;
  - macros, appearances, images, layout comme avant.

Toute commande que le modele ne connait pas renvoie "Syntax Error" : une
faute de frappe dans le plugin devient un refus compte au bilan, et donc
un test rouge.

Usage :  pip install lupa ; python3 test/mock_test.py
"""
import os, re, shutil, struct, sys, zlib

try:
    import lupa
except ImportError:
    sys.exit("pip install lupa")

HERE   = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.environ.get("COLORPICKER_LUA") or os.path.join(HERE, "..", "ColorPicker.lua")
IMGDIR = os.path.join(HERE, "_imglib")

# =====================================================================
#  La console factice (Lua) — partagee avec all_scenarios.py
# =====================================================================
MOCK = r'''
local cmds   = {}          -- toutes les commandes, dans l'ordre
local macs   = {}          -- [no] = { lignes de la macro }
local macStored, macNames = {}, {}
local layout = {}          -- elements du Layout
local images = {}          -- [no] = true quand "Import Image" l'a cree
local presets = PRESETS_PLACEHOLDER   -- [no] = label (presets 4.x deja la)
local apps   = {}          -- [no] = { props }
local seqs   = {}          -- [no] = { name, props, app, cues = { [k] = { props, app, lines, cooked } } }
local running = {}         -- [no] = true quand la sequence joue
local vars   = {}          -- variables (globales et utilisateur confondues)
local selection = {}       -- machines dans le programmer
local progValues = false   -- le programmer porte des valeurs

-- Reglages des scenarios (modifiables avant main()).
_G.ASSIGN_CREATES_LINE2 = true    -- "Assign ... Part 0.2" cree la ligne 2
_G.ACQUIRE_OK           = true    -- part:Acquire("StandardRecipe") marche
_G.SELDATA_OK           = true    -- Group.selectiondata disponible
_G.RANGED_SET_OK        = true    -- "Set Sequence a Thru b Cue 1 Property" accepte
_G.RANGED_FX_OK         = true    -- "Set Sequence a Thru b Cue k Part 0.1 Property" accepte
_G.RANGE_COOK_OK        = true    -- "Cook Sequence a Thru b /opt" accepte
_G.OFF_FADE_OK          = true    -- "Off Sequence ... Fade x" accepte
_G.CMD_EXEC_OK          = true    -- Go+ execute la colonne CMD
_G.CMD_RETURNS_NIL      = false   -- Cmd() ne renvoie rien (build muet)
_G.HANDLE_SET_SILENT    = true    -- handle:Set d'une propriete inconnue = no-op silencieux
_G.COPY_KEEPS_REF       = true    -- Copy Preset dans un slot garde les references des cues
_G.DELETE_LEAVES        = {}      -- [no] = true : sequences qui survivent au Delete par plage
_G.STORE_TRIG_AS_GO     = false   -- la console stocke "Go" quoi qu'on ecrive dans TrigType
_G.REFUSE               = {}      -- [motif Lua] = reponse forcee
_G.MACRO_SUB_OK         = true    -- "$var" substitue dans une ligne de macro executee
local macRuns = {}         -- { macro, ligne executee, reponse } (Go+ Macro)

-- Rig : Group 1 = SPOT (1..3), Group 2 = WASH (4..6), Group 3 = GENERAL (1..6).
_G.GROUPS = { [1] = {1,2,3}, [2] = {4,5,6}, [3] = {1,2,3,4,5,6} }
_G.GROUP_NAMES = { "SPOT", "WASH", "GENERAL" }
local N_FIXTURES = 8

local SEQ_PROPS  = { OffWhenOverridden = "bool", WrapAround = "bool", PreferCueAppearance = "bool", RestartMode = "str" }
local CUE_PROPS  = { TrigType = { Go = true, Follow = true, Time = true, Sound = true, BPM = true },
                     CueInFade = "num", CueInDelay = "num", Command = "str" }
local LINE_PROPS = { DelayFromX = true, DelayToX = true, FadeFromX = true, FadeToX = true,
                     XWings = true, XGroup = true, XBlock = true, InvertX = true, InvertStyle = true,
                     SelectionMode = true, Enabled = true }
_G.SEQ_PROPS, _G.CUE_PROPS, _G.LINE_PROPS = SEQ_PROPS, CUE_PROPS, LINE_PROPS

local function isBool(v) return v == "Yes" or v == "No" or v == "1" or v == "0" end

local function newElem()
    local e = { posx = 0, posy = 0, positionw = 60, positionh = 60 }
    function e:Set(k, v) self["__set_" .. k] = v end
    return e
end

local function seq(no, create)
    if not seqs[no] and create then
        seqs[no] = { name = "Sequence " .. no, props = {}, cues = {} }
    end
    return seqs[no]
end
local function cue(no, k, create)
    local s = seq(no, create)
    if not s then return nil end
    if not s.cues[k] and create then
        s.cues[k] = { props = {}, lines = {}, cooked = false }
    end
    return s.cues[k]
end

-- "a Thru b + c + d Thru e" -> liste de numeros
local function parseList(str)
    local out = {}
    for raw in (str .. " +"):gmatch("(.-)%s*%+%s*") do
        local tok = raw:gsub("^%s+", ""):gsub("%s+$", "")
        local a, b = tok:match("^(%d+)%s+Thru%s+(%d+)$")
        if a then for i = tonumber(a), tonumber(b) do out[#out + 1] = i end
        elseif tok:match("^%d+$") then out[#out + 1] = tonumber(tok) end
    end
    return out
end

-- 'Property "Name" "texte"' ou 'Property "Name" 2' -> (Name, valeur texte)
local function parseProp(rest)
    local k, v = rest:match('^Property "(%w+)" "(.-)"$')
    if k then return k, v end
    k, v = rest:match('^Property "(%w+)" (%-?[%d%.]+)$')
    if k then return k, v end
    return nil
end

local function hasOption(s) return s:match("/NoConfirmation") or s:match("/Overwrite") or s:match("/Merge") or s:match("/Remove") end

local function cookCue(c, mode)
    local ok = false
    for _, l in ipairs(c.lines) do
        if l.sel and l.val and GROUPS[l.sel] and #GROUPS[l.sel] > 0 then ok = true end
    end
    if mode == "Remove" then c.cooked = false
    else
        c.cooked = ok
        if mode == "Overwrite" then c.hard = false end
    end
    c.cookCount = (c.cookCount or 0) + 1
end

local function setCueProp(c, pk, pv)
    local kind = CUE_PROPS[pk]
    if not kind then return "Illegal property" end
    if type(kind) == "table" and not kind[pv] then return "Illegal value" end
    if kind == "num" and not tonumber(pv) then return "Illegal value" end
    if pk == "TrigType" and STORE_TRIG_AS_GO then pv = "Go" end   -- console qui normalise de travers
    c.props[pk] = pv
    return "Ok"
end

local depth = 0
local function execute(s)
    for pat, reply in pairs(REFUSE) do
        if s:match(pat) then return reply end
    end
    -- ---------------- programmer ----------------
    if s == "ClearAll" then selection = {}; progValues = false; return "Ok" end
    if s == "Fixture Thru" then
        selection = {}
        for i = 1, N_FIXTURES do selection[i] = i end
        return "Ok"
    end
    local g = s:match("^Group (%d+)$")
    if g then
        if not GROUPS[tonumber(g)] then return "Illegal object" end
        selection = {}
        for _, v in ipairs(GROUPS[tonumber(g)]) do selection[#selection + 1] = v end
        return "Ok"
    end
    local gl = s:match("^Group ([%d%s%+Thru]+)$")
    if gl and (gl:match("%+") or gl:match("Thru")) then
        local seen, out = {}, {}
        for _, no in ipairs(parseList(gl)) do
            if not GROUPS[no] then return "Illegal object" end
            for _, v in ipairs(GROUPS[no]) do
                if not seen[v] then seen[v] = true; out[#out + 1] = v end
            end
        end
        selection = out
        return "Ok"
    end
    local sg = s:match("^Store Group (%d+) ")
    if sg then
        if not hasOption(s) then return "Popup" end
        if #selection == 0 then return "Illegal command" end
        local copy = {}
        for _, v in ipairs(selection) do copy[#copy + 1] = v end
        GROUPS[tonumber(sg)] = copy
        GROUP_NAMES[tonumber(sg)] = GROUP_NAMES[tonumber(sg)] or ""
        return "Ok"
    end
    local lg, lgn = s:match('^Label Group (%d+) "(.-)"$')
    if lg then
        if not GROUPS[tonumber(lg)] then return "Illegal object" end
        GROUP_NAMES[tonumber(lg)] = lgn; return "Ok"
    end
    local f = s:match("^Fixture (%d+)$")
    if f then selection = { tonumber(f) }; return "Ok" end
    if s:match('^Attribute ".-" At %d+$') then progValues = true; return "Ok" end
    -- ---------------- presets ----------------
    local pst = s:match("^Store Preset 4%.(%d+) ")
    if pst then
        if not hasOption(s) then return "Popup" end
        if not progValues then return "Illegal command" end
        presets[tonumber(pst)] = presets[tonumber(pst)] or ""
        return "Ok"
    end
    local plab, plv = s:match('^Label Preset 4%.(%d+) "(.-)"$')
    if plab then
        if presets[tonumber(plab)] == nil then return "Illegal object" end
        presets[tonumber(plab)] = plv; return "Ok"
    end
    local cps, cpd = s:match("^Copy Preset 4%.(%d+) At Preset 4%.(%d+) ")
    if cps then
        if not hasOption(s) then return "Popup" end
        if presets[tonumber(cps)] == nil then return "Illegal object" end
        presets[tonumber(cpd)] = presets[tonumber(cpd)] or ""
        if not COPY_KEEPS_REF then
            for _, sq in pairs(seqs) do
                for _, c in pairs(sq.cues) do
                    for _, l in ipairs(c.lines) do
                        if l.val == tonumber(cpd) then l.val = nil end
                    end
                end
            end
        end
        return "Ok"
    end
    local rc = s:match("^Recast Preset 4%.(%d+)$")
    if rc then return presets[tonumber(rc)] ~= nil and "Ok" or "Illegal object" end
    -- ---------------- appearances / images ----------------
    local ap = s:match("^Store Appearance (%d+) ")
    if ap then if not hasOption(s) then return "Popup" end apps[tonumber(ap)] = apps[tonumber(ap)] or {}; return "Ok" end
    local apl, apname = s:match('^Label Appearance (%d+) "(.-)"$')
    if apl then
        if not apps[tonumber(apl)] then return "Illegal object" end
        apps[tonumber(apl)].Name = apname; return "Ok"
    end
    local apn, aprest = s:match('^Set Appearance (%d+) (Property .+)$')
    if apn then
        if not apps[tonumber(apn)] then return "Illegal object" end
        local k, v = parseProp(aprest)
        if not k then return "Syntax Error" end
        apps[tonumber(apn)][k] = v; return "Ok"
    end
    local imp = s:match("^Import Image 'Images'%.(%d+) ")
    if imp then if not hasOption(s) then return "Popup" end images[tonumber(imp)] = true; return "Ok" end
    local im, ima = s:match("^Assign Image 3%.(%d+) At Appearance (%d+)$")
    if im then
        if not images[tonumber(im)] or not apps[tonumber(ima)] then return "Illegal object" end
        return "Ok"
    end
    -- ---------------- sequences : creation ----------------
    local sn, ck = s:match("^Store Sequence (%d+) Cue (%d+)")
    if sn then
        if s:match("Part") then return "Popup" end       -- Store ... Part 0.x : type ambigu (2.4+)
        if cue(tonumber(sn), tonumber(ck)) and not hasOption(s) then return "Popup" end
        local c = cue(tonumber(sn), tonumber(ck), true)
        if progValues then c.hard = true end
        return "Ok"
    end
    -- ---------------- sequences : recipes ----------------
    local gid, rs, rcue, rl = s:match("^Assign Group (%d+) At Sequence (%d+) Cue (%d+) Part 0%.(%d+)$")
    if gid then
        if not GROUPS[tonumber(gid)] then return "Illegal object" end
        local c = cue(tonumber(rs), tonumber(rcue))
        if not c then return "Illegal object" end
        local L = tonumber(rl)
        if L > #c.lines then
            if L == #c.lines + 1 and (L == 1 or ASSIGN_CREATES_LINE2) then
                c.lines[L] = { props = {} }
            else
                return "Illegal object"
            end
        end
        c.lines[L].sel = tonumber(gid)
        return "Ok"
    end
    local pNo
    pNo, rs, rcue, rl = s:match("^Assign Preset 4%.(%d+) At Sequence (%d+) Cue (%d+) Part 0%.(%d+)$")
    if pNo then
        if presets[tonumber(pNo)] == nil then return "Illegal object" end
        local c = cue(tonumber(rs), tonumber(rcue))
        if not c or not c.lines[tonumber(rl)] then return "Illegal object" end
        c.lines[tonumber(rl)].val = tonumber(pNo)
        cookCue(c, "MergeLowPriority")            -- auto-cook
        return "Ok"
    end
    -- liste de sequences ("a Thru b", "a + b"), ligne de recipe
    local lst, rest
    lst, rcue, rl, rest = s:match('^Set Sequence ([%d%s%+Thru]+) Cue (%d+) Part 0%.(%d+) (Property .+)$')
    if lst and (lst:match("Thru") or lst:match("%+")) then
        if not RANGED_FX_OK then return "Syntax Error" end
        local k, v = parseProp(rest)
        if not k then return "Syntax Error" end
        if not LINE_PROPS[k] then return "Illegal property" end
        local any = false
        for _, no in ipairs(parseList(lst)) do
            local c = cue(no, tonumber(rcue))
            if c and c.lines[tonumber(rl)] then c.lines[tonumber(rl)].props[k] = v; cookCue(c, "MergeLowPriority"); any = true end
        end
        return any and "Ok" or "Illegal object"
    end
    rs, rcue, rl, rest = s:match('^Set Sequence (%d+) Cue (%d+) Part 0%.(%d+) (Property .+)$')
    if rs then
        local c = cue(tonumber(rs), tonumber(rcue))
        if not c or not c.lines[tonumber(rl)] then return "Illegal object" end
        local k, v = parseProp(rest)
        if not k then return "Syntax Error" end
        if not LINE_PROPS[k] then return "Illegal property" end
        c.lines[tonumber(rl)].props[k] = v
        cookCue(c, "MergeLowPriority")
        return "Ok"
    end
    -- ---------------- sequences : proprietes de cue ----------------
    lst, rcue, rest = s:match('^Set Sequence ([%d%s%+Thru]+) Cue (%d+) (Property .+)$')
    if lst and (lst:match("Thru") or lst:match("%+")) then
        if not RANGED_SET_OK then return "Syntax Error" end
        local k, v = parseProp(rest)
        if not k then return "Syntax Error" end
        local any = false
        for _, no in ipairs(parseList(lst)) do
            local c = cue(no, tonumber(rcue))
            if c then
                local r = setCueProp(c, k, v)
                if r ~= "Ok" then return r end
                any = true
            end
        end
        return any and "Ok" or "Illegal object"
    end
    rs, rcue, rest = s:match('^Set Sequence (%d+) Cue (%d+) Part 0 (Property .+)$')
    if not rs then rs, rcue, rest = s:match('^Set Sequence (%d+) Cue (%d+) (Property .+)$') end
    if rs then
        local c = cue(tonumber(rs), tonumber(rcue))
        if not c then return "Illegal object" end
        local k, v = parseProp(rest)
        if not k then return "Syntax Error" end
        return setCueProp(c, k, v)
    end
    rs, rest = s:match('^Set Sequence (%d+) (Property .+)$')
    if rs then
        local sq = seq(tonumber(rs))
        if not sq then return "Illegal object" end
        local k, v = parseProp(rest)
        if not k then return "Syntax Error" end
        local kind = SEQ_PROPS[k]
        if not kind then return "Illegal property" end
        if kind == "bool" and not isBool(v) then return "Illegal value" end
        sq.props[k] = v
        return "Ok"
    end
    -- ---------------- sequences : cuisson, labels, appearances ----------------
    local clst, copt = s:match("^Cook Sequence ([%d%s%+Thru]+) /(%w+)$")
    if clst and (clst:match("Thru") or clst:match("%+")) then
        if not RANGE_COOK_OK then return "Syntax Error" end
        if not (copt == "Overwrite" or copt == "Merge" or copt == "MergeLowPriority" or copt == "Remove") then return "Popup" end
        for _, no in ipairs(parseList(clst)) do
            local sq = seq(no)
            if sq then for _, c in pairs(sq.cues) do cookCue(c, copt) end end
        end
        return "Ok"
    end
    local cks = s:match("^Cook Sequence (%d+)")
    if cks then
        local opt = s:match("/(%w+)$")
        if not (opt == "Overwrite" or opt == "Merge" or opt == "MergeLowPriority" or opt == "Remove") then return "Popup" end
        local sq = seq(tonumber(cks))
        if not sq then return "Illegal object" end
        for _, c in pairs(sq.cues) do cookCue(c, opt) end
        return "Ok"
    end
    local ln, lv2 = s:match('^Label Sequence (%d+) "(.-)"$')
    if ln then
        local sq = seq(tonumber(ln))
        if not sq then return "Illegal object" end
        sq.name = lv2; return "Ok"
    end
    local an, asq, acue = s:match("^Assign Appearance (%d+) At Sequence (%d+) Cue (%d+)$")
    if an then
        local c = cue(tonumber(asq), tonumber(acue))
        if not c or not apps[tonumber(an)] then return "Illegal object" end
        c.app = tonumber(an); return "Ok"
    end
    an, asq = s:match("^Assign Appearance (%d+) At Sequence (%d+)$")
    if an then
        local sq = seq(tonumber(asq))
        if not sq or not apps[tonumber(an)] then return "Illegal object" end
        sq.app = tonumber(an); return "Ok"
    end
    -- ---------------- restitution ----------------
    local gp = s:match("^Go%+ Sequence (%d+)$")
    if gp then
        local sq = seq(tonumber(gp))
        if not sq then return "Illegal object" end
        running[tonumber(gp)] = true
        local c = sq.cues[1]
        if c and c.props.Command and CMD_EXEC_OK and depth < 3 then
            depth = depth + 1
            execute(c.props.Command)
            depth = depth - 1
        end
        return "Ok"
    end
    local gm = s:match("^Go%+ Macro (%d+)$")
    if gm then
        if not macStored[tonumber(gm)] then return "Illegal object" end
        if depth < 3 then
            depth = depth + 1
            for _, line in ipairs(macs[gm] or {}) do
                local l
                if MACRO_SUB_OK then
                    l = line:gsub("%$([%w_]+)", function(n) return vars[n] or "" end)
                else
                    l = line:gsub("%$([%w_]+)", "")
                end
                local rr = execute(l)
                macRuns[#macRuns + 1] = { macro = tonumber(gm), line = l, reply = rr }
            end
            depth = depth - 1
        end
        return "Ok"
    end
    local offList, offFade = s:match("^Off Sequence (.-)%s+Fade ([%d%.]+)$")
    if offList and not OFF_FADE_OK then return "Syntax Error" end
    offList = offList or s:match("^Off Sequence (.-)$")
    if offList then
        for _, no in ipairs(parseList(offList)) do running[no] = nil end
        return "Ok"
    end
    local vn, vv = s:match("^SetGlobalVariable ['\"]([%w_]+)['\"] (.+)$")
    if not vn then vn, vv = s:match("^SetUserVar ['\"]([%w_]+)['\"] (.+)$") end
    if vn then
        vv = vv:match('^"(.*)"$') or vv:match("^'(.*)'$") or vv
        vars[vn] = vv; return "Ok"
    end
    -- ---------------- suppressions ----------------
    local da, db = s:match("^Delete Sequence (%d+) Thru (%d+) ")
    if da then
        if not hasOption(s) then return "Popup" end
        for i = tonumber(da), tonumber(db) do
            if not DELETE_LEAVES[i] then seqs[i] = nil; running[i] = nil end
        end
        return "Ok"
    end
    da = s:match("^Delete Sequence (%d+) ")
    if da then
        if not hasOption(s) then return "Popup" end
        if not seqs[tonumber(da)] then return "Illegal object" end
        seqs[tonumber(da)] = nil; return "Ok"
    end
    da, db = s:match("^Delete Macro (%d+) Thru (%d+) ")
    if da then
        if not hasOption(s) then return "Popup" end
        for i = tonumber(da), tonumber(db) do macStored[i] = nil; macs[tostring(i)] = nil; macNames[i] = nil end
        return "Ok"
    end
    da = s:match("^Delete Macro (%d+) ")
    if da then
        if not hasOption(s) then return "Popup" end
        if not macStored[tonumber(da)] then return "Illegal object" end
        macStored[tonumber(da)] = nil; macs[da] = nil; macNames[tonumber(da)] = nil
        return "Ok"
    end
    da, db = s:match("^Delete Appearance (%d+) Thru (%d+) ")
    if da then
        if not hasOption(s) then return "Popup" end
        for i = tonumber(da), tonumber(db) do apps[i] = nil end
        return "Ok"
    end
    da, db = s:match("^Delete Image 3%.(%d+) Thru Image 3%.(%d+) ")
    if da then
        if not hasOption(s) then return "Popup" end
        for i = tonumber(da), tonumber(db) do images[i] = nil end
        return "Ok"
    end
    if s:match("^Delete MAtricks %d+ ") then return hasOption(s) and "Ok" or "Popup" end
    if s:match("^Delete Layout %d+ ") then if not hasOption(s) then return "Popup" end layout = {}; return "Ok" end
    -- ---------------- macros ----------------
    local ms = s:match("^Store Macro (%d+) ")
    if ms then if not hasOption(s) then return "Popup" end macStored[tonumber(ms)] = true; macs[ms] = {}; return "Ok" end
    local mn, mname = s:match('^Label Macro (%d+) "(.-)"$')
    if mn then
        if not macStored[tonumber(mn)] then return "Illegal object" end
        macNames[tonumber(mn)] = mname; return "Ok"
    end
    an, ms = s:match("^Assign Appearance (%d+) At Macro (%d+)$")
    if an then return (macStored[tonumber(ms)] and apps[tonumber(an)]) and "Ok" or "Illegal object" end
    local mm, mk, mv = s:match('^Set Macro (%d+)%.(%d+) Property "Command" "(.-)"$')
    if mm then
        if not macs[mm] or not macs[mm][tonumber(mk)] then return "Illegal object" end
        macs[mm][tonumber(mk)] = mv; return "Ok"
    end
    -- ---------------- layout ----------------
    local lay = s:match("^Store Layout (%d+) ")
    if lay then return hasOption(s) and "Ok" or "Popup" end
    if s:match('^Label Layout %d+ "') then return "Ok" end
    local obj = s:match("^Assign (.+) At Layout %d+$")
    if obj then
        local kind, no = obj:match("^(%a+) (%d+)$")
        local exists = (kind == "Macro" and macStored[tonumber(no)])
                    or (kind == "Sequence" and seqs[tonumber(no)] ~= nil)
                    or (kind == "Group" and GROUPS[tonumber(no)] ~= nil)
                    or (kind == "Fixture" and tonumber(no) <= N_FIXTURES)
        if not exists then return "Illegal object" end
        layout[#layout + 1] = newElem()
        layout[#layout].__object = obj
        return "Ok"
    end
    return "Syntax Error"
end

_G.Cmd = function(s)
    cmds[#cmds + 1] = s
    local r = execute(s)
    if r ~= "Ok" then cmds[#cmds] = s .. "  ## " .. r end
    if CMD_RETURNS_NIL then return nil end
    return r
end
_G.Printf = function(...) end

-- SelectionFirst/Next renvoient un index de SUBFIXTURE, pas un FID :
-- ici index = FID * 10 + 7, pour que toute confusion saute aux yeux.
local function sfIndex(fid) return fid * 10 + 7 end
_G.GetSubfixture = function(idx)
    local fid = (idx - 7) / 10
    if fid ~= math.floor(fid) then return nil end
    return { FID = fid, fixture = { fid = fid } }
end
_G.SelectionFirst = function()
    if #selection == 0 then return nil end
    return sfIndex(selection[1]), 1, 0, 0
end
_G.SelectionNext = function(idx)
    local fid = (idx - 7) / 10
    for i, v in ipairs(selection) do
        if v == fid and selection[i + 1] then
            return sfIndex(selection[i + 1]), i + 1, 0, 0
        end
    end
    return nil
end

_G.MessageBox = function(t)
    local inputs = {}
    if t.inputs then
        for _, inp in ipairs(t.inputs) do inputs[inp.name] = inp.value end
    end
    return { result = 1, inputs = inputs }
end

_G.Enums = { PathType = { UserImageLibrary = 64 }, Roles = { Default = 0, Display = 1, Edit = 4 } }
_G.GetPath = function() return "IMGDIR_PLACEHOLDER" end
_G.GetPathSeparator = function() return "/" end
_G.SyncFS = function() end
_G.UserVars = function() return vars end
_G.GlobalVars = function() return vars end
_G.GetVar = function(tbl, name) return tbl[name] end

_G.ShowData = function()
    return { MediaPools = { Images = setmetatable({}, { __index = function(_, k)
        if images[k] then return { __img = k } end
        return nil
    end }) } }
end

local function genericHandle()
    local h = {}
    function h:Children() return {} end
    function h:Get(k) return "" end
    function h:Set(k, v) end
    return h
end

-- handle:Set d'une propriete inconnue : silencieux (2.5.1) ou erreur
local function badSet(k)
    if HANDLE_SET_SILENT then return end
    error("Illegal property " .. tostring(k))
end

local function lineHandle(l)
    local h = {}
    function h:Get(k)
        if k == "Selection" then return l.sel and ("Group " .. l.sel) or nil end
        if k == "Values" then return l.val and ("Preset 4." .. l.val) or nil end
        if k == "DelayX" then
            if l.props.DelayFromX or l.props.DelayToX then
                return (l.props.DelayFromX or "0") .. " Thru " .. (l.props.DelayToX or "0")
            end
            return nil
        end
        return l.props[k]
    end
    function h:Set(k, v)
        if k == "Selection" then l.sel = v and v.__gid or nil
        elseif k == "Values" then l.val = v and v.__pNo or nil
        elseif LINE_PROPS[k] then l.props[k] = tostring(v)
        else badSet(k) end
    end
    return h
end

local function partHandle(c)
    local h = {}
    function h:Count() return #c.lines end
    function h:Children()
        local out = {}
        for i, l in ipairs(c.lines) do out[i] = lineHandle(l) end
        return out
    end
    function h:Acquire(class)
        if not ACQUIRE_OK then return nil end
        if class ~= "StandardRecipe" then error("Select type of object") end
        c.lines[#c.lines + 1] = { props = {} }
        return lineHandle(c.lines[#c.lines])
    end
    function h:Get(k)
        if k == "OwnDataPresent" then return (c.cooked or c.hard) and "Yes" or "No" end
        if k == "OwnNonCookedDataPresent" then return c.hard and "Yes" or "No" end
        return c.props[k]
    end
    function h:Set(k, v)
        if CUE_PROPS[k] then c.props[k] = tostring(v) else badSet(k) end
    end
    return setmetatable(h, { __index = function(_, i)
        if type(i) == "number" and c.lines[i] then return lineHandle(c.lines[i]) end
        return nil
    end })
end

_G.ObjectList = function(addr)
    local fix = addr:match("^Fixture (%d+)$")
    if fix then
        if tonumber(fix) <= N_FIXTURES then
            local h = genericHandle()
            function h:Get(k) return "Fix" .. fix end
            return { h }
        end
        return {}
    end
    local grp = addr:match("^Group (%d+)$")
    if grp then
        local gid = tonumber(grp)
        if GROUPS[gid] then
            local h = genericHandle()
            h.__gid = gid
            function h:Get(k) return GROUP_NAMES[gid] or ("G" .. gid) end
            if SELDATA_OK then
                h.selectiondata = {}
                for i, fid in ipairs(GROUPS[gid]) do
                    h.selectiondata[i] = { sf_index = sfIndex(fid), grid = { x = i - 1 } }
                end
            end
            return { h }
        end
        return {}
    end
    local pNo = addr:match("^Preset 4%.(%d+)$")
    if pNo then
        if presets[tonumber(pNo)] == nil then return {} end
        local h = genericHandle()
        h.__pNo = tonumber(pNo)
        function h:Get(k)
            if k == "Name" then return PRESET_LABELS_READABLE and presets[tonumber(pNo)] or nil end
            return ""
        end
        return { h }
    end
    if addr:match("^Preset ") then return {} end
    if addr:match("^Layout %d+$") then return {} end
    if addr:match("^MAtricks ") then return {} end
    local ap = addr:match("^Appearance (%d+)$")
    if ap then
        if not apps[tonumber(ap)] then return {} end
        local h = genericHandle()
        function h:Get(k) return apps[tonumber(ap)][k] end
        function h:Set(k, v) apps[tonumber(ap)][k] = tostring(v) end
        return { h }
    end
    local im = addr:match("^Image 3%.(%d+)$")
    if im then
        if images[tonumber(im)] then return { genericHandle() } end
        return {}
    end
    local mac = addr:match("^Macro (%d+)$")
    if mac then
        if not macStored[tonumber(mac)] then return {} end
        macs[mac] = macs[mac] or {}
        local h = genericHandle()
        function h:Get(k) if k == "Name" then return macNames[tonumber(mac)] end return nil end
        function h:Append()
            local ml = {}
            function ml:Set(k, v)
                if k == "Command" then table.insert(macs[mac], v) end
            end
            return ml
        end
        return { h }
    end
    local sn, ck = addr:match("^Sequence (%d+) Cue (%d+) Part 0$")
    if sn then
        local c = cue(tonumber(sn), tonumber(ck))
        if not c then return {} end
        return { partHandle(c) }
    end
    sn, ck = addr:match("^Sequence (%d+) Cue (%d+)$")
    if sn then
        local c = cue(tonumber(sn), tonumber(ck))
        if not c then return {} end
        local h = genericHandle()
        function h:Get(k, role) return c.props[k] end
        function h:Set(k, v) if CUE_PROPS[k] then c.props[k] = tostring(v) else badSet(k) end end
        return { h }
    end
    sn = addr:match("^Sequence (%d+)$")
    if sn then
        local sq = seq(tonumber(sn))
        if not sq then return {} end
        local h = genericHandle()
        function h:Get(k) if k == "Name" then return sq.name end return sq.props[k] end
        function h:Set(k, v) if SEQ_PROPS[k] then sq.props[k] = tostring(v) else badSet(k) end end
        return { h }
    end
    if addr:match("^Sequence ") then return {} end
    return {}
end

_G.DataPool = function()
    return {
        Layouts = setmetatable({}, { __index = function(_, k)
            if type(k) == "number" and k >= 1 then
                return setmetatable({}, {
                    __len   = function() return #layout end,
                    __index = function(_, i) return layout[i] end,
                })
            end
            return nil
        end }),
    }
end

_G.__cmds    = cmds
_G.__macs    = macs
_G.__layout  = function() return layout end
_G.__presets = presets
_G.__seqs    = seqs
_G.__apps    = apps
_G.__images  = images
_G.__running = running
_G.__vars    = vars
_G.__macStored = macStored
_G.__macNames  = macNames
_G.__macRuns   = macRuns
'''



def make_runtime(imgdir, presets="{}", labels_readable=True):
    """Instancie une console factice et y charge le plugin. Retourne (lua, main)."""
    lua = lupa.LuaRuntime(unpack_returned_tuples=True)
    mock = (MOCK.replace("IMGDIR_PLACEHOLDER", imgdir)
                .replace("PRESETS_PLACEHOLDER", presets))
    lua.execute("PRESET_LABELS_READABLE = %s" % ("true" if labels_readable else "false"))
    lua.execute(mock)
    src = open(PLUGIN, encoding="utf-8").read()
    main = lua.execute(src)
    return lua, main


def lua_list(tbl):
    if tbl is None:
        return []
    return list(tbl.values())


def lua_dict(tbl):
    if tbl is None:
        return {}
    return {k: v for k, v in tbl.items()}


def snapshot(lua):
    """Etat de la console apres le run : commandes, macros, cases, sequences, variables."""
    cmds = lua_list(lua.eval("__cmds"))
    macs = {int(k): lua_list(v) for k, v in lua.eval("__macs").items()}
    n = lua.eval("#__layout()")
    elems = [lua.eval("__layout()[%d]" % i) for i in range(1, n + 1)]
    seqs = {}
    for no, s in lua.eval("__seqs").items():
        cues = {}
        for k, c in s["cues"].items():
            lines = []
            for l in lua_list(c["lines"]):
                lines.append({"sel": l["sel"], "val": l["val"], "props": lua_dict(l["props"])})
            cues[int(k)] = {"props": lua_dict(c["props"]), "lines": lines, "cooked": bool(c["cooked"]),
                            "hard": bool(c["hard"]), "app": c["app"], "cookCount": c["cookCount"] or 0}
        seqs[int(no)] = {"name": s["name"], "props": lua_dict(s["props"]), "app": s["app"], "cues": cues}
    vars_ = {str(k): str(v) for k, v in lua.eval("__vars").items()}
    return cmds, macs, elems, seqs, vars_


def groups_of(lua):
    """Les groupes de la console factice : {no: ([fid...], nom)}."""
    out = {}
    names = lua_dict(lua.eval("GROUP_NAMES"))
    for no, members in lua.eval("GROUPS").items():
        out[int(no)] = (list(members.values()), names.get(no))
    return out


def mac_runs(lua):
    """Lignes executees par 'Go+ Macro' : [(macro, ligne substituee, reponse)]."""
    return [(int(r["macro"]), r["line"], r["reply"]) for r in lua_list(lua.eval("__macRuns"))]


# =====================================================================
#  Le run de reference
# =====================================================================
def run_default():
    shutil.rmtree(IMGDIR, ignore_errors=True)
    os.makedirs(IMGDIR, exist_ok=True)
    lua, main = make_runtime(IMGDIR)
    main(None)
    return snapshot(lua)


# =====================================================================
#  Geometrie attendue (rig de 4 lignes : ALL + 3 groupes, 12 couleurs)
# =====================================================================
B, C, T = 101, 12, 4          # ID de depart, couleurs, lignes
NFX, NDIR = 3, 5              # groupes FX, formes par groupe
NV, NFV, NFS, NC = 6, 5, 5, 12   # boutons FADE, FX FONDU, FX VITESSE, capacite palette
MAX_ROWS, MAX_GRP = 13, 12
GIDS = [1, 2, 3]              # groupes des lignes 2..4
ALL_GID = B                   # groupe union "CP ALL" stocke par le plugin (premier numero libre >= B)
SWEEP, FXFADE = "2", "1"      # defauts : battement 2 s, fondu FX 1 s
RELEASE = "1"                 # fondu fixe du CMD des cues couleur (RELEASE_FADE)
TILE = 56                     # macro tuile = sequence + TILE

SEQ_C0  = B                                   # 101..148
SEQ_END = B + T * C - 1                       # 148
SEQ_FX0 = B + T * C                           # 149..163
SEQ_LAST = SEQ_FX0 + NFX * NDIR - 1           # 163
APP_ON0, APP_OFF0 = B, B + NC                 # pastilles / contours neon (images)
APP_DARK, APP_GREY, APP_ACC, APP_RED, APP_FX, APP_FXON, APP_FXOUT = (B + 2 * NC + i for i in range(7))
APP_SEQON0 = B + 2 * NC + 7                   # cue couleur qui joue (a plat)
APP_LAST = B + 4 * NC + 5                     # 154 : plafond de nettoyage (empreintes v9.0/9.1)
P_FX1, P_FX2 = B + NC, B + NC + 1             # 113, 114
IMG_OUT0, IMG_FILL0 = B, B + NC
IMG_GREY, IMG_ACC, IMG_FXO = B + 2 * NC, B + 2 * NC + 1, B + 2 * NC + 2
N_IMAGES = 2 * C + 3
M_OFFALL, M_ALLHDR, M_TITLE = B, B + 1, B + 2
M_FCHDR, M_FC0 = B + 3, B + 4
M_FOHDR, M_FO0 = B + 4 + NV, B + 5 + NV
M_C1HDR = B + 5 + 2 * NV
M_C1_0 = M_C1HDR + 1
M_C2HDR = M_C1_0 + NC
M_C2_0 = M_C2HDR + 1
M_FXVHDR = M_C2_0 + NC
M_FXV0 = M_FXVHDR + 1
M_FXFHDR = M_FXV0 + NFS
M_FXF0 = M_FXFHDR + 1
M_SET_END = M_FXF0 + NFV - 1                   # 155 : derniere macro de reglage
M_RESERVED = B + 55                            # libre
M_TILE0 = B + TILE                             # 157 : premiere macro tuile
M_END = SEQ_LAST + TILE                        # 219 : derniere macro tuile
SEQ_DEL = B + MAX_ROWS * NC + MAX_GRP * NDIR - 1              # 316 (= sequence de test)
MAC_DEL = SEQ_DEL + TILE                                      # 372 (= macro de test)
APP_DEL, IMG_DEL = APP_LAST, B + 2 * NC + 3
SEQ_PROBE, MAC_PROBE = SEQ_DEL, MAC_DEL

seq_c  = lambda ti, ci: SEQ_C0 + (ti - 1) * C + (ci - 1)
seq_fx = lambda gi, di: SEQ_FX0 + (gi - 1) * NDIR + (di - 1)
mac_tile = lambda sq: sq + TILE
app_on  = lambda ci: APP_ON0 + ci - 1
app_off = lambda ci: APP_OFF0 + ci - 1
app_seqon = lambda ci: APP_SEQON0 + ci - 1

COLOR_NAMES = ["Red", "Orange", "Amber", "Yellow", "Green", "Cyan",
               "Azure", "Blue", "Violet", "Magenta", "Pink", "White"]
ROW_LABELS = ["ALL", "SPOT", "WASH", "GENERAL"]
DIR_LABELS = ["J>C", "C>J", "E>I", "I>E", "1/2"]
FADE_VALUES = ["0", "0.5", "1", "2", "3", "4"]
FX_FADES = ["0", "0.5", "1", "2", "4"]
FX_SWEEPS = ["0.5", "1", "2", "4", "8"]
HEADLINE_OK = "Board construit - tous les controles passent."
# bouton actif par defaut de chaque rangee (fade couleur 1 s, arret 2 s, vitesse 2 s, fondu 1 s)
DEF_FC, DEF_FO, DEF_FV, DEF_FF = M_FC0 + 2, M_FO0 + 3, M_FXV0 + 2, M_FXF0 + 2
DEF_C1, DEF_C2 = M_C1_0, M_C2_0 + 7
SEEDS = {"cp_fc": str(DEF_FC), "cp_fo": str(DEF_FO), "cp_fv": str(DEF_FV), "cp_ff": str(DEF_FF),
         "cp_c1m": str(DEF_C1), "cp_c1a": str(app_off(1)), "cp_c2m": str(DEF_C2), "cp_c2a": str(app_off(8)),
         "cp_all_src": "1 + 2 + 3", "cp_all_slot": str(ALL_GID)}

# Boucles FX qu'une ligne doit couper : les siennes et celles des groupes
# qui partagent ses machines. SPOT et WASH chevauchent GENERAL ; GENERAL
# (et ALL) chevauchent tout le monde -> tout le bloc FX d'un coup.
OVERLAP = {1: [1, 3], 2: [2, 3], 3: [1, 2, 3]}


def off_list(ranges, fade):
    parts = []
    for a, b in ranges:
        parts.append("%d Thru %d" % (a, b) if b > a else "%d" % a)
    if not parts:
        return None
    return "Off Sequence %s Fade %s" % (" + ".join(parts), fade) if fade is not None else "Off Sequence %s" % " + ".join(parts)


def split_ranges(ranges, keep):
    out = []
    for a, b in ranges:
        if keep is not None and a <= keep <= b:
            if keep > a:
                out.append((a, keep - 1))
            if keep < b:
                out.append((keep + 1, b))
        else:
            out.append((a, b))
    return out


def kill_ranges(ti, keep=None):
    """Plages de boucles coupees quand on tape la ligne ti (moins `keep`)."""
    if ti == 1:
        gis = [1, 2, 3]
    else:
        gis = OVERLAP[ti - 1]
    if len(gis) == NFX:
        ranges = [(SEQ_FX0, SEQ_LAST)]
    else:
        ranges = [(seq_fx(g, 1), seq_fx(g, NDIR)) for g in gis]
    return split_ranges(ranges, keep)


def row_kill_cmd(ti, fade=RELEASE):
    return off_list(kill_ranges(ti), fade)


def fx_kill_cmd(gi, di):
    return off_list(kill_ranges(gi + 1, seq_fx(gi, di)), "1")


def shape_props(di, pulsed=False):
    """Timings MAtricks attendus sur la ligne de recipe d'une forme."""
    p = {"DelayFromX": SWEEP if pulsed else "0", "DelayToX": SWEEP}
    if di in (3, 4):
        p["XWings"] = "2"
    if di in (2, 4):
        p["InvertX"] = "Yes"
        p["InvertStyle"] = "All"
    if di == 5:
        p["XGroup"] = "2"
    return p


def highlight(var, me, rest=APP_GREY, active=APP_ACC):
    """Les 3 lignes de surbrillance d'une rangee de reglage."""
    return ["Assign Appearance %d At Macro $%s" % (rest, var),
            "Assign Appearance %d At Macro %d" % (active, me),
            'SetGlobalVariable "%s" %d' % (var, me)]


def highlight_tint(var_m, var_a, me, ci):
    """Les 4 lignes de surbrillance d'une pastille C1/C2."""
    return ["Assign Appearance $%s At Macro $%s" % (var_a, var_m),
            "Assign Appearance %d At Macro %d" % (app_on(ci), me),
            'SetGlobalVariable "%s" %d' % (var_m, me),
            'SetGlobalVariable "%s" %d' % (var_a, app_off(ci))]


def fade_c_lines(vi, v, first_seq=SEQ_C0, last_seq=SEQ_END):
    me = M_FC0 + vi
    return (['Set Sequence %d Thru %d Cue 1 Property "CueInFade" %s' % (first_seq, last_seq, v),
             'Label Macro %d "FADE couleur %ss"' % (M_FCHDR, v)] + highlight("cp_fc", me))


def fade_o_lines(vi, v, fade_ok=True):
    me = M_FO0 + vi
    return (['Set Macro %d.1 Property "Command" "%s"' % (M_OFFALL, off_list([(B, SEQ_LAST)], v if fade_ok else None)),
             'Label Macro %d "FADE arret %ss"' % (M_FOHDR, v)] + highlight("cp_fo", me))


def tint_lines(base0, slot, hdr, name, var_m, var_a, ci):
    me = base0 + ci - 1
    return (["Copy Preset 4.%d At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % (B + ci - 1, slot),
             "Recast Preset 4.%d" % slot,
             'Label Preset 4.%d "CP %s"' % (slot, name),
             'Label Macro %d "%s %s"' % (hdr, name, COLOR_NAMES[ci - 1])] + highlight_tint(var_m, var_a, me, ci))


def fxv_lines(vi, v):
    me = M_FXV0 + vi
    return (['Set Sequence %d Thru %d Cue %d Part 0.1 Property "DelayToX" %s' % (SEQ_FX0, SEQ_LAST, k, v) for k in (1, 2)]
            + ["Cook Sequence %d Thru %d /MergeLowPriority" % (SEQ_FX0, SEQ_LAST),
               'Label Macro %d "FX VITESSE %ss"' % (M_FXVHDR, v)] + highlight("cp_fv", me))


def fxf_lines(vi, v):
    me = M_FXF0 + vi
    return (['Set Sequence %d Thru %d Cue %d Property "CueInFade" %s' % (SEQ_FX0, SEQ_LAST, k, v) for k in (1, 2)]
            + ['Label Macro %d "FX FONDU %ss"' % (M_FXFHDR, v)] + highlight("cp_ff", me))


def n_elements(t=T, c=C, nfx=NFX):
    """Cases du layout : titre, lignes (en-tete + 2 par tuile), FX (2 par tuile), reglages."""
    return 1 + t * (1 + 2 * c) + nfx * NDIR * 2 + 1 + 2 * (1 + NV) + 2 * (1 + c) + (1 + NFS) + (1 + NFV)


N_ELEMENTS = n_elements()     # 184


# =====================================================================
#  Verifications
# =====================================================================
def png_decode(path):
    """Decode un PNG RGBA 'stored deflate' et renvoie (w, h, pixels[y][x])."""
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "signature PNG"
    pos, chunks = 8, []
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        crc = struct.unpack(">I", data[pos + 8 + ln:pos + 12 + ln])[0]
        assert zlib.crc32(typ + body) & 0xFFFFFFFF == crc, "CRC %s" % typ
        chunks.append((typ, body))
        pos += 12 + ln
    assert [c[0] for c in chunks] == [b"IHDR", b"IDAT", b"IEND"]
    w, h, depth, ctype = struct.unpack(">IIBB", chunks[0][1][:10])
    assert (depth, ctype) == (8, 6), "RGBA 8 bits"
    raw = zlib.decompress(chunks[1][1])
    assert len(raw) == h * (1 + 4 * w)
    px = []
    for y in range(h):
        row = raw[y * (1 + 4 * w):(y + 1) * (1 + 4 * w)]
        assert row[0] == 0, "filtre 0"
        px.append([tuple(row[1 + 4 * x:5 + 4 * x]) for x in range(w)])
    return w, h, px


def check_cleanup(cmds, lay=1, errors=None, mac_del=MAC_DEL):
    """Le nettoyage du chemin 'plages occupees'."""
    errors = [] if errors is None else errors
    E = errors.append
    for d in ("Delete Sequence %d Thru %d /NoConfirmation" % (B, SEQ_DEL),
              "Delete Macro %d Thru %d /NoConfirmation" % (B, mac_del),
              "Delete Appearance %d Thru %d /NoConfirmation" % (B, APP_DEL),
              "Delete Image 3.%d Thru Image 3.%d /NoConfirmation" % (B, IMG_DEL),
              "Delete Layout %d /NoConfirmation" % lay):
        if d not in cmds:
            E("nettoyage manquant : " + d)
    dels = [i for i, c in enumerate(cmds) if c.startswith("Delete ")]
    offs = [i for i, c in enumerate(cmds) if c == "Off Sequence %d Thru %d Fade 2" % (B, SEQ_DEL)]
    if not offs or not dels or offs[0] > dels[0]:
        E("pas de Off (avec fondu) des sequences avant leur suppression")
    if any(re.match(r"^Delete (Preset|Group)", c) for c in cmds):
        E("un preset ou un groupe utilisateur a ete supprime")
    return errors


def check(cmds, macs, elems, seqs, vars_=None, cleanup=False, groups=None):
    errors = []
    E = errors.append

    def count(rx):
        return sum(1 for c in cmds if re.match(rx, c))

    def mac(no):
        return macs.get(no, [])

    # ---------- aucune commande refusee ----------
    refused = [c for c in cmds if "  ## " in c]
    if refused:
        E("%d commande(s) refusee(s) par la console, ex. %s" % (len(refused), refused[:3]))

    # ---------- programmer : un ClearAll, les presets, le groupe union, rien d'autre ----------
    for c in cmds:
        if re.match(r"^(At Preset|Delay |Store Sequence \d+ Cue \d+ /NoConfirmation$)", c):
            E("construction depuis le programmer : " + c); break
    if count(r"^Group \d+$"):
        E("selection d'un groupe dans le programmer (les membres viennent de selectiondata)")
    unions = [i for i, c in enumerate(cmds) if re.match(r"^Group [\d +]+$", c)]
    if len(unions) != 1 or cmds[unions[0]] != "Group 1 + 2 + 3":
        E("selection de l'union des groupes attendue une fois (Group 1 + 2 + 3), vu %s" % [cmds[i] for i in unions])
    else:
        i = unions[0]
        if cmds[i + 1] != "Store Group %d /Overwrite /NoConfirmation" % ALL_GID or "ClearAll" not in cmds[i + 1:i + 4]:
            E("le groupe union doit etre stocke juste apres la selection, puis ClearAll : %s" % cmds[i:i + 4])
        if 'Label Group %d "CP ALL"' % ALL_GID not in cmds:
            E("groupe union non labellise CP ALL")
    n_fthru = count(r"^Fixture Thru$")
    n_pst = count(r"^Store Preset 4\.\d+ /Overwrite /NoConfirmation /Universal$")
    if n_fthru != n_pst or n_pst != C:
        E("presets : %d 'Fixture Thru' pour %d Store Preset (attendu %d)" % (n_fthru, n_pst, C))
    if cmds[-1] != "ClearAll":
        E("la derniere commande n'est pas ClearAll")
    attrs = [i for i, c in enumerate(cmds) if c.startswith("Attribute ")]
    if attrs and "ClearAll" not in cmds[attrs[-1]:attrs[-1] + 4]:
        E("pas de ClearAll juste apres le dernier preset")
    if groups is not None:
        g = groups.get(ALL_GID)
        if not g or sorted(g[0]) != [1, 2, 3, 4, 5, 6] or g[1] != "CP ALL":
            E("groupe union %d : %s (attendu 1..6, CP ALL)" % (ALL_GID, g))

    # ---------- jamais de popup : options partout ----------
    for c in cmds:
        if re.match(r"^(Store|Delete|Copy|Import|Cook) ", c) and not re.search(r"/(NoConfirmation|Overwrite|Merge|MergeLowPriority|Remove)", c):
            E("commande qui ouvrirait un popup : " + c)

    # ---------- objets crees ----------
    if count(r"^Store Sequence \d+ Cue 1 /Overwrite /NoConfirmation$") != T * C + NFX * NDIR + 1:
        E("stores de cue 1 != %d (+1 probe)" % (T * C + NFX * NDIR))
    if count(r"^Store Sequence \d+ Cue 2 /Overwrite /NoConfirmation$") != NFX * NDIR:
        E("stores de cue 2 (boucles FX) != %d" % (NFX * NDIR))
    if count(r"^Store Appearance \d+ /NoConfirmation$") != 3 * C + 7:
        E("appearances != %d" % (3 * C + 7))
    n_settings = 3 + 2 * (1 + NV) + 2 * (1 + C) + (1 + NFS) + (1 + NFV)
    n_macros = n_settings + T * C + NFX * NDIR + 1          # + la macro de test
    if count(r"^Store Macro \d+ /NoConfirmation$") != n_macros:
        E("macros stockees != %d (vu %d)" % (n_macros, count(r"^Store Macro \d+ /NoConfirmation$")))
    if M_RESERVED in macs:
        E("la macro reservee %d est posee" % M_RESERVED)
    if count(r"^Import Image 'Images'\.\d+ ") != N_IMAGES:
        E("images importees != %d" % N_IMAGES)
    if count(r"^Cook Sequence \d+ /Overwrite$") != T * C + NFX * NDIR:
        E("cuissons unitaires != %d" % (T * C + NFX * NDIR))
    if any("PhaserRecipe" in c or "SpeedMaster" in c or ("MAtricks " in c and "Delete" not in c) for c in cmds):
        E("reste du moteur phaser / MAtricks pool dans les commandes")

    # ---------- nettoyage ----------
    if cleanup:
        check_cleanup(cmds, errors=errors)
    else:
        allowed = ("Delete Sequence %d /NoConfirmation" % SEQ_PROBE, "Delete Macro %d /NoConfirmation" % MAC_PROBE)
        for c in cmds:
            if c.startswith("Delete ") and c not in allowed:
                E("plages libres, et pourtant : " + c); break
        offs = [c for c in cmds if c.startswith("Off Sequence")]
        if offs != ["Off Sequence %d Fade 1" % SEQ_PROBE]:
            E("plages libres : seul le Off de la sequence de test est attendu, vu %s" % offs[:3])

    # ---------- probes sur les objets de test ----------
    i_probe = [i for i, c in enumerate(cmds) if c == "Store Sequence %d Cue 1 /Overwrite /NoConfirmation" % SEQ_PROBE]
    if len(i_probe) != 1:
        E("probe : sequence de test %d non creee une fois" % SEQ_PROBE)
    else:
        i = i_probe[0]
        tail = cmds[i:i + 24]
        for want in ("SetGlobalVariable 'cp_cmd' 0",
                     'Set Sequence %d Cue 1 Property "Command" "SetGlobalVariable \'cp_cmd\' 1"' % SEQ_PROBE,
                     "Go+ Sequence %d" % SEQ_PROBE, "Off Sequence %d Fade 1" % SEQ_PROBE,
                     "Delete Sequence %d /NoConfirmation" % SEQ_PROBE,
                     "Store Macro %d /NoConfirmation" % MAC_PROBE, "SetGlobalVariable 'cp_cmd' 7",
                     "Go+ Macro %d" % MAC_PROBE, "Delete Macro %d /NoConfirmation" % MAC_PROBE):
            if want not in tail:
                E("probe : manque %s" % want)
        if tail.count("Go+ Sequence %d" % SEQ_PROBE) != 2:
            E("probe : le CMD doit etre teste au Go+ ET a la retape")
        if 'Set Sequence %d Property "WrapAround" 1' % SEQ_PROBE not in tail:
            E("probe : WrapAround non pose sur la sequence de test (retape)")
    if SEQ_PROBE in seqs:
        E("la sequence de test n'a pas ete supprimee")
    if MAC_PROBE in macs:
        E("la macro de test n'a pas ete supprimee")
    i_first_seq = next((i for i, c in enumerate(cmds) if c == "Store Sequence %d Cue 1 /Overwrite /NoConfirmation" % B), None)
    if i_first_seq is None:
        E("la sequence %d n'est pas stockee avec /Overwrite /NoConfirmation" % B)
    elif i_probe and i_probe[0] > i_first_seq:
        E("la probe doit preceder la construction des sequences")
    if vars_ is not None and vars_.get("cp_sub") != "7":
        E("probe : la substitution $var n'a pas ete exercee (cp_sub = %s)" % vars_.get("cp_sub"))

    # ---------- probes des formes par plage ----------
    for want in ("Cook Sequence %d Thru %d /Remove" % (SEQ_FX0, SEQ_LAST),
                 "Cook Sequence %d Thru %d /Overwrite" % (SEQ_FX0, SEQ_LAST),
                 'Set Sequence %d Thru %d Cue 1 Part 0.1 Property "DelayToX" %s' % (SEQ_FX0, SEQ_LAST, SWEEP),
                 'Set Sequence %d Thru %d Cue 2 Part 0.1 Property "DelayToX" %s' % (SEQ_FX0, SEQ_LAST, SWEEP),
                 'Set Sequence %d Thru %d Cue 1 Property "CueInFade" 1' % (B, SEQ_END)):
        if want not in cmds:
            E("probe de forme par plage manquante : %s" % want)
    # auto-test de la reference C1 : second Copy + Recast du slot
    if cmds.count("Copy Preset 4.%d At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % (B, P_FX1)) != 2 \
            or "Recast Preset 4.%d" % P_FX1 not in cmds:
        E("auto-test de la reference C1 (Copy + Recast) absent")

    # ---------- sequences couleur + leur tuile neon ----------
    for ti in range(1, T + 1):
        gid = ALL_GID if ti == 1 else GIDS[ti - 2]
        for ci in range(1, C + 1):
            no = seq_c(ti, ci)
            s = seqs.get(no)
            if not s:
                E("sequence couleur %d absente" % no); continue
            label = "%s %s" % (ROW_LABELS[ti - 1], COLOR_NAMES[ci - 1])
            if s["name"] != label:
                E("sequence %d : label %s" % (no, s["name"]))
            c1 = s["cues"].get(1)
            if not c1 or len(s["cues"]) != 1:
                E("sequence %d : une seule cue attendue" % no); continue
            sels = [l["sel"] for l in c1["lines"]]
            vals = [l["val"] for l in c1["lines"]]
            if sels != [gid] or vals != [B + ci - 1]:
                E("sequence %d : ligne de recipe %s/%s (attendu %s -> 4.%d)" % (no, sels, vals, gid, B + ci - 1))
            if any(l["props"] for l in c1["lines"]):
                E("sequence %d : timings MAtricks sur une couleur" % no)
            if not c1["cooked"] or c1["hard"]:
                E("sequence %d : cue non cuisinee (ou valeurs dures)" % no)
            for k, v in (("OffWhenOverridden", ("Yes",)), ("PreferCueAppearance", ("Yes",)), ("WrapAround", ("1", "Yes"))):
                if s["props"].get(k) not in v:
                    E("sequence %d : %s = %s" % (no, k, s["props"].get(k)))
            if c1["props"].get("CueInFade") != "1":
                E("sequence %d : CueInFade = %s" % (no, c1["props"].get("CueInFade")))
            if c1["props"].get("TrigType") not in (None, "Go"):
                E("sequence %d : une cue couleur n'est pas en Go" % no)
            want = row_kill_cmd(ti)
            if c1["props"].get("Command") != want:
                E("sequence %d : CMD = %s (attendu %s)" % (no, c1["props"].get("Command"), want))
            if s["app"] != APP_DARK or c1["app"] != app_seqon(ci):
                E("sequence %d : appearances %s/%s (attendu sombre %d / pleine %d)" % (no, s["app"], c1["app"], APP_DARK, app_seqon(ci)))
            # la tuile neon par-dessus : une ligne, le contour de sa couleur
            tile = mac_tile(no)
            if mac(tile) != ["Go+ Sequence %d" % no]:
                E("tuile %d : %s (attendu Go+ Sequence %d)" % (tile, mac(tile), no))
            if "Assign Appearance %d At Macro %d" % (app_off(ci), tile) not in cmds:
                E("tuile %d : pas le contour neon %d" % (tile, app_off(ci)))
            if 'Label Macro %d "%s"' % (tile, label) not in cmds:
                E("tuile %d : label" % tile)

    # ---------- sequences FX + leur tuile ----------
    for gi in range(1, NFX + 1):
        for di in range(1, NDIR + 1):
            no = seq_fx(gi, di)
            s = seqs.get(no)
            if not s:
                E("sequence FX %d absente" % no); continue
            label = "FX %s %s" % (ROW_LABELS[gi], DIR_LABELS[di - 1])
            if s["name"] != label:
                E("sequence FX %d : label %s" % (no, s["name"]))
            if sorted(s["cues"]) != [1, 2]:
                E("sequence FX %d : 2 cues attendues" % no); continue
            for k in (1, 2):
                c = s["cues"][k]
                if len(c["lines"]) != 1 or c["lines"][0]["sel"] != GIDS[gi - 1] or c["lines"][0]["val"] != (P_FX1 if k == 1 else P_FX2):
                    E("sequence FX %d cue %d : ligne de recipe %s" % (no, k, c["lines"]))
                    continue
                if c["lines"][0]["props"] != shape_props(di):
                    E("sequence FX %d cue %d : timings %s (attendu %s)" % (no, k, c["lines"][0]["props"], shape_props(di)))
                if c["props"].get("TrigType") != "Follow":
                    E("sequence FX %d cue %d : TrigType %s" % (no, k, c["props"].get("TrigType")))
                if c["props"].get("CueInFade") != FXFADE:
                    E("sequence FX %d cue %d : CueInFade %s" % (no, k, c["props"].get("CueInFade")))
                if not c["cooked"] or c["hard"]:
                    E("sequence FX %d cue %d : non cuisinee" % (no, k))
                if c["app"] != APP_FXON:
                    E("sequence FX %d cue %d : appearance de cue %s" % (no, k, c["app"]))
                want = fx_kill_cmd(gi, di)
                if c["props"].get("Command") != want:
                    E("sequence FX %d cue %d : CMD = %s (attendu %s)" % (no, k, c["props"].get("Command"), want))
                cmd = c["props"].get("Command") or ""
                for m in re.finditer(r"(\d+)(?: Thru (\d+))?", cmd.replace("Off Sequence ", "").split(" Fade")[0]):
                    a, b = int(m.group(1)), int(m.group(2) or m.group(1))
                    if a <= no <= b:
                        E("sequence FX %d : son CMD coupe sa propre boucle" % no)
            for k, v in (("WrapAround", ("1", "Yes")), ("OffWhenOverridden", ("Yes",)), ("PreferCueAppearance", ("Yes",))):
                if s["props"].get(k) not in v:
                    E("sequence FX %d : %s = %s" % (no, k, s["props"].get(k)))
            if s["app"] != APP_FX:
                E("sequence FX %d : appearance de sequence %s" % (no, s["app"]))
            tile = mac_tile(no)
            if mac(tile) != ["Go+ Sequence %d" % no]:
                E("tuile FX %d : %s" % (tile, mac(tile)))
            if "Assign Appearance %d At Macro %d" % (APP_FXOUT, tile) not in cmds:
                E("tuile FX %d : pas le contour FX" % tile)
            if 'Label Macro %d "%s"' % (tile, label) not in cmds:
                E("tuile FX %d : label" % tile)

    extra = [no for no in seqs if no > SEQ_LAST]
    if extra:
        E("sequences inattendues : %s" % extra[:5])
    extra = [no for no in macs if no > M_END or M_SET_END < no < M_TILE0]
    if extra:
        E("macros inattendues : %s" % extra[:5])

    # ---------- macros de reglage : courtes et exactes ----------
    if mac(M_OFFALL) != ["Off Sequence %d Thru %d Fade 2" % (B, SEQ_LAST)]:
        E("Off All = %s" % mac(M_OFFALL))
    for hdr in (M_ALLHDR, M_TITLE, M_FCHDR, M_FOHDR, M_C1HDR, M_C2HDR, M_FXVHDR, M_FXFHDR):
        if mac(hdr):
            E("en-tete %d doit etre inerte" % hdr)
    for vi, v in enumerate(FADE_VALUES):
        if mac(M_FC0 + vi) != fade_c_lines(vi, v):
            E("FADE couleur %s : %s" % (v, mac(M_FC0 + vi)))
        if mac(M_FO0 + vi) != fade_o_lines(vi, v):
            E("FADE arret %s : %s" % (v, mac(M_FO0 + vi)))
    for base0, slot, hdr, name, vm, va in ((M_C1_0, P_FX1, M_C1HDR, "FX C1", "cp_c1m", "cp_c1a"),
                                           (M_C2_0, P_FX2, M_C2HDR, "FX C2", "cp_c2m", "cp_c2a")):
        for ci in range(1, C + 1):
            if mac(base0 + ci - 1) != tint_lines(base0, slot, hdr, name, vm, va, ci):
                E("pastille %d : %s" % (base0 + ci - 1, mac(base0 + ci - 1)[:5]))
    for vi, v in enumerate(FX_SWEEPS):
        if mac(M_FXV0 + vi) != fxv_lines(vi, v):
            E("FX VITESSE %s : %s" % (v, mac(M_FXV0 + vi)))
    for vi, v in enumerate(FX_FADES):
        if mac(M_FXF0 + vi) != fxf_lines(vi, v):
            E("FX FONDU %s : %s" % (v, mac(M_FXF0 + vi)))
    for no, app in ((DEF_FC, APP_ACC), (DEF_FO, APP_ACC), (DEF_FV, APP_ACC), (DEF_FF, APP_ACC),
                    (DEF_C1, app_on(1)), (DEF_C2, app_on(8))):
        if "Assign Appearance %d At Macro %d" % (app, no) not in cmds:
            E("bouton par defaut %d non surligne" % no)
    for no, lines in macs.items():
        if no >= M_TILE0:
            continue
        for l in lines:
            if re.match(r"^(ClearAll|Fixture|Group|At |Attribute|Delay|Store|Go\+|Goto|Delete)", l):
                E("macro %d : %s" % (no, l)); break
    # budget de latence : aucune macro de reglage au-dessus de 8 lignes, aucune tuile au-dessus de 1
    long_macros = {no: len(l) for no, l in macs.items() if len(l) > (1 if no >= M_TILE0 else 8)}
    if long_macros:
        E("macros trop longues (latence) : %s" % long_macros)

    # ---------- variables de surbrillance semees ----------
    if vars_ is not None:
        for k, v in SEEDS.items():
            if vars_.get(k) != v:
                E("variable %s = %s (attendu %s)" % (k, vars_.get(k), v))

    # ---------- labels uniques ----------
    labels = re.findall(r'^Label Macro (\d+) "(.*)"$', "\n".join(cmds), re.M)
    by_name = {}
    for no, name in labels:
        by_name.setdefault(name, set()).add(no)
    dups = {k: v for k, v in by_name.items() if len(v) > 1}
    if dups:
        E("labels de macros dupliques (MA3 suffixerait #2) : %s" % dups)
    seqlabels = [s["name"] for s in seqs.values()]
    if len(set(seqlabels)) != len(seqlabels):
        E("labels de sequences dupliques")

    # ---------- images ----------
    pngs = sorted(f for f in os.listdir(IMGDIR) if f.endswith(".png"))
    if len(pngs) != N_IMAGES:
        E("PNG ecrits : %d != %d" % (len(pngs), N_IMAGES))
    for f in pngs:
        try:
            w, h, px = png_decode(os.path.join(IMGDIR, f))
        except AssertionError as ex:
            E("PNG %s invalide : %s" % (f, ex)); continue
        if (w, h) != (96, 96):
            E("PNG %s : taille %dx%d" % (f, w, h))
        centre, corner, edge = px[48][48], px[0][0], px[48][3]
        if edge[3] != 255:
            E("PNG %s : contour" % f)
        if f.startswith("cp_neon") and corner != (65, 69, 73, 255):
            E("PNG %s : les coins d'un contour doivent etre OPAQUES couleur du fond (vu %s)" % (f, corner))
        if f.startswith("cp_fill") and corner[3] != 0:
            E("PNG %s : les coins d'un pave plein doivent etre transparents" % f)
        if f.startswith("cp_fill") and centre[3] != 255:
            E("PNG %s : tuile pleine au centre transparent" % f)
        if f.startswith("cp_neon") and centre[3] >= 64:
            E("PNG %s : le centre d'un contour doit laisser voir la sequence (alpha %d)" % (f, centre[3]))
    for ci in range(1, C + 1):
        if "Assign Image 3.%d At Appearance %d" % (IMG_OUT0 + ci - 1, app_off(ci)) not in cmds:
            E("couleur %d : contour neon sans image" % ci)
        if "Assign Image 3.%d At Appearance %d" % (IMG_FILL0 + ci - 1, app_on(ci)) not in cmds:
            E("couleur %d : pastille active sans pave plein" % ci)
    if "Assign Image 3.%d At Appearance %d" % (IMG_FXO, APP_FXOUT) not in cmds:
        E("contour FX sans image")
    flat = [APP_DARK, APP_RED, APP_FX, APP_FXON] + [app_seqon(ci) for ci in range(1, C + 1)]
    for c in cmds:
        if c.startswith("Assign Image") and any(c.endswith("At Appearance %d" % a) for a in flat):
            E("une image sur une appearance rendue par une SEQUENCE (elle ne la rend pas) : " + c); break
    if count(r'^Set Appearance \d+ Property "BackAlpha" "0"$') != N_IMAGES:
        E("le fond ne passe en alpha 0 que si l'image est en place")

    # ---------- layout ----------
    if len(elems) != N_ELEMENTS:
        E("cases du layout : %d != %d" % (len(elems), N_ELEMENTS))
    objs = [getattr(e, "__object", "") for e in elems]
    pos = {}
    for i, e in enumerate(elems):
        if e.posx < 0 or e.posy < 0:
            E("case %d en coordonnees negatives" % (i + 1))
        key = (e.posx, e.posy)
        if key in pos:
            # seule superposition admise : la tuile neon juste au-dessus de SA sequence
            prev = objs[pos[key]]
            m = re.match(r"^Sequence (\d+)$", prev)
            if not (pos[key] == i - 1 and m and objs[i] == "Macro %d" % mac_tile(int(m.group(1)))):
                E("case %d (%s) superposee a %s" % (i + 1, objs[i], prev))
        pos[key] = i
    n_seq_tiles = sum(1 for o in objs if o.startswith("Sequence "))
    if n_seq_tiles != T * C + NFX * NDIR:
        E("tuiles-sequences : %d != %d" % (n_seq_tiles, T * C + NFX * NDIR))
    n_overlays = sum(1 for o in objs if o.startswith("Macro ") and int(o.split()[1]) >= M_TILE0)
    if n_overlays != T * C + NFX * NDIR:
        E("macros neon posees : %d != %d" % (n_overlays, T * C + NFX * NDIR))
    for i, o in enumerate(objs):
        if o.startswith("Sequence "):
            if i + 1 >= len(objs) or objs[i + 1] != "Macro %d" % mac_tile(int(o.split()[1])):
                E("%s n'est pas recouverte par sa macro neon (suivant : %s)" % (o, objs[i + 1] if i + 1 < len(objs) else None)); break
            # la macro neon recouvre EXACTEMENT sa sequence (la console ne laisse pas reduire une case :
            # ce sont les coins opaques de l'image qui masquent le carre de la sequence)
            sq, mc = elems[i], elems[i + 1]
            if (sq.posx, sq.posy, sq.positionw, sq.positionh) != (mc.posx, mc.posy, mc.positionw, mc.positionh):
                E("%s : pas exactement sous sa macro %s (seq %s,%s %sx%s ; macro %s,%s %sx%s)" % (
                    o, objs[i + 1], sq.posx, sq.posy, sq.positionw, sq.positionh, mc.posx, mc.posy, mc.positionw, mc.positionh)); break
    if any(o.startswith("Macro ") and (int(o.split()[1]) > M_END or M_SET_END < int(o.split()[1]) < M_TILE0) for o in objs):
        E("une macro hors plage est posee sur le layout")
    go = [e for e in elems if getattr(e, "__set_Action", None) == "Go+"]
    if len(go) != N_ELEMENTS - NFX:
        E("Action=Go+ pose sur %d cases, attendu %d" % (len(go), N_ELEMENTS - NFX))
    inert = [e for e in elems if getattr(e, "__set_Action", None) == "None"]
    if len(inert) != NFX:
        E("en-tetes de groupe inertes : %d != %d" % (len(inert), NFX))
    texts = [(getattr(e, "__object", ""), getattr(e, "__set_CustomTextText", None)) for e in elems]
    want_texts = (DIR_LABELS * NFX + [v + "s" for v in FX_SWEEPS] + [v + "s" for v in FX_FADES]
                  + [v + "s" for v in FADE_VALUES] + list(FADE_VALUES))
    if sorted(t for _, t in texts if t) != sorted(want_texts):
        E("textes des cases : %s" % sorted(t for _, t in texts if t))
    if any(o.startswith("Sequence ") and t for o, t in texts):
        E("texte pose sur une sequence (cachee sous sa macro) au lieu de la macro neon")
    for e in elems:
        o = getattr(e, "__object", "")
        if (o.startswith("Sequence ") or (o.startswith("Macro ") and int(o.split()[1]) >= M_TILE0)) \
                and getattr(e, "__set_VisibilityObjectName", None) != "Hidden":
            E("tuile avec son nom d'objet affiche : %s" % o); break

    return errors


def main():
    cmds, macs, elems, seqs, vars_ = run_default()
    errors = check(cmds, macs, elems, seqs, vars_)
    total_lines = sum(len(v) for v in macs.values())
    print("commandes : %d | macros : %d | lignes de macro : %d | cases : %d | sequences : %d"
          % (len(cmds), len(macs), total_lines, len(elems), len(seqs)))
    if errors:
        print("\nFAILURES:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
