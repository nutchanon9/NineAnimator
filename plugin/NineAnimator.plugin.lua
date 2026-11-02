--[[
	NineAnimator — Roblox Studio plugin
	-----------------------------------
	Bridge between the NineAnimator web editor / AI chats and Roblox Studio.

	  * Paste NineAnimator JSON -> builds a KeyframeSequence on the selected rig
	  * Preview it on the rig in edit mode
	  * Publish it to Roblox (gets you an AnimationId)
	  * Export a KeyframeSequence (or an Animation you own) back to JSON,
	    so it can be edited in the web editor or by an AI

	Install: Studio > Plugins tab > Plugins Folder, copy this file there,
	restart Studio. See docs/PLUGIN.md.

	Rotation maths matches web/js/nine-core.js:
	  Pose.CFrame = C0rot:Inverse() * (CFrame.new(pos) * CFrame.Angles(rot)) * C0rot
	so "rot" is expressed in the parent part's axes on both R6 and R15.
]]

local HttpService = game:GetService("HttpService")
local Selection = game:GetService("Selection")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")
local KeyframeSequenceProvider = game:GetService("KeyframeSequenceProvider")

local FORMAT = "nineanimator/1"
local OUTPUT_FOLDER = "NineAnimator"
-- Legacy Elastic/Bounce pose easing runs In/Out reversed compared to the
-- preview; flip them (the web exporter does the same).
local FLIP_LEGACY_DIRECTION = true

---------------------------------------------------------------------------
-- Default rig data (used when no rig is selected or a Motor6D is missing)
---------------------------------------------------------------------------
local R6_ROOT = CFrame.new(0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 1, 0)
local R6_RIGHT = CFrame.new(0, 0, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0)
local R6_LEFT = CFrame.new(0, 0, 0, 0, 0, -1, 0, 1, 0, 1, 0, 0)
-- Rotation of the right-hand tool grip (R6 RightGrip.C0, R15 RightGripAttachment).
local GRIP_ROT = CFrame.Angles(math.rad(-90), 0, 0)
local GRIP_C0 = {
	R15 = CFrame.new(0, -0.15, 0) * GRIP_ROT,
	R6 = CFrame.new(0, -1, 0) * GRIP_ROT,
}

local DEFAULT_RIGS = {
	R15 = {
		order = {
			"LowerTorso", "UpperTorso", "Head",
			"RightUpperArm", "RightLowerArm", "RightHand",
			"LeftUpperArm", "LeftLowerArm", "LeftHand",
			"RightUpperLeg", "RightLowerLeg", "RightFoot",
			"LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
			"Handle",
		},
		parent = {
			LowerTorso = "HumanoidRootPart", UpperTorso = "LowerTorso", Head = "UpperTorso",
			RightUpperArm = "UpperTorso", RightLowerArm = "RightUpperArm", RightHand = "RightLowerArm",
			LeftUpperArm = "UpperTorso", LeftLowerArm = "LeftUpperArm", LeftHand = "LeftLowerArm",
			RightUpperLeg = "LowerTorso", RightLowerLeg = "RightUpperLeg", RightFoot = "RightLowerLeg",
			LeftUpperLeg = "LowerTorso", LeftLowerLeg = "LeftUpperLeg", LeftFoot = "LeftLowerLeg",
			Handle = "RightHand",
		},
		c0rot = { Handle = GRIP_ROT },
	},
	R6 = {
		order = { "Torso", "Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg", "Handle" },
		parent = {
			Torso = "HumanoidRootPart", Head = "Torso",
			["Right Arm"] = "Torso", ["Left Arm"] = "Torso",
			["Right Leg"] = "Torso", ["Left Leg"] = "Torso",
			Handle = "Right Arm",
		},
		c0rot = {
			Torso = R6_ROOT, Head = R6_ROOT,
			["Right Arm"] = R6_RIGHT, ["Right Leg"] = R6_RIGHT,
			["Left Arm"] = R6_LEFT, ["Left Leg"] = R6_LEFT,
			Handle = GRIP_ROT,
		},
	},
}

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function rotOnly(cf)
	return cf - cf.Position
end

local function round(v, places)
	local m = 10 ^ (places or 2)
	local r = math.floor(v * m + 0.5) / m
	if r == 0 then
		r = 0 -- drop -0
	end
	return r
