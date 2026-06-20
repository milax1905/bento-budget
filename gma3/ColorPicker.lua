-- =====================================================================
--  Color Picker  -  Plugin Lua pour grandMA3 v2.x
-- ---------------------------------------------------------------------
--  Construit un color picker complet et soigne dans un Layout :
--
--    [ Spots ]    -> (optionnel) les fixtures choisies, couleur LIVE.
--    [ Nuancier ] -> grille tints / pure / shades par teinte.
--    [ Gris ]     -> rampe blanc -> noir.
--    [ Boutons ]  -> (optionnel) macros utilitaires : Clear / White /
--                    Full / Highlight, posees sous le nuancier.
--
--  Presets stockes en UNIVERSEL : couleur generique, non liee a une
--  machine -> s'applique a n'importe quelle selection (RGB, RGBW, CMY).
--  Ideal pour un workflow "recipe" : tes cues = Groupe x Preset couleur.
--
--  Securite : avant d'ecrire, verifie si la plage de presets (et de
--  macros) est occupee. Si oui -> demande avant d'ecraser/regenerer.
-- =====================================================================

local function hsv2rgb(h, s, v)
    h = h % 360
    local c = v * s
    local x = c * (1 - math.abs((h / 60) % 2 - 1))
    local m = v - c
    local r, g, b = 0, 0, 0
    if     h < 60  then r, g, b = c, x, 0
    elseif h < 120 then r, g, b = x, c, 0
    elseif h < 180 then r, g, b = 0, c, x
    elseif h < 240 then r, g, b = 0, x, c
    elseif h < 300 then r, g, b = x, 0, c
    else                r, g, b = c, 0, x end
    return math.floor((r + m) * 255 + 0.5),
           math.floor((g + m) * 255 + 0.5),
           math.floor((b + m) * 255 + 0.5)
end

local NAMES = {
    [0]="Red", [30]="Orange", [60]="Yellow", [90]="Lime",
    [120]="Green", [150]="Mint", [180]="Cyan", [210]="Azure",
    [240]="Blue", [270]="Violet", [300]="Magenta", [330]="Pink",
}
local function hueName(h)
    local best, bestKey = 1e9, 0
    for key, _ in pairs(NAMES) do
        local d = math.min(math.abs(h - key), 360 - math.abs(h - key))
        if d < best then best, bestKey = d, key end
    end
    return NAMES[bestKey]
end

local function toNum(value, default, min, max)
    local n = tonumber(value) or default
    if min and n < min then n = min end
    if max and n > max then n = max end
    return math.floor(n)
end

local function parseFixtures(str)
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

local BUTTONS = {
    { name = "Clear",     r =  70, g =  70, b =  80, lines = { "ClearAll" } },
    { name = "White",     r = 255, g = 255, b = 255, lines = {
        'Attribute "ColorRGB_R" At 100',
        'Attribute "ColorRGB_G" At 100',
        'Attribute "ColorRGB_B" At 100' } },
    { name = "Full",      r = 255, g = 200, b =  40, lines = { "Full" } },
    { name = "Highlight", r = 255, g = 110, b =   0, lines = { "Highlight On" } },
}

local function buildPalette(hues, levels)
    local sw = {}
    local mid = math.floor((levels - 1) / 2)
    for c = 0, hues - 1 do
        local hue  = (c / hues) * 360
        local name = hueName(hue)
        for r = 0, levels - 1 do
            local s, v, suffix
            if r == mid then
                s, v, suffix = 1.0, 1.0, ""
            elseif r < mid then
                local t = (mid - r) / mid
                s, v   = 1 - t * 0.85, 1.0
                suffix = string.rep("+", mid - r)
            else
                local d = (r - mid) / (levels - 1 - mid)
                s, v   = 1.0, 1 - d * 0.80
                suffix = string.rep("-", r - mid)
            end
            local red, green, blue = hsv2rgb(hue, s, v)
            sw[#sw + 1] = {
                name = name .. suffix,
                r = red, g = green, b = blue, col = c, level = r,
            }
        end
    end
    return sw
end

