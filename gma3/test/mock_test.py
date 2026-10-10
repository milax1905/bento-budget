#!/usr/bin/env python3
"""Simulation deterministe de ColorPicker.lua contre une console MA3 factice.

Rejoue main() avec un rig de 8 machines et 3 groupes (SPOT = 1..3,
WASH = 4..6, GENERAL = 1..6, donc imbrique), puis verifie TOUT ce que le
plugin a envoye a la console :

  - objets crees et plages de nettoyage (sequences, macros, appearances,
    images, presets, layout) ;
  - contenu exact des lignes de CHAQUE macro du board (le board entier est
    fait de macros : une ligne fausse = une tuile morte en plein show) ;
  - aucune commande du board ne touche le programmer ;
  - chaque commande qui pourrait ouvrir une confirmation porte
    /NoConfirmation (une seule confirmation, jamais une par objet) ;
  - aucune propriete de sequence non verifiee sur console (OffFade...) ;
  - les boucles FX : 2 cues, TrigType Follow, WrapAround, delais fanes dans
    le bon sens pour chacune des 5 formes ;
  - les PNG generes, decodes octet par octet ;
  - le placement du layout (positions uniques, >= 0, Action pose).

Usage :  python3 test/mock_test.py          (depuis gma3/)
         python3 gma3/test/mock_test.py     (depuis la racine du depot)
Sortie : "ALL CHECKS PASSED" + code 0, sinon la liste des ecarts + code 1.
Depend de lupa (pip install lupa).
"""
import os, re, shutil, struct, sys, zlib

import lupa

HERE   = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.environ.get("COLORPICKER_LUA") or os.path.join(HERE, "..", "ColorPicker.lua")
IMGDIR = os.path.join(HERE, "_imglib")