end

local function normName(s)
	return string.lower((string.gsub(tostring(s), "[%s_%-]", "")))
end

local function vec3(v)
	if type(v) ~= "table" then
		return 0, 0, 0
	end
	if v[1] ~= nil then
		return tonumber(v[1]) or 0, tonumber(v[2]) or 0, tonumber(v[3]) or 0
	end
	return tonumber(v.x or v.X) or 0, tonumber(v.y or v.Y) or 0, tonumber(v.z or v.Z) or 0
end

--- Find the rig the user means: a selected Model with a Humanoid or
--- AnimationController, or the Model that contains a selected part.
local function findRig()
	for _, obj in ipairs(Selection:Get()) do
		local node = obj
		while node and node ~= game do
			if node:IsA("Model") and (node:FindFirstChildOfClass("Humanoid") or node:FindFirstChildOfClass("AnimationController")) then
				return node
			end
			node = node.Parent
		end
	end
	return nil
end

local function rigTypeOf(rig)
	if rig and rig:FindFirstChild("UpperTorso") then
		return "R15"
	elseif rig and rig:FindFirstChild("Torso") then
		return "R6"
	end
	return nil
end

--- Joint info for a rig: parent part names and C0 rotations, read from the
--- rig's Motor6Ds when available, falling back to Roblox defaults.
local function jointInfo(rigType, rig)
	local def = DEFAULT_RIGS[rigType]
	local info = { parent = {}, c0rot = {}, names = {} }
	for _, name in ipairs(def.order) do
		info.parent[name] = def.parent[name]
		info.c0rot[name] = def.c0rot[name] or CFrame.new()
		table.insert(info.names, name)
	end
	if rig then
		for _, m in ipairs(rig:GetDescendants()) do
			if m:IsA("Motor6D") and m.Part0 and m.Part1 then
				local n = m.Part1.Name
				if info.parent[n] == nil then
					table.insert(info.names, n) -- extra joints, e.g. a weapon Motor6D
				end
				info.parent[n] = m.Part0.Name
				info.c0rot[n] = rotOnly(m.C0)
			end
		end
	end
	return info
end

local function canonJoint(info, raw)
	if info.parent[raw] then
		return raw
	end
	local key = normName(raw)
	for _, n in ipairs(info.names) do
		if normName(n) == key then
			return n
		end
	end
	return nil
end