local function buildGreys(hues)
    local g = {}
    for c = 0, hues - 1 do
        local v = 1 - (c / math.max(hues - 1, 1))
        local lvl = math.floor(v * 255 + 0.5)
        local name
        if     c == 0        then name = "White"
        elseif c == hues - 1 then name = "Black"
        else                      name = string.format("Grey %d", math.floor(v * 100)) end
        g[#g + 1] = { name = name, r = lvl, g = lvl, b = lvl, col = c }
    end
    return g
end

-- Place les elements dans le layout via l'API objet.
-- Coordonnees : X = colonne (gauche->droite), Y = ligne (haut->bas, POSITIF).
local function fillLayout(layoutNo, elements)
    local placed, failed = 0, 0
    local layout
    local ok = pcall(function() layout = ObjectList("Layout " .. layoutNo)[1] end)
    if not ok or not layout then return 0, #elements end

    for _, e in ipairs(elements) do
        local done = pcall(function()
            local ele = layout:Append()
            -- Dimensions
            pcall(function() ele:Set("SizeH", tostring(e.w or 1)) end)
            pcall(function() ele:Set("SizeV", tostring(e.h or 1)) end)
            -- Position (Y positif = vers le bas dans grandMA3)
            pcall(function() ele:Set("PosX",  tostring(e.x)) end)
            pcall(function() ele:Set("PosY",  tostring(e.y)) end)
            -- Assignation de l'objet cible : via handle d'abord, sinon string
            local assigned = false
            pcall(function()
                local target = ObjectList(e.object)[1]
                if target then ele:Assign(target); assigned = true end
            end)
            if not assigned then
                pcall(function() ele:Set("Object", e.object) end)
            end
        end)
        if done then placed = placed + 1 else failed = failed + 1 end
    end
    return placed, failed
end

local function makeMacro(no, btn)
    Cmd(string.format('Store Macro %d /NoConfirm', no))
    Cmd(string.format('Label Macro %d "%s"', no, btn.name))
    Cmd(string.format('Appearance Macro %d /R=%d /G=%d /B=%d', no, btn.r, btn.g, btn.b))
    pcall(function()
        local m = ObjectList("Macro " .. no)[1]
        for _, cmd in ipairs(btn.lines) do
            local ml = m:Append()
            ml:Set("Command", cmd)
        end
    end)
end

local function main(display_handle)
    local PT = 4

    local cfg = MessageBox({
        title    = "Color Picker",
        message  = "Genere des presets couleur UNIVERSELS + un Layout (spots, nuancier, boutons).",
        commands = {
            { value = 1, name = "Generer" },
            { value = 0, name = "Annuler" },
        },
        inputs = {
            { name = "Spots (optionnel, ex: 1 Thru 8)", value = "" },
            { name = "Teintes (colonnes)",              value = "12" },
            { name = "Niveaux par teinte",              value = "5"  },
            { name = "Preset depart (ID)",              value = "1"  },
            { name = "Layout (No)",                     value = "1"  },
            { name = "Universel (1/0)",                 value = "1"  },
            { name = "Boutons utilitaires (1/0)",       value = "1"  },
            { name = "Macro depart (ID)",               value = "1"  },
        },
    })
    if not cfg or cfg.result ~= 1 then return end

    local fixStr    = cfg.inputs["Spots (optionnel, ex: 1 Thru 8)"]
    local hues      = toNum(cfg.inputs["Teintes (colonnes)"], 12, 1, 36)
    local levels    = toNum(cfg.inputs["Niveaux par teinte"],  5, 1, 11)
    local startId   = toNum(cfg.inputs["Preset depart (ID)"],  1, 1, 100000)
    local layNo     = toNum(cfg.inputs["Layout (No)"],         1, 1, 100000)
    local universal = toNum(cfg.inputs["Universel (1/0)"],     1, 0, 1) == 1
    local utilities = toNum(cfg.inputs["Boutons utilitaires (1/0)"], 1, 0, 1) == 1
    local macStart  = toNum(cfg.inputs["Macro depart (ID)"],   1, 1, 100000)

    local swatches = buildPalette(hues, levels)
    local greys    = buildGreys(hues)
    local nPresets = #swatches + #greys
    local endId    = startId + nPresets - 1
    local macEnd   = macStart + (utilities and #BUTTONS - 1 or -1)

    -- Verification occupation des plages
    local occupied, detectOk = false, true
    for no = startId, endId do
        local used, ok = objectUsed(string.format("Preset %d.%d", PT, no))
        if not ok then detectOk = false; break end
        if used then occupied = true; break end
    end
    if utilities and detectOk and not occupied then
        for no = macStart, macEnd do
            local used, ok = objectUsed("Macro " .. no)
            if not ok then detectOk = false; break end
            if used then occupied = true; break end
        end
    end

    if occupied or not detectOk then
        local extra = utilities
            and string.format("\nMacros %d -> %d  (boutons utilitaires)", macStart, macEnd) or ""
        local confirm = MessageBox({
            title    = "Color Picker",
            message  = string.format(
                "Des objets existent peut-etre ici :\n"
             .. "Preset %d.%d -> %d.%d%s\n"
             .. "(et le Layout %d sera (re)cree).\n\n"
             .. "Tout ecraser et regenerer a neuf ?",
                PT, startId, PT, endId, extra, layNo),
            commands = {
                { value = 1, name = "Ecraser" },
                { value = 0, name = "Annuler" },
            },
        })
        if not confirm or confirm.result ~= 1 then return end
        Cmd(string.format('Delete Preset %d.%d Thru %d.%d /NoConfirm', PT, startId, PT, endId))
        Cmd(string.format('Delete Layout %d /NoConfirm', layNo))
        if utilities then
            Cmd(string.format('Delete Macro %d Thru %d /NoConfirm', macStart, macEnd))
        end
    end

    -- Selection scratch pour ecrire les couleurs
    local fixIds = parseFixtures(fixStr)
    Cmd("ClearAll")
    if fixIds then
        Cmd("Fixture " .. fixStr)
    else
        Cmd("Fixture Thru")
    end

    local selCount, hasSelApi = 0, false
    pcall(function() selCount = SelectionCount(); hasSelApi = true end)
    if hasSelApi and selCount == 0 then
        MessageBox({
            title = "Color Picker",
            message = "Aucune fixture disponible.\nPatche au moins un projecteur RGB.",
            commands = { { value = 1, name = "OK" } },
        })
        return
    end

    -- Creation des presets universels
    local uniOpt = universal and " /Universal" or ""
    local id = startId
    local function makePreset(item)
        item.no = id
        Cmd(string.format('Attribute "ColorRGB_R" At %d', math.floor(item.r / 255 * 100 + 0.5)))
        Cmd(string.format('Attribute "ColorRGB_G" At %d', math.floor(item.g / 255 * 100 + 0.5)))
        Cmd(string.format('Attribute "ColorRGB_B" At %d', math.floor(item.b / 255 * 100 + 0.5)))
        Cmd(string.format('Store Preset %d.%d /Merge /NoConfirm%s', PT, item.no, uniOpt))
        Cmd(string.format('Label Preset %d.%d "%s"', PT, item.no, item.name))
        Cmd(string.format('Appearance Preset %d.%d /R=%d /G=%d /B=%d', PT, item.no, item.r, item.g, item.b))
        id = id + 1
    end
    for _, s in ipairs(swatches) do makePreset(s) end
    for _, g in ipairs(greys)    do makePreset(g) end

    -- Creation des macros utilitaires
    local macList = {}
    if utilities then
        for i, btn in ipairs(BUTTONS) do
            local no = macStart + i - 1
            makeMacro(no, btn)
            macList[#macList + 1] = { no = no }
        end
    end

    -- Creation du layout
    Cmd(string.format('Store Layout %d /NoConfirm', layNo))
    Cmd(string.format('Label Layout %d "Color Picker"', layNo))
    Cmd(string.format('Appearance Layout %d /R=18 /G=22 /B=30', layNo))

    -- Construction des elements a placer
    -- IMPORTANT : Y positif = vers le bas dans grandMA3
    local elements = {}

    -- Spots (ligne 0, 1, ...)
    local fixRows = 0
    if fixIds then
        for i, fid in ipairs(fixIds) do
            local col = (i - 1) % hues
            local row = math.floor((i - 1) / hues)
            elements[#elements + 1] = {
                object = "Fixture " .. fid, x = col, y = row, w = 1, h = 1,
            }
        end
        fixRows = math.ceil(#fixIds / hues)
    end

    -- Nuancier (1 ligne de gap apres les spots)
    local gridTop = fixRows + (fixRows > 0 and 1 or 0)
    for _, s in ipairs(swatches) do
        elements[#elements + 1] = {
            object = string.format("Preset %d.%d", PT, s.no),
            x = s.col, y = gridTop + s.level, w = 1, h = 1,
        }
    end

    -- Rampe de gris (1 ligne de gap apres le nuancier)
    local greyRow = gridTop + levels + 1
    for _, g in ipairs(greys) do
        elements[#elements + 1] = {
            object = string.format("Preset %d.%d", PT, g.no),
            x = g.col, y = greyRow, w = 1, h = 1,
        }
    end

    -- Boutons utilitaires (1 ligne de gap apres les gris)
    if utilities and #macList > 0 then
        local btnW   = math.max(2, math.floor(hues / #macList))
        local btnRow = greyRow + 2
        for i, m in ipairs(macList) do
            elements[#elements + 1] = {
                object = "Macro " .. m.no,
                x = (i - 1) * btnW, y = btnRow, w = btnW, h = 1,
            }
        end
    end

    local placed, failed = fillLayout(layNo, elements)

    Cmd("ClearAll")

    local msg = string.format(
        "Color Picker pret !\n\n"
     .. "Presets %s : %d  (Preset %d.%d -> %d.%d)\n"
     .. "Nuancier : %d teintes x %d niveaux + gris\n"
     .. "Boutons : %d macros\n"
     .. "Layout %d : %d/%d cases placees%s",
        universal and "UNIVERSELS" or "generiques",
        nPresets, PT, startId, PT, endId,
        hues, levels, #macList,
        layNo, placed, placed + failed,
        (failed > 0) and string.format("\n(%d non placees)", failed) or "")

    MessageBox({
        title = "Color Picker",
        message = msg,
        commands = { { value = 1, name = "Super !" } },
    })
    Printf("[ColorPicker] %d presets, %d macros, layout %d : %d/%d places.",
        nPresets, #macList, layNo, placed, placed + failed)
end

return main