# =====================================================================
#  La console factice (Lua) — partagee avec all_scenarios.py
# =====================================================================
MOCK = r'''
local cmds   = {}          -- toutes les commandes, dans l'ordre
local macs   = {}          -- [no] = { lignes de la macro }
local layout = {}          -- elements du Layout 1
local images = {}          -- [no] = true quand "Import Image" l'a cree
local presets = PRESETS_PLACEHOLDER   -- [no] = label (presets 4.x deja la)
local seqNames = {}        -- [no] = label (sequences stockees)
local macStored = {}       -- [no] = true quand "Store Macro" l'a cree
local apps = {}            -- [no] = true quand "Store Appearance" l'a cree
local selection = {}       -- machines dans le programmer

-- Rig : Group 1 = SPOT (1..3), Group 2 = WASH (4..6), Group 3 = GENERAL (1..6).
local GROUPS = { [1] = {1,2,3}, [2] = {4,5,6}, [3] = {1,2,3,4,5,6} }
local GROUP_NAMES = { "SPOT", "WASH", "GENERAL" }
local N_FIXTURES = 8

local function newElem()
    local e = { posx = 0, posy = 0, positionw = 60, positionh = 60 }
    function e:Set(k, v) self["__set_" .. k] = v end
    return e
end

_G.Cmd = function(s)
    cmds[#cmds + 1] = s
    -- effets de bord que le plugin observe ensuite
    if s:match("^Assign .+ At Layout %d+$") then layout[#layout + 1] = newElem() end
    if s:match("^Delete Layout") then layout = {} end
    local imp = s:match("^Import Image 'Images'%.(%d+) ")
    if imp then images[tonumber(imp)] = true end
    local pst = s:match("^Store Preset 4%.(%d+) ")
    if pst then presets[tonumber(pst)] = presets[tonumber(pst)] or "" end
    local plab, plv = s:match('^Label Preset 4%.(%d+) "(.-)"$')
    if plab then presets[tonumber(plab)] = plv end
    local cp = s:match("^Copy Preset 4%.%d+ At Preset 4%.(%d+) ")
    if cp then presets[tonumber(cp)] = presets[tonumber(cp)] or "" end
    local st = s:match("^Store Sequence (%d+) Cue")
    if st then seqNames[tonumber(st)] = seqNames[tonumber(st)] or "" end
    local ln, lv = s:match('^Label Sequence (%d+) "(.-)"$')
    if ln then seqNames[tonumber(ln)] = lv end
    local ms = s:match("^Store Macro (%d+) ")
    if ms then macStored[tonumber(ms)] = true; macs[ms] = {} end
    local as = s:match("^Store Appearance (%d+) ")
    if as then apps[tonumber(as)] = true end
    -- suppressions par plage : l'objet n'existe plus ensuite
    local da, db = s:match("^Delete Sequence (%d+) Thru (%d+) ")
    if da then for i = tonumber(da), tonumber(db) do seqNames[i] = nil end end
    da, db = s:match("^Delete Macro (%d+) Thru (%d+) ")
    if da then for i = tonumber(da), tonumber(db) do macStored[i] = nil; macs[tostring(i)] = nil end end
    da, db = s:match("^Delete Appearance (%d+) Thru (%d+) ")
    if da then for i = tonumber(da), tonumber(db) do apps[i] = nil end end
    da, db = s:match("^Delete Image 3%.(%d+) Thru Image 3%.(%d+) ")
    if da then for i = tonumber(da), tonumber(db) do images[i] = nil end end
    -- programmer
    if s == "ClearAll" then selection = {}
    elseif s == "Fixture Thru" then
        selection = {}
        for i = 1, N_FIXTURES do selection[i] = i end
    else
        local g = s:match("^Group (%d+)$")
        local f = s:match("^Fixture (%d+)$")
        if g and GROUPS[tonumber(g)] then
            selection = {}
            for _, v in ipairs(GROUPS[tonumber(g)]) do selection[#selection + 1] = v end
        elseif f then
            selection = { tonumber(f) }
        end
    end
end
_G.Printf = function(...) end

-- SelectionFirst/Next renvoient un index de SUBFIXTURE, pas un FID :
-- ici index = FID * 10 + 7, pour que toute confusion saute aux yeux.
local function sfIndex(fid) return fid * 10 + 7 end
_G.GetSubfixture = function(idx)
    local fid = (idx - 7) / 10
    if fid ~= math.floor(fid) then return nil end
    return { FID = fid }
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
    return { result = 1, inputs = inputs }      -- "Generer" / "Ecraser" / "Super !"
end

_G.Enums = { PathType = { UserImageLibrary = 64 }, Roles = { Display = 1, Edit = 4 } }
_G.GetPath = function() return "IMGDIR_PLACEHOLDER" end
_G.GetPathSeparator = function() return "/" end
_G.SyncFS = function() end

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
        if GROUP_NAMES[tonumber(grp)] then
            local h = genericHandle()
            function h:Get(k) return GROUP_NAMES[tonumber(grp)] end
            return { h }
        end
        return {}
    end
    local pNo = addr:match("^Preset 4%.(%d+)$")
    if pNo then
        if presets[tonumber(pNo)] == nil then return {} end
        local h = genericHandle()
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
        if apps[tonumber(ap)] then return { genericHandle() } end
        return {}
    end
    local im = addr:match("^Image 3%.(%d+)$")
    if im then
        if images[tonumber(im)] then return { genericHandle() } end
        return {}
    end
    -- Une macro n'existe que si elle a ete stockee : le plugin decide de
    -- la confirmation d'ecrasement d'apres cette existence.
    local mac = addr:match("^Macro (%d+)$")
    if mac then
        if not macStored[tonumber(mac)] then return {} end
        macs[mac] = macs[mac] or {}
        local h = genericHandle()
        function h:Append()
            local ml = {}
            function ml:Set(k, v)
                if k == "Command" then table.insert(macs[mac], v) end
            end
            return ml
        end
        return { h }
    end
    -- Une sequence n'existe que si elle a ete stockee (sinon le test
    -- "construction incomplete" du plugin ne voudrait rien dire).
    local sn = addr:match("^Sequence (%d+)")
    if sn and seqNames[tonumber(sn)] == nil then return {} end
    local sc = addr:match("^Sequence (%d+) Cue (%d+)")
    if sc then
        local cueStored = false
        for _, c in ipairs(cmds) do
            if c:match("^Store Sequence " .. sn .. " Cue " .. addr:match("Cue (%d+)") .. " ") then
                cueStored = true; break
            end
        end
        if not cueStored then return {} end
    end
    return { genericHandle() }
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

_G.__cmds   = cmds
_G.__macs   = macs
_G.__layout = function() return layout end
_G.__presets = presets
_G.__macStored = macStored     -- les scenarios y posent des objets "deja la"
_G.__seqNames  = seqNames
_G.__apps      = apps
_G.__images    = images
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


# =====================================================================
#  Le run de reference
# =====================================================================
def run_default():
    shutil.rmtree(IMGDIR, ignore_errors=True)
    os.makedirs(IMGDIR, exist_ok=True)
    lua, main = make_runtime(IMGDIR)
    main(None)
    cmds = lua_list(lua.eval("__cmds"))
    macs = {int(k): lua_list(v) for k, v in lua.eval("__macs").items()}
    n_layout = lua.eval("#__layout()")
    elems = [lua.eval("__layout()[%d]" % i) for i in range(1, n_layout + 1)]
    return cmds, macs, elems


# =====================================================================
#  Geometrie attendue (rig de 4 lignes : ALL + 3 groupes, 12 couleurs)
# =====================================================================
B, C, T = 101, 12, 4          # ID de depart, couleurs, lignes
NFX, NDIR = 3, 5              # groupes FX, formes par groupe
NV, NFV, NC = 6, 5, 12        # boutons FADE, boutons FX FONDU, capacite palette
MAX_ROWS, MAX_GRP = 13, 12

SEQ_C0  = B                                   # 101..148
SEQ_FX0 = B + T * C                           # 149..163
SEQ_LAST = SEQ_FX0 + NFX * NDIR - 1           # 163
APP_ON0, APP_OFF0 = B, B + NC                 # 101.., 113..
APP_DARK, APP_GREY, APP_ACC, APP_RED, APP_FX, APP_FXON = (B + 2 * NC + i for i in range(6))
P_FX1, P_FX2 = B + NC, B + NC + 1             # 113, 114
IMG_OUT0, IMG_FILL0 = B, B + NC
IMG_GREY, IMG_ACC, IMG_FXO, IMG_FXF = (B + 2 * NC + i for i in range(4))
M_OFFALL, M_ALLHDR, M_TITLE = B, B + 1, B + 2
M_FCHDR, M_FC0 = B + 3, B + 4
M_FOHDR, M_FO0 = B + 4 + NV, B + 5 + NV
M_C1HDR = B + 5 + 2 * NV
M_C1_0 = M_C1HDR + 1
M_C2HDR = M_C1_0 + NC
M_C2_0 = M_C2HDR + 1
M_FXFHDR = M_C2_0 + NC
M_FXF0 = M_FXFHDR + 1
M_TILE0 = M_FXF0 + NFV
M_FX0 = M_TILE0 + T * C
M_END = M_FX0 + NFX * NDIR - 1
SEQ_DEL = B + MAX_ROWS * NC + MAX_GRP * NDIR - 1
MAC_DEL = B + 8 + 2 * NV + NFV + 2 * NC + MAX_ROWS * NC + MAX_GRP * NDIR - 1
APP_DEL, IMG_DEL = B + 2 * NC + 5, B + 2 * NC + 3

seq_c  = lambda ti, ci: SEQ_C0 + (ti - 1) * C + (ci - 1)
seq_fx = lambda gi, di: SEQ_FX0 + (gi - 1) * NDIR + (di - 1)
m_tile = lambda ti, ci: M_TILE0 + (ti - 1) * C + (ci - 1)
m_fx   = lambda gi, di: M_FX0 + (gi - 1) * NDIR + (di - 1)
app_on  = lambda ci: APP_ON0 + ci - 1
app_off = lambda ci: APP_OFF0 + ci - 1

COLOR_NAMES = ["Red", "Orange", "Amber", "Yellow", "Green", "Cyan",
               "Azure", "Blue", "Violet", "Magenta", "Pink", "White"]
ROW_LABELS = ["ALL", "SPOT", "WASH", "GENERAL"]
DIR_LABELS = ["J>C", "C>J", "E>I", "I>E", "1/2"]
FADE_VALUES = ["0", "0.5", "1", "2", "3", "4"]
FX_FADES = ["0", "0.1", "0.2", "0.5", "1"]

# Boucles FX qu'une ligne doit couper : les siennes et celles des groupes
# qui partagent ses machines. SPOT et WASH chevauchent GENERAL ; GENERAL
# (et ALL) chevauchent tout le monde -> tout le bloc FX d'un coup.
OVERLAP = {1: [1, 3], 2: [2, 3], 3: [1, 2, 3]}


def off_cmd(a, b, fade):
    if b > a:
        return "Off Sequence %d Thru %d Fade %s" % (a, b, fade)
    return "Off Sequence %d Fade %s" % (a, fade)


def off_split(a, b, keep, fade):
    """Off de la plage a..b en epargnant la sequence `keep`."""
    out = []
    if keep is None or keep < a or keep > b:
        return [off_cmd(a, b, fade)]
    if keep > a:
        out.append(off_cmd(a, keep - 1, fade))
    if keep < b:
        out.append(off_cmd(keep + 1, b, fade))
    return out


def fx_offs(gi, di, fade):
    """Lignes Off attendues en tete de la tuile FX (gi, di) : toutes les
    boucles qui touchent ses machines, SAUF la sienne (Go+ la demarre)."""
    me = seq_fx(gi, di)
    if len(OVERLAP[gi]) == NFX:
        return off_split(SEQ_FX0, SEQ_LAST, me, fade)
    out = []
    for gj in OVERLAP[gi]:
        out += off_split(seq_fx(gj, 1), seq_fx(gj, NDIR), me, fade)
    return out


def tile_offs(ti, fade):
    """Lignes Off attendues apres le Goto d'une tuile couleur de la ligne ti."""
    if ti == 1:
        return [off_cmd(SEQ_FX0, SEQ_LAST, fade)]
    gi = ti - 1
    if len(OVERLAP[gi]) == NFX:
        return [off_cmd(SEQ_FX0, SEQ_LAST, fade)]
    return [off_cmd(seq_fx(gj, 1), seq_fx(gj, NDIR), fade) for gj in OVERLAP[gi]]


def off_ranges(lines):
    """(a, b) de chaque ligne 'Off Sequence a [Thru b]'."""
    out = []
    for l in lines:
        m = re.match(r"^Off Sequence (\d+)(?: Thru (\d+))? Fade ", l)
        if m:
            a = int(m.group(1))
            out.append((a, int(m.group(2)) if m.group(2) else a))
    return out


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


def check_cleanup(cmds, lay=1, errors=None):
    """Le nettoyage large du chemin 'plages occupees' : plages MAX, une
    seule confirmation (le recapitulatif), un Off avec fondu AVANT les
    Delete, jamais de Delete Preset."""
    errors = [] if errors is None else errors
    E = errors.append
    for d in ("Delete Sequence %d Thru %d /NoConfirmation" % (B, SEQ_DEL),
              "Delete Macro %d Thru %d /NoConfirmation" % (B, MAC_DEL),
              "Delete Appearance %d Thru %d /NoConfirmation" % (B, APP_DEL),
              "Delete Image 3.%d Thru Image 3.%d /NoConfirmation" % (B, IMG_DEL),
              "Delete Layout %d /NoConfirmation" % lay):
        if d not in cmds:
            E("nettoyage manquant : " + d)
    dels = [i for i, c in enumerate(cmds) if c.startswith("Delete ")]
    offs = [i for i, c in enumerate(cmds) if c == "Off Sequence %d Thru %d Fade 2" % (B, SEQ_DEL)]
    if not offs or not dels or offs[0] > dels[0]:
        E("pas de Off (avec fondu) des sequences avant leur suppression")
    if any(re.match(r"^Delete Preset", c) for c in cmds):
        E("un preset utilisateur a ete supprime")
    if any(c.startswith("Delete MAtricks") for c in cmds):
        E("Delete MAtricks emis alors qu'aucun MAtricks n'existe")
    return errors


def check(cmds, macs, elems, cleanup=False):
    errors = []
    E = errors.append

    def count(rx):
        return sum(1 for c in cmds if re.match(rx, c))

    def mac(no):
        return macs.get(no, [])

    # ---------- objets crees ----------
    if count(r"^Store Sequence \d+ Cue 1 /NoConfirmation$") != T * C + NFX * NDIR:
        E("stores de cue 1 != %d" % (T * C + NFX * NDIR))
    if count(r"^Store Sequence \d+ Cue 2 /NoConfirmation$") != NFX * NDIR:
        E("stores de cue 2 (boucles FX) != %d" % (NFX * NDIR))
    if count(r"^Store Appearance \d+ /NoConfirmation$") != 2 * C + 6:
        E("appearances != %d" % (2 * C + 6))
    n_macros = 3 + 2 * (1 + NV) + 2 * (1 + C) + (1 + NFV) + T * C + NFX * NDIR
    if count(r"^Store Macro \d+ /NoConfirmation$") != n_macros:
        E("macros stockees != %d" % n_macros)
    if count(r"^Store Preset 4\.\d+ /Overwrite /NoConfirmation /Universal$") != C:
        E("presets couleur crees != %d" % C)
    if count(r"^Import Image 'Images'\.\d+ ") != 2 * C + 4:
        E("images importees != %d" % (2 * C + 4))
    if count(r"^Store MAtricks ") != 0:
        E("des MAtricks sont encore crees")
    if any("PhaserRecipe" in c or "SpeedMaster" in c for c in cmds):
        E("reste du moteur phaser dans les commandes")

    # ---------- nettoyage ----------
    if cleanup:
        check_cleanup(cmds, errors=errors)
    else:
        # plages libres : RIEN n'est supprime ni relache avant la construction
        for c in cmds:
            if c.startswith("Delete ") or c.startswith("Off Sequence"):
                E("plages libres, et pourtant : " + c); break
    for c in cmds:
        if re.match(r"^(Store|Delete|Copy|Import) ", c) and "/NoConfirmation" not in c:
            E("commande sans /NoConfirmation : " + c)
    if any("/NoConfirm " in c or c.endswith("/NoConfirm") for c in cmds):
        E("/NoConfirm (ancien nom) utilise")

    # ---------- proprietes de sequence : rien de non verifie ----------
    seen = set(re.findall(r'Set Sequence \d+ Property "(\w+)"', "\n".join(cmds)))
    for no in macs:
        seen |= set(re.findall(r'Set Sequence \d+ Property "(\w+)"', "\n".join(mac(no))))
    seen |= set(re.findall(r'Set Sequence \d+ Cue \d+ Property "(\w+)"', "\n".join(cmds)))
    for no in macs:
        seen |= set(re.findall(r'Set Sequence \d+ Cue \d+ Property "(\w+)"', "\n".join(mac(no))))
    allowed = {"OffWhenOverridden", "WrapAround", "CueInFade", "TrigType"}
    if seen - allowed:
        E("proprietes de sequence non verifiees : %s" % sorted(seen - allowed))
    if any("OffFade" in c for c in cmds) or any("OffFade" in l for no in macs for l in mac(no)):
        E("OffFade (propriete illegale) emis")

    # ---------- programmer : propre, et seulement pendant la generation ----------
    if cmds[-1] != "ClearAll":
        E("la derniere commande n'est pas ClearAll (programmer sale)")
    for no in range(B, M_END + 1):
        for l in mac(no):
            if re.match(r"^(ClearAll|Fixture|Group|At |Attribute|Delay|Store Sequence)", l):
                E("macro %d touche le programmer : %s" % (no, l))
                break

    # ---------- sequences couleur ----------
    for ti in range(1, T + 1):
        for ci in range(1, C + 1):
            sq = seq_c(ti, ci)
            i = cmds.index("Store Sequence %d Cue 1 /NoConfirmation" % sq)
            # ClearAll, selection, 3 attributs, le preset, puis le store
            window = cmds[i - 6:i]
            if window[0] != "ClearAll":
                E("seq %d : pas de ClearAll avant la selection" % sq)
            if window[1] not in ("Fixture Thru", "Group %d" % (ti - 1)):
                E("seq %d : selection inattendue %s" % (sq, window[1]))
            if window[5] != "At Preset 4.%d" % (B + ci - 1):
                E("seq %d : la cue ne reference pas son preset" % sq)
            lbl = 'Label Sequence %d "%s %s"' % (sq, ROW_LABELS[ti - 1], COLOR_NAMES[ci - 1])
            if lbl not in cmds:
                E("label manquant : " + lbl)
            if 'Set Sequence %d Cue 1 Property "CueInFade" "1"' % sq not in cmds:
                E("seq %d : fade couleur par defaut (1 s) absent" % sq)
            if 'Set Sequence %d Property "OffWhenOverridden" "Yes"' % sq not in cmds:
                E("seq %d : OffWhenOverridden manquant" % sq)

    # ---------- boucles FX : forme des delais ----------
    def delays_for(sq, k, slot):
        """[(adresse, delay)] de la cue k, lus dans la fenetre de commandes."""
        i = cmds.index("Store Sequence %d Cue %d /NoConfirmation" % (sq, k))
        j = i
        while cmds[j] != "ClearAll":
            j -= 1
        out = []
        for c in cmds[j + 1:i]:
            m = re.match(r"^Fixture (\d+)$", c)
            if m:
                out.append([int(m.group(1)), None, None])
            m = re.match(r"^At Preset 4\.(\d+)$", c)
            if m and out:
                out[-1][1] = int(m.group(1))
            m = re.match(r"^Delay (\S+)$", c)
            if m and out:
                out[-1][2] = float(m.group(1))
        return out

    EXPECT = {   # groupe de 3 machines, etalement 1 s
        "J>C": [0.0, 0.5, 1.0], "C>J": [1.0, 0.5, 0.0],
        "E>I": [0.0, 1.0, 0.0], "I>E": [1.0, 0.0, 1.0], "1/2": [1.0, 1.0, 1.0],
    }
    for gi in range(1, NFX + 1):
        members = {1: [1, 2, 3], 2: [4, 5, 6], 3: [1, 2, 3, 4, 5, 6]}[gi]
        for di, lbl in enumerate(DIR_LABELS, 1):
            sq = seq_fx(gi, di)
            for k, slot in ((1, P_FX1), (2, P_FX2)):
                rows = delays_for(sq, k, slot)
                if [r[0] for r in rows] != members:
                    E("FX %d cue %d : machines %s != %s" % (sq, k, [r[0] for r in rows], members))
                    continue
                if lbl == "1/2":
                    other = P_FX2 if slot == P_FX1 else P_FX1
                    want = [slot if i % 2 == 1 else other for i in range(1, len(members) + 1)]
                    if [r[1] for r in rows] != want:
                        E("FX %d cue %d : damier faux %s" % (sq, k, [r[1] for r in rows]))
                else:
                    if any(r[1] != slot for r in rows):
                        E("FX %d cue %d : toutes les machines doivent prendre le slot %d" % (sq, k, slot))
                if gi != 3:
                    if [r[2] for r in rows] != EXPECT[lbl]:
                        E("FX %d (%s) cue %d : delais %s != %s" % (sq, lbl, k, [r[2] for r in rows], EXPECT[lbl]))
                if 'Set Sequence %d Cue %d Property "TrigType" "Follow"' % (sq, k) not in cmds:
                    E("FX %d cue %d : pas de Follow" % (sq, k))
                if 'Set Sequence %d Cue %d Property "CueInFade" "0"' % (sq, k) not in cmds:
                    E("FX %d cue %d : fondu FX par defaut (0) absent" % (sq, k))
            if 'Set Sequence %d Property "WrapAround" "Yes"' % sq not in cmds:
                E("FX %d : WrapAround manquant" % sq)
            if 'Label Sequence %d "FX %s %s"' % (sq, ROW_LABELS[gi], lbl) not in cmds:
                E("FX %d : label manquant" % sq)
    # le groupe GENERAL (6 machines) : balayage symetrique a 6
    rows = delays_for(seq_fx(3, 3), 1, P_FX1)
    if [r[2] for r in rows] != [0.0, 0.5, 1.0, 1.0, 0.5, 0.0]:
        E("E>I sur 6 machines : delais %s" % [r[2] for r in rows])

    # ---------- presets : crees en /Overwrite, slots FX poses ----------
    for ci in range(1, C + 1):
        if 'Label Preset 4.%d "%s"' % (B + ci - 1, COLOR_NAMES[ci - 1]) not in cmds:
            E("preset 4.%d : label %s manquant" % (B + ci - 1, COLOR_NAMES[ci - 1]))
    for slot, src in ((P_FX1, B), (P_FX2, B + 7)):
        if "Copy Preset 4.%d At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % (src, slot) not in cmds:
            E("slot FX 4.%d : copie initiale manquante" % slot)
    if any("Copy Preset" in c and "/Merge" in c for c in cmds):
        E("Copy Preset /Merge : les slots garderaient des restes")

    # ---------- macros : tuiles couleur ----------
    for ti in range(1, T + 1):
        for ci in range(1, C + 1):
            me, lines = m_tile(ti, ci), mac(m_tile(ti, ci))
            if not lines:
                E("tuile %d vide" % me); continue
            if lines[0] != "Goto Sequence %d Cue 1 Fade 1" % seq_c(ti, ci):
                E("tuile %d : ligne 1 = %s" % (me, lines[0]))
            offs = [l for l in lines if l.startswith("Off Sequence")]
            want = tile_offs(ti, "1")
            if offs != want or lines[1:1 + len(want)] != want:
                E("tuile %d : Off FX = %s (attendu %s, juste apres le Goto)" % (me, offs, want))
            if "Assign Appearance %d At Macro %d" % (app_on(ci), me) not in lines:
                E("tuile %d : ne se remplit pas" % me)
            for cj in range(1, C + 1):
                if cj != ci and "Assign Appearance %d At Macro %d" % (app_off(cj), m_tile(ti, cj)) not in lines:
                    E("tuile %d : ne vide pas la tuile %d de sa ligne" % (me, m_tile(ti, cj)))
            # la ligne ALL est repeinte (elle n'a plus la main partout)
            if ti != 1 and "Assign Appearance %d At Macro %d" % (app_off(1), m_tile(1, 1)) not in lines:
                E("tuile %d : ne repeint pas la ligne ALL" % me)
            if "Assign Appearance %d At Macro %d" % (app_on(ci), me) in lines and \
               lines.index("Assign Appearance %d At Macro %d" % (app_on(ci), me)) > 4:
                E("tuile %d : le remplissage arrive trop tard dans la macro" % me)

    # ---------- macros : tuiles FX ----------
    for gi in range(1, NFX + 1):
        for di in range(1, NDIR + 1):
            me, lines = m_fx(gi, di), mac(m_fx(gi, di))
            if not lines:
                E("tuile FX %d vide" % me); continue
            want = fx_offs(gi, di, "1")
            if lines[:len(want)] != want:
                E("tuile FX %d : tete = %s (attendu %s)" % (me, lines[:len(want)], want))
            # la boucle visee n'est JAMAIS coupee par sa propre tuile
            for a, b in off_ranges(lines):
                if a <= seq_fx(gi, di) <= b:
                    E("tuile FX %d : coupe sa propre boucle (%d-%d)" % (me, a, b))
            # ... mais toutes les autres boucles qui touchent ses machines le sont
            covered = set()
            for a, b in off_ranges(lines):
                covered |= set(range(a, b + 1))
            for gj in OVERLAP[gi]:
                for dj in range(1, NDIR + 1):
                    if seq_fx(gj, dj) != seq_fx(gi, di) and seq_fx(gj, dj) not in covered:
                        E("tuile FX %d : laisse tourner la boucle %d" % (me, seq_fx(gj, dj)))
            if len(lines) <= len(want) or lines[len(want)] != "Go+ Sequence %d" % seq_fx(gi, di):
                E("tuile FX %d : doit partir en Go+ (Goto n'enchaine pas les Follow)" % me)
            if any(l.startswith("Goto ") for l in lines):
                E("tuile FX %d : un Goto s'est glisse dedans" % me)
            if "Assign Appearance %d At Macro %d" % (APP_FXON, me) not in lines:
                E("tuile FX %d : ne se remplit pas" % me)
            for dj in range(1, NDIR + 1):
                if dj != di and "Assign Appearance %d At Macro %d" % (APP_FX, m_fx(gi, dj)) not in lines:
                    E("tuile FX %d : ne vide pas la forme %d" % (me, dj))

    # ---------- Off All ----------
    off = mac(M_OFFALL)
    if not off or off[0] != "Off Sequence %d Thru %d Fade 2" % (B, SEQ_LAST):
        E("Off All : ligne 1 = %s" % (off[:1],))
    for ti in range(1, T + 1):
        for ci in range(1, C + 1):
            if "Assign Appearance %d At Macro %d" % (app_off(ci), m_tile(ti, ci)) not in off:
                E("Off All ne remet pas la tuile %d au repos" % m_tile(ti, ci)); break
    for gi in range(1, NFX + 1):
        for di in range(1, NDIR + 1):
            if "Assign Appearance %d At Macro %d" % (APP_FX, m_fx(gi, di)) not in off:
                E("Off All ne remet pas la tuile FX %d au repos" % m_fx(gi, di)); break

    # ---------- rangees FADE ----------
    tiles = [m_tile(ti, ci) for ti in range(1, T + 1) for ci in range(1, C + 1)] + \
            [m_fx(gi, di) for gi in range(1, NFX + 1) for di in range(1, NDIR + 1)]
    for vi, v in enumerate(FADE_VALUES):
        lc, lo = mac(M_FC0 + vi), mac(M_FO0 + vi)
        # Un bouton FADE couleur reecrit, dans CHAQUE tuile (couleur et FX),
        # chaque ligne Goto/Off : la meme commande avec le nouveau fondu.
        rewrites = {}
        for l in lc:
            m = re.match(r'^Set Macro (\d+)\.(\d+) Property "Command" "(.*)"$', l)
            if m:
                rewrites[(int(m.group(1)), int(m.group(2)))] = m.group(3)
        expected = {}
        for mno in tiles:
            for k, line in enumerate(mac(mno), 1):
                if line.startswith("Goto ") or line.startswith("Off Sequence"):
                    expected[(mno, k)] = re.sub(r"Fade \S+$", "Fade " + v, line)
        if rewrites != expected:
            missing = sorted(set(expected) - set(rewrites))[:3]
            extra = sorted(set(rewrites) - set(expected))[:3]
            wrong = sorted(k for k in set(rewrites) & set(expected) if rewrites[k] != expected[k])[:3]
            E("fade couleur %s : reecritures incompletes (manque %s, en trop %s, fausses %s)"
              % (v, missing, extra, wrong))
        if sum(1 for k in rewrites if k[1] == 1 and rewrites[k].startswith("Goto ")) != T * C:
            E("fade couleur %s : les %d Goto ne sont pas tous reecrits" % (v, T * C))
        want = 'Set Macro %d.1 Property "Command" "Off Sequence %d Thru %d Fade %s"' % (M_OFFALL, B, SEQ_LAST, v)
        if want not in lo:
            E("fade arret %s : Off All non reecrit" % v)
        for lines, hdr, name in ((lc, M_FCHDR, "FADE couleur"), (lo, M_FOHDR, "FADE arret")):
            if not any(l.startswith('Label Macro %d "%s ' % (hdr, name)) for l in lines):
                E("fade %s : en-tete %s non relabellee" % (v, name))
            acc = [l for l in lines if l.startswith("Assign Appearance %d " % APP_ACC)]
            if len(acc) != 1:
                E("fade %s : exactement un bouton surligne attendu (%s)" % (v, name))

    # ---------- pastilles C1 / C2 ----------
    for base0, slot, hdr in ((M_C1_0, P_FX1, M_C1HDR), (M_C2_0, P_FX2, M_C2HDR)):
        for ci in range(1, C + 1):
            lines = mac(base0 + ci - 1)
            if "Copy Preset 4.%d At Preset 4.%d /Overwrite /NoConfirmation /NoOops" % (B + ci - 1, slot) not in lines:
                E("pastille %d : Copy /Overwrite manquant" % (base0 + ci - 1))
            if "Assign Appearance %d At Macro %d" % (app_on(ci), base0 + ci - 1) not in lines:
                E("pastille %d : ne se remplit pas" % (base0 + ci - 1))
            if not any(l.startswith('Label Macro %d "' % hdr) for l in lines):
                E("pastille %d : en-tete non relabellee" % (base0 + ci - 1))

    # ---------- rangee FX FONDU ----------
    if mac(M_FXFHDR):
        E("l'en-tete FX FONDU doit etre inerte")
    for vi, v in enumerate(FX_FADES):
        lines = mac(M_FXF0 + vi)
        if not lines:
            E("FX FONDU %s : macro vide" % v); continue
        for gi in range(1, NFX + 1):
            for di in range(1, NDIR + 1):
                for k in (1, 2):
                    want = 'Set Sequence %d Cue %d Property "CueInFade" "%s"' % (seq_fx(gi, di), k, v)
                    if want not in lines:
                        E("FX FONDU %s : manque %s" % (v, want))
        if 'Label Macro %d "FX FONDU %ss"' % (M_FXFHDR, v) not in lines:
            E("FX FONDU %s : en-tete non relabellee" % v)
        acc = [l for l in lines if l.startswith("Assign Appearance %d " % APP_ACC)]
        if len(acc) != 1:
            E("FX FONDU %s : exactement un bouton surligne attendu" % v)
    if not any(l.startswith("Assign Appearance %d At Macro %d" % (APP_ACC, M_FXF0)) for l in mac(M_FXF0)):
        E("FX FONDU : le bouton par defaut (0) n'est pas surligne par lui-meme")

    # ---------- labels de macros uniques ----------
    labels = re.findall(r'^Label Macro (\d+) "(.*)"$', "\n".join(cmds), re.M)
    by_name = {}
    for no, name in labels:
        by_name.setdefault(name, set()).add(no)
    dups = {k: v for k, v in by_name.items() if len(v) > 1}
    if dups:
        E("labels de macros dupliques (MA3 suffixerait #2) : %s" % dups)

    # ---------- images ----------
    pngs = sorted(f for f in os.listdir(IMGDIR) if f.endswith(".png"))
    if len(pngs) != 2 * C + 4:
        E("PNG ecrits : %d != %d" % (len(pngs), 2 * C + 4))
    for f in pngs:
        try:
            w, h, px = png_decode(os.path.join(IMGDIR, f))
        except AssertionError as ex:
            E("PNG %s invalide : %s" % (f, ex)); continue
        if (w, h) != (96, 96):
            E("PNG %s : taille %dx%d" % (f, w, h))
        centre, corner, edge = px[48][48], px[0][0], px[48][3]
        if corner[3] != 0:
            E("PNG %s : le coin arrondi n'est pas transparent" % f)
        if edge[3] != 255:
            E("PNG %s : le contour n'est pas opaque" % f)
        if f.startswith("cp_fill") and centre[3] != 255:
            E("PNG %s : tuile pleine au centre transparent" % f)
        if f.startswith("cp_neon") and centre[3] != 26:
            E("PNG %s : contour au centre = %d (attendu 26)" % (f, centre[3]))
    for ci in range(1, C + 1):
        if "Assign Image 3.%d At Appearance %d" % (IMG_OUT0 + ci - 1, app_off(ci)) not in cmds:
            E("couleur %d : appearance repos sans contour" % ci)
        if "Assign Image 3.%d At Appearance %d" % (IMG_FILL0 + ci - 1, app_on(ci)) not in cmds:
            E("couleur %d : appearance active sans pave plein" % ci)
    for img, app in ((IMG_GREY, APP_GREY), (IMG_ACC, APP_ACC), (IMG_FXO, APP_FX), (IMG_FXF, APP_FXON)):
        if "Assign Image 3.%d At Appearance %d" % (img, app) not in cmds:
            E("appearance utilitaire %d sans image %d" % (app, img))
    if count(r'^Set Appearance \d+ Property "BackAlpha" "0"$') != 2 * C + 4:
        E("le fond ne passe en alpha 0 que si l'image est en place")

    # ---------- layout ----------
    expected = 1 + T * (1 + C) + NFX * NDIR + 1 + 2 * (1 + NV) + 2 * (1 + C) + (1 + NFV)
    if len(elems) != expected:
        E("cases du layout : %d != %d" % (len(elems), expected))
    pos = set()
    for i, e in enumerate(elems, 1):
        if e.posx < 0 or e.posy < 0:
            E("case %d en coordonnees negatives" % i)
        key = (e.posx, e.posy)
        if key in pos:
            E("case %d superposee a une autre (%s)" % (i, key))
        pos.add(key)
    macro_elems = [e for e in elems if getattr(e, "__set_Action", None) == "Go+"]
    if len(macro_elems) != expected - NFX:          # tout sauf les en-tetes de groupe
        E("Action=Go+ pose sur %d cases, attendu %d" % (len(macro_elems), expected - NFX))
    inert = [e for e in elems if getattr(e, "__set_Action", None) == "None"]
    if len(inert) != NFX:
        E("en-tetes de groupe inertes : %d != %d" % (len(inert), NFX))
    if any(getattr(e, "__set_VisibilityElement", None) == "Hidden" for e in elems):
        E("une case a ete cachee (VisibilityElement)")
    texts = [getattr(e, "__set_CustomTextText", None) for e in elems]
    if sorted(t for t in texts if t) != sorted(DIR_LABELS * NFX):
        E("textes des tuiles FX : %s" % sorted(t for t in texts if t))
    for e in elems:
        if getattr(e, "__set_VisibilityObjectName", None) == "Hidden":
            if getattr(e, "__set_VisibilityIcon", None) != "Hidden":
                E("tuile nettoyee mais icone visible")

    return errors


def main():
    cmds, macs, elems = run_default()
    errors = check(cmds, macs, elems)
    total_lines = sum(len(v) for v in macs.values())
    print("commandes : %d | macros : %d | lignes de macro : %d | cases : %d | sequences : %d"
          % (len(cmds), len(macs), total_lines, len(elems), T * C + NFX * NDIR))
    if errors:
        print("\nFAILURES:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