--- Accept JSON straight from an AI chat: strips ``` fences, text around the
--- object, whole-line // comments and trailing commas.
local function decodeLoose(text)
	local ok, data = pcall(function()
		return HttpService:JSONDecode(text)
	end)
	if ok then
		return data
	end
	local s = text
	local a = string.find(s, "{", 1, true)
	local b
	for i = #s, 1, -1 do
		if string.sub(s, i, i) == "}" then
			b = i
			break
		end
	end
	if a and b and b > a then
		s = string.sub(s, a, b)
	end
	s = string.gsub(s, "\n%s*//[^\n]*", "\n")
	s = string.gsub(s, ",(%s*[}%]])", "%1")
	ok, data = pcall(function()
		return HttpService:JSONDecode(s)
	end)
	if ok then
		return data
	end
	return nil, "อ่าน JSON ไม่ได้ (JSON error): " .. tostring(data)
end

local STYLE = { linear = "Linear", constant = "Constant", cubic = "CubicV2", cubicv2 = "CubicV2", elastic = "Elastic", bounce = "Bounce" }
local DIRECTION = { ["in"] = "In", out = "Out", inout = "InOut" }

local function easingEnums(style, dir)
	local s = STYLE[string.lower(tostring(style or "Linear"))] or "Linear"
	local d = DIRECTION[string.lower(tostring(dir or "InOut"))] or "InOut"
	if FLIP_LEGACY_DIRECTION and (s == "Elastic" or s == "Bounce") then
		if d == "In" then
			d = "Out"
		elseif d == "Out" then
			d = "In"
		end
	end
	local okStyle, styleEnum = pcall(function()
		return Enum.PoseEasingStyle[s]
	end)
	if not okStyle then
		styleEnum = Enum.PoseEasingStyle.Cubic
	end
	return styleEnum, Enum.PoseEasingDirection[d]
end

---------------------------------------------------------------------------
-- JSON -> KeyframeSequence
---------------------------------------------------------------------------
local function buildKeyframeSequence(data, rig)
	if type(data) ~= "table" then
		return nil, "ข้อมูลต้องเป็น JSON object"
	end
	if type(data.animation) == "table" then
		data = data.animation
	end
	if type(data.keyframes) ~= "table" or #data.keyframes == 0 then
		return nil, 'ต้องมี "keyframes" อย่างน้อย 1 อัน'
	end
	local rigType = data.rig and string.upper(tostring(data.rig)) or rigTypeOf(rig) or "R15"
	if not DEFAULT_RIGS[rigType] then
		return nil, 'rig ต้องเป็น "R15" หรือ "R6"'
	end
	local actual = rigTypeOf(rig)
	local warnings = {}
	if rig and actual and actual ~= rigType then
		table.insert(warnings, "ท่านี้ทำสำหรับ " .. rigType .. " แต่ตัวที่เลือกเป็น " .. actual .. " (แปลงได้ในเว็บ: ปุ่ม R6/R15)")
	end
	local info = jointInfo(rigType, rig)

	local kfs = Instance.new("KeyframeSequence")
	kfs.Name = (type(data.name) == "string" and data.name ~= "") and data.name or "NineAnimation"
	kfs.Loop = data.loop == true
	local okPriority, priority = pcall(function()
		return Enum.AnimationPriority[tostring(data.priority or "Action")]
	end)
	kfs.Priority = okPriority and priority or Enum.AnimationPriority.Action

	local frames = {}
	local function frameAt(t)
		for _, f in ipairs(frames) do
			if math.abs(f.Time - t) < 1e-4 then
				return f
			end
		end
		local kf = Instance.new("Keyframe")
		kf.Time = t
		table.insert(frames, kf)
		return kf
	end

	local lastTime = 0
	local unknown = {}
	for i, k in ipairs(data.keyframes) do
		local t = tonumber(k.time or k.t)
		if not t or t < 0 then
			kfs:Destroy()
			return nil, "keyframes[" .. (i - 1) .. ']: "time" ต้องเป็นตัวเลข >= 0'
		end
		lastTime = math.max(lastTime, t)
		local kf = frameAt(t)
		local styleEnum, dirEnum = easingEnums(k.easing or k.easingStyle, k.direction or k.easingDirection)
		local poses = {}
		local function getPose(name)
			if poses[name] then
				return poses[name]
			end
			local pose = Instance.new("Pose")
			pose.Name = name
			pose.Weight = 0
			pose.CFrame = CFrame.new()
			pose.EasingStyle = styleEnum
			pose.EasingDirection = dirEnum
			poses[name] = pose
			local parentName = info.parent[name]
			if name == "HumanoidRootPart" or parentName == nil then
				kf:AddPose(pose)
			else
				getPose(parentName):AddSubPose(pose)
			end
			return pose
		end
		if type(k.poses) == "table" then
			for raw, p in pairs(k.poses) do
				local name = canonJoint(info, raw)
				if not name then
					unknown[raw] = true
				else
					p = type(p) == "table" and p or {}
					local rx, ry, rz = vec3(p.rot or p.rotation or p.r)
					local px, py, pz = vec3(p.pos or p.position or p.p)
					local m = CFrame.new(px, py, pz) * CFrame.Angles(math.rad(rx), math.rad(ry), math.rad(rz))
					local c0r = info.c0rot[name] or CFrame.new()
					local pose = getPose(name)
					pose.CFrame = c0r:Inverse() * m * c0r
					pose.Weight = 1
				end
			end
		end
	end
	for raw in pairs(unknown) do
		table.insert(warnings, 'ไม่มีข้อต่อ "' .. tostring(raw) .. '" ใน ' .. rigType .. " ข้ามไป")
	end

	if type(data.markers) == "table" then
		for _, m in ipairs(data.markers) do
			local t = tonumber(m.time)
			if t and m.name then
				local marker = Instance.new("KeyframeMarker")
				marker.Name = tostring(m.name)
				marker.Value = m.value and tostring(m.value) or ""
				frameAt(t):AddMarker(marker)
				lastTime = math.max(lastTime, t)
			end
		end
	end
	local length = tonumber(data.length)
	if length and length > lastTime then
		frameAt(length)
	end

	table.sort(frames, function(a, b)
		return a.Time < b.Time
	end)
	for _, kf in ipairs(frames) do
		kfs:AddKeyframe(kf)
	end
	return kfs, nil, warnings, rigType
end

---------------------------------------------------------------------------
-- KeyframeSequence -> JSON
---------------------------------------------------------------------------
local STYLE_NAME = { Linear = "Linear", Constant = "Constant", Cubic = "Cubic", CubicV2 = "Cubic", Elastic = "Elastic", Bounce = "Bounce" }

local function exportKeyframeSequence(kfs, rig)
	local rigType = "R15"
	for _, d in ipairs(kfs:GetDescendants()) do
		if d:IsA("Pose") and d.Name == "Torso" then
			rigType = "R6"
			break
		end
	end
	local info = jointInfo(rigType, rig)
	local keyframes = {}
	local markers = {}
	local length = 0
	local kfList = kfs:GetKeyframes()
	table.sort(kfList, function(a, b)
		return a.Time < b.Time
	end)
	for _, kf in ipairs(kfList) do
		length = math.max(length, kf.Time)
		local out = { time = round(kf.Time, 4), easing = "Linear", direction = "InOut", poses = {} }
		local count = 0
		for _, pose in ipairs(kf:GetDescendants()) do
			if pose:IsA("Pose") and pose.Weight > 0 and info.parent[pose.Name] and pose.Name ~= "HumanoidRootPart" then
				local c0r = info.c0rot[pose.Name] or CFrame.new()
				local m = c0r * pose.CFrame * c0r:Inverse()
				local rx, ry, rz = m:ToEulerAnglesXYZ()
				local entry = { rot = { round(math.deg(rx)), round(math.deg(ry)), round(math.deg(rz)) } }
				local p = m.Position
				if p.Magnitude > 1e-4 then
					entry.pos = { round(p.X, 4), round(p.Y, 4), round(p.Z, 4) }
				end
				out.poses[pose.Name] = entry
				count = count + 1
				local style = STYLE_NAME[pose.EasingStyle.Name] or "Linear"
				local dir = pose.EasingDirection.Name
				if FLIP_LEGACY_DIRECTION and (style == "Elastic" or style == "Bounce") then
					if dir == "In" then
						dir = "Out"
					elseif dir == "Out" then
						dir = "In"
					end
				end
				out.easing = style
				out.direction = dir
			end
		end
		for _, marker in ipairs(kf:GetMarkers()) do
			table.insert(markers, { time = round(kf.Time, 4), name = marker.Name, value = marker.Value })
		end
		if count > 0 or #keyframes == 0 then
			table.insert(keyframes, out)
		end
	end
	return {
		format = FORMAT,
		name = kfs.Name,
		rig = rigType,
		loop = kfs.Loop,
		priority = kfs.Priority.Name,
		length = round(length, 4),
		keyframes = keyframes,
		markers = markers,
	}
end

---------------------------------------------------------------------------
-- Preview in edit mode
---------------------------------------------------------------------------
local preview = { conn = nil, track = nil, rig = nil }

local function stopPreview()
	if preview.conn then
		preview.conn:Disconnect()
		preview.conn = nil
	end
	if preview.track then
		pcall(function()
			preview.track:Stop(0)
			preview.track:Destroy()
		end)
		preview.track = nil
	end
	if preview.rig then
		for _, m in ipairs(preview.rig:GetDescendants()) do
			if m:IsA("Motor6D") then
				m.Transform = CFrame.new()
			end
		end
		preview.rig = nil
	end
end

local function getAnimator(rig)
	local controller = rig:FindFirstChildOfClass("Humanoid") or rig:FindFirstChildOfClass("AnimationController")
	if not controller then
		return nil
	end
	local animator = controller:FindFirstChildOfClass("Animator")
	if not animator then
		animator = Instance.new("Animator")
		animator.Parent = controller
	end
	return animator
end

local function registerTemporary(kfs)
	local ok, id = pcall(function()
		return game:GetService("AnimationClipProvider"):RegisterAnimationClip(kfs)
	end)
	if ok and id then
		return id
	end
	ok, id = pcall(function()
		return KeyframeSequenceProvider:RegisterKeyframeSequence(kfs)
	end)
	if ok and id then
		return id
	end
	return nil
end

local function startPreview(kfs, rig)
	stopPreview()
	local animator = getAnimator(rig)
	if not animator then
		return false, "ตัวที่เลือกไม่มี Humanoid หรือ AnimationController"
	end
	local id = registerTemporary(kfs)
	if not id then
		return false, "Studio ไม่ยอมให้ลงทะเบียนแอนิเมชันชั่วคราว ลองกด Publish แล้วทดสอบด้วย Play แทน"
	end
	local anim = Instance.new("Animation")
	anim.AnimationId = id
	local ok, track = pcall(function()
		return animator:LoadAnimation(anim)
	end)
	if not ok or not track then
		return false, "LoadAnimation ไม่สำเร็จ: " .. tostring(track)
	end
	track.Looped = true
	track:Play(0)
	preview.track = track
	preview.rig = rig
	preview.conn = RunService.Heartbeat:Connect(function(dt)
		pcall(function()
			animator:StepAnimations(dt)
		end)
	end)
	return true
end

---------------------------------------------------------------------------
-- UI
---------------------------------------------------------------------------
local toolbar = plugin:CreateToolbar("NineAnimator")
local button = toolbar:CreateButton("NineAnimator", "สร้าง/ดูตัวอย่าง/ส่งออก แอนิเมชันจาก NineAnimator", "rbxasset://textures/AnimationEditor/icon_checkmark.png")
button.ClickableWhenViewportHidden = true

local widget = plugin:CreateDockWidgetPluginGui(
	"NineAnimatorWidget",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 380, 560, 300, 380)
)
widget.Title = "NineAnimator"
button.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	button:SetActive(widget.Enabled)
	if not widget.Enabled then
		stopPreview()
	end
end)

local function themeColor(c, modifier)
	return settings().Studio.Theme:GetColor(c, modifier or Enum.StudioStyleGuideModifier.Default)
end
local themed = {}
local function track(obj, prop, color, modifier)
	table.insert(themed, { obj, prop, color, modifier })
	obj[prop] = themeColor(color, modifier)
end
settings().Studio.ThemeChanged:Connect(function()
	for _, t in ipairs(themed) do
		t[1][t[2]] = themeColor(t[3], t[4])
	end
end)

local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.BorderSizePixel = 0
track(root, "BackgroundColor3", Enum.StudioStyleGuideColor.MainBackground)
root.Parent = widget

local pad = Instance.new("UIPadding")
pad.PaddingLeft = UDim.new(0, 10)
pad.PaddingRight = UDim.new(0, 10)
pad.PaddingTop = UDim.new(0, 10)
pad.PaddingBottom = UDim.new(0, 10)
pad.Parent = root

local list = Instance.new("UIListLayout")
list.Padding = UDim.new(0, 8)
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Parent = root

local order = 0
local function nextOrder()
	order = order + 1
	return order
end

local function label(text, height)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = UDim2.new(1, 0, 0, height or 18)
	l.AutomaticSize = Enum.AutomaticSize.Y
	l.TextWrapped = true
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextYAlignment = Enum.TextYAlignment.Top
	l.Font = Enum.Font.SourceSans
	l.TextSize = 15
	l.Text = text
	l.LayoutOrder = nextOrder()
	track(l, "TextColor3", Enum.StudioStyleGuideColor.MainText)
	l.Parent = root
	return l
end

local function buttonRow(defs)
	local row = Instance.new("Frame")
	row.BackgroundTransparency = 1
	row.Size = UDim2.new(1, 0, 0, 30)
	row.LayoutOrder = nextOrder()
	row.Parent = root
	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Horizontal
	layout.Padding = UDim.new(0, 6)
	layout.Parent = row
	local made = {}
	for i, def in ipairs(defs) do
		local b = Instance.new("TextButton")
		b.Size = UDim2.new(1 / #defs, -6 * (#defs - 1) / #defs, 1, 0)
		b.Text = def[1]
		b.Font = Enum.Font.SourceSansSemibold
		b.TextSize = 15
		b.AutoButtonColor = true
		b.LayoutOrder = i
		b.BorderSizePixel = 0
		if def[3] then
			track(b, "BackgroundColor3", Enum.StudioStyleGuideColor.DialogMainButton)
			track(b, "TextColor3", Enum.StudioStyleGuideColor.DialogMainButtonText)
		else
			track(b, "BackgroundColor3", Enum.StudioStyleGuideColor.Button)
			track(b, "TextColor3", Enum.StudioStyleGuideColor.ButtonText)
		end
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0, 4)
		corner.Parent = b
		b.Parent = row
		b.MouseButton1Click:Connect(def[2])
		made[i] = b
	end
	return made
end

label("1) เลือกตัวละคร (Rig) ใน Explorer   2) วาง JSON จากเว็บ NineAnimator หรือ AI   3) กด สร้าง", 36)
local rigLabel = label("ยังไม่ได้เลือกตัวละคร")
track(rigLabel, "TextColor3", Enum.StudioStyleGuideColor.DimmedText)

local scroller = Instance.new("ScrollingFrame")
scroller.Size = UDim2.new(1, 0, 0, 220)
scroller.CanvasSize = UDim2.new(0, 0, 0, 0)
scroller.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroller.ScrollBarThickness = 8
scroller.BorderSizePixel = 1
scroller.LayoutOrder = nextOrder()
track(scroller, "BackgroundColor3", Enum.StudioStyleGuideColor.InputFieldBackground)
track(scroller, "BorderColor3", Enum.StudioStyleGuideColor.InputFieldBorder)
scroller.Parent = root

local box = Instance.new("TextBox")
box.Size = UDim2.new(1, -10, 0, 220)
box.AutomaticSize = Enum.AutomaticSize.Y
box.Position = UDim2.fromOffset(4, 2)
box.BackgroundTransparency = 1
box.MultiLine = true
box.ClearTextOnFocus = false
box.TextWrapped = true
box.TextXAlignment = Enum.TextXAlignment.Left
box.TextYAlignment = Enum.TextYAlignment.Top
box.Font = Enum.Font.Code
box.TextSize = 13
box.PlaceholderText = '{ "format": "nineanimator/1", ... }  (หรือเลือก StringValue/ModuleScript ที่มี JSON แล้วกด สร้าง)'
box.Text = ""
track(box, "TextColor3", Enum.StudioStyleGuideColor.MainText)
track(box, "PlaceholderColor3", Enum.StudioStyleGuideColor.DimmedText)
box.Parent = scroller

local status = label("")

local function setStatus(text, isError)
	status.Text = text
	if isError then
		status.TextColor3 = themeColor(Enum.StudioStyleGuideColor.ErrorText)
	else
		status.TextColor3 = themeColor(Enum.StudioStyleGuideColor.MainText)
	end
end

local lastBuilt = nil

local function selectedJsonText()
	-- Prefer text in the box; otherwise a selected StringValue / script.
	if box.Text ~= "" then
		return box.Text
	end
	for _, obj in ipairs(Selection:Get()) do
		if obj:IsA("StringValue") then
			return obj.Value
		end
		if obj:IsA("LuaSourceContainer") then
			local ok, src = pcall(function()
				return obj.Source
			end)
			if ok then
				return src
			end
		end
	end
	return nil
end

local function outputFolder()
	local folder = ServerStorage:FindFirstChild(OUTPUT_FOLDER)
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = OUTPUT_FOLDER
		folder.Parent = ServerStorage
	end
	return folder
end

local function build()
	local text = selectedJsonText()
	if not text or text == "" then
		setStatus("วาง JSON ในกล่องก่อน (จากปุ่ม คัดลอก JSON ในเว็บ หรือคำตอบของ AI)", true)
		return nil
	end
	local data, err = decodeLoose(text)
	if not data then
		setStatus(err, true)
		return nil
	end
	local rig = findRig()
	local kfs, buildErr, warnings, rigType = buildKeyframeSequence(data, rig)
	if not kfs then
		setStatus(buildErr, true)
		return nil
	end
	local folder = outputFolder()
	local old = folder:FindFirstChild(kfs.Name)
	if old and old:IsA("KeyframeSequence") then
		old:Destroy()
	end
	kfs.Parent = folder
	ChangeHistoryService:SetWaypoint("NineAnimator: build " .. kfs.Name)
	lastBuilt = kfs
	local msg = "สร้าง ServerStorage." .. OUTPUT_FOLDER .. "." .. kfs.Name .. " แล้ว (" .. rigType .. ", " .. #kfs:GetKeyframes() .. " keyframes)"
	if #warnings > 0 then
		msg = msg .. "\nคำเตือน:\n• " .. table.concat(warnings, "\n• ")
	end
	setStatus(msg, false)
	return kfs, rig
end

local function currentKfs()
	for _, obj in ipairs(Selection:Get()) do
		if obj:IsA("KeyframeSequence") then
			return obj
		end
	end
	if lastBuilt and lastBuilt.Parent then
		return lastBuilt
	end
	return nil
end

buttonRow({
	{ "สร้าง (Build)", function()
		build()
	end, true },
	{ "▶ ดูบนตัว", function()
		local rig = findRig()
		if not rig then
			setStatus("เลือกตัวละคร (Model ที่มี Humanoid) ใน Explorer ก่อน", true)
			return
		end
		local kfs = currentKfs()
		if not kfs or box.Text ~= "" then
			kfs = build()
			Selection:Set({ rig })
		end
		if not kfs then
			return
		end
		local ok, err = startPreview(kfs, rig)
		if ok then
			setStatus("กำลังเล่น " .. kfs.Name .. " บน " .. rig.Name .. " (กด ■ หยุด เพื่อคืนท่า)", false)
		else
			setStatus(err, true)
		end
	end },
	{ "■ หยุด", function()
		stopPreview()
		setStatus("หยุดแล้ว คืนท่ายืนตรง", false)
	end },
})

buttonRow({
	{ "อัปโหลด (Publish)", function()
		local kfs = currentKfs()
		if not kfs then
			setStatus("กด สร้าง ก่อน หรือเลือก KeyframeSequence", true)
			return
		end
		Selection:Set({ kfs })
		local ok, err = pcall(function()
			plugin:SaveSelectedToRoblox()
		end)
		if ok then
			setStatus("เปิดหน้าต่างอัปโหลดแล้ว เสร็จแล้วจะได้ AnimationId เอาไปใส่ใน Animation.AnimationId", false)
		else
			setStatus("อัปโหลดไม่ได้: " .. tostring(err), true)
		end
	end, true },
	{ "ส่งออก JSON", function()
		local target
		for _, obj in ipairs(Selection:Get()) do
			if obj:IsA("KeyframeSequence") then
				target = obj
				break
			elseif obj:IsA("Animation") and obj.AnimationId ~= "" then
				local ok, result = pcall(function()
					return KeyframeSequenceProvider:GetKeyframeSequenceAsync(obj.AnimationId)
				end)
				if ok then
					target = result
					break
				end
				setStatus("โหลด " .. obj.AnimationId .. " ไม่ได้ (ต้องเป็นแอนิเมชันของเราเอง/กลุ่มเรา): " .. tostring(result), true)
				return
			end
		end
		if not target then
			setStatus("เลือก KeyframeSequence หรือ Animation ใน Explorer ก่อน", true)
			return
		end
		local json = HttpService:JSONEncode(exportKeyframeSequence(target, findRig()))
		box.Text = json
		setStatus("ส่งออกแล้ว: คลิกในกล่อง กด Ctrl+A แล้ว Ctrl+C ไปวางในเว็บ (ปุ่ม ให้ AI ช่วย > ช่องที่ 3) หรือให้ AI แก้ต่อ", false)
	end },
	{ "ล้างกล่อง", function()
		box.Text = ""
		setStatus("", false)
	end },
})

--- Find a Tool to rig: a selected Tool, a Tool inside the selected rig, or
--- the Tool that contains a selected part.
local function findTool(rig)
	for _, obj in ipairs(Selection:Get()) do
		local node = obj
		while node and node ~= game do
			if node:IsA("Tool") then
				return node
			end
			node = node.Parent
		end
	end
	if rig then
		return rig:FindFirstChildOfClass("Tool")
	end
	return nil
end

--- Put the Tool in the rig's right hand with a Motor6D named "HandleMotor"
--- (same C0/C1 as Roblox's RightGrip weld) so the Handle can be animated.
local function rigWeapon()
	local rig = findRig()
	if not rig then
		return false, "เลือกตัวละคร (Model ที่มี Humanoid) และ Tool ที่จะถือ"
	end
	local rigType = rigTypeOf(rig) or "R15"
	local hand = rig:FindFirstChild(rigType == "R6" and "Right Arm" or "RightHand")
	if not hand then
		return false, "ตัวละครนี้ไม่มีมือขวา (RightHand / Right Arm)"
	end
	local tool = findTool(rig)
	if not tool then
		return false, "เลือก Tool ด้วย (กด Ctrl ค้างแล้วคลิกทั้งตัวละครและ Tool ใน Explorer)"
	end
	local handle = tool:FindFirstChild("Handle")
	if not handle or not handle:IsA("BasePart") then
		return false, 'Tool "' .. tool.Name .. '" ต้องมี Part ชื่อ Handle'
	end
	if tool.Parent ~= rig then
		tool = tool:Clone()
		handle = tool:FindFirstChild("Handle")
		tool.Parent = rig
	end
	for _, d in ipairs(hand:GetChildren()) do
		if (d:IsA("Motor6D") or d:IsA("Weld")) and (d.Name == "HandleMotor" or d.Name == "RightGrip") then
			d:Destroy()
		end
	end
	local c0 = GRIP_C0[rigType]
	local attachment = hand:FindFirstChild("RightGripAttachment")
	if attachment and attachment:IsA("Attachment") then
		c0 = attachment.CFrame
	end
	local motor = Instance.new("Motor6D")
	motor.Name = "HandleMotor"
	motor.Part0 = hand
	motor.Part1 = handle
	motor.C0 = c0
	motor.C1 = tool.Grip
	motor.Parent = hand
	for _, part in ipairs(tool:GetDescendants()) do
		if part:IsA("BasePart") then
			part.Anchored = false
		end
	end
	ChangeHistoryService:SetWaypoint("NineAnimator: rig weapon")
	return true, 'ติด "' .. tool.Name .. '" เข้ามือขวาด้วย Motor6D แล้ว ใช้ข้อต่อ Handle ในท่าได้เลย (ในเกมต้องใช้สคริปต์ใน docs/GAME_CODE.md ข้อ 4)'
end

buttonRow({
	{ "ติดอาวุธ (Motor6D)", function()
		local ok, msg = rigWeapon()
		setStatus(msg, not ok)
	end },
	{ "ส่งให้ Animation Editor", function()
		local kfs = currentKfs()
		local rig = findRig()
		if not kfs or not rig then
			setStatus("ต้องมีทั้ง KeyframeSequence (กด สร้าง) และตัวละครที่เลือก", true)
			return
		end
		local saves = ServerStorage:FindFirstChild("RBX_ANIMSAVES")
		if not saves then
			saves = Instance.new("Model")
			saves.Name = "RBX_ANIMSAVES"
			saves.Parent = ServerStorage
		end
		local holder = saves:FindFirstChild(rig.Name)
		if not holder then
			holder = Instance.new("ObjectValue")
			holder.Name = rig.Name
			holder.Value = rig
			holder.Parent = saves
		end
		local old = holder:FindFirstChild(kfs.Name)
		if old then
			old:Destroy()
		end
		kfs:Clone().Parent = holder
		ChangeHistoryService:SetWaypoint("NineAnimator: send to Animation Editor")
		setStatus("คัดลอกไปที่ ServerStorage.RBX_ANIMSAVES." .. rig.Name .. " แล้ว เปิด Animation Editor กับตัวนี้ แล้วเลือกจากเมนู Load", false)
	end },
})

local function refreshRigLabel()
	local rig = findRig()
	if rig then
		rigLabel.Text = "ตัวละคร: " .. rig:GetFullName() .. " (" .. (rigTypeOf(rig) or "rig แบบกำหนดเอง") .. ")"
	else
		rigLabel.Text = "ยังไม่ได้เลือกตัวละคร (เลือก Model ที่มี Humanoid ใน Explorer)"
	end
end
Selection.SelectionChanged:Connect(refreshRigLabel)
refreshRigLabel()

plugin.Unloading:Connect(stopPreview)
