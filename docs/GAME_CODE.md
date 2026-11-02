# เอาท่าไปใช้ในเกม (โค้ด Luau)

ตัวอย่างโค้ดสำหรับท่าที่ทำใน NineAnimator ทุกตัวอย่างต้องใช้ AnimationId ที่ได้จากปุ่ม **อัปโหลด (Publish)** ใน Plugin
ถ้าเป็นเกมของกลุ่ม (Group) ต้องอัปโหลดท่าในนามกลุ่มเดียวกับเกม ไม่อย่างนั้นท่าจะไม่เล่น

## 1. เปลี่ยนท่าพื้นฐานของตัวละคร (เดิน วิ่ง กระโดด ฯลฯ)

ท่าในหมวด **เคลื่อนที่** ของเว็บตรงกับช่องในสคริปต์ `Animate` ที่ Roblox ใส่ให้ทุกตัวละคร วิธีเปลี่ยนคือใส่ Script นี้ใน **ServerScriptService** แล้วแก้เลข ID ส่วนช่องที่ปล่อยว่างไว้จะใช้ท่าเดิมของ Roblox

```lua
-- ServerScriptService > ReplaceDefaultAnimations (Script)
local Players = game:GetService("Players")

local IDS = {
	idle     = { Animation1 = "rbxassetid://0", Animation2 = "rbxassetid://0" }, -- Idle
	walk     = { WalkAnim = "rbxassetid://0" },     -- Walk
	run      = { RunAnim = "rbxassetid://0" },      -- Run
	jump     = { JumpAnim = "rbxassetid://0" },     -- Jump
	fall     = { FallAnim = "rbxassetid://0" },     -- Fall
	climb    = { ClimbAnim = "rbxassetid://0" },    -- Climb
	swim     = { Swim = "rbxassetid://0" },         -- Swim
	sit      = { SitAnim = "rbxassetid://0" },      -- Sit
	toolnone = { ToolNoneAnim = "rbxassetid://0" }, -- ท่าถือของ เช่น Sword hold
}

local function apply(character)
	local animate = character:WaitForChild("Animate", 10)
	if not animate then
		return
	end
	for slotName, anims in pairs(IDS) do
		local slot = animate:FindFirstChild(slotName)
		if slot then
			for animName, id in pairs(anims) do
				local anim = slot:FindFirstChild(animName)
				if anim and id ~= "rbxassetid://0" then
					anim.AnimationId = id
				end
			end
		end
	end
end

Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(apply)
	if player.Character then
		apply(player.Character)
	end
end)
```

> ท่าเดิน (Walk) กับท่าวิ่ง (Run) ของ R15 ใช้คู่กัน ตัวละครจะผสมสองท่าตามความเร็ว ถ้าเปลี่ยนแค่ท่าเดียวจะดูไม่เข้ากัน

## 2. อาวุธ (Tool): ถือ ฟัน และตีโดน

ใส่ LocalScript ไว้ใน Tool (ต้องมีชิ้นส่วนชื่อ `Handle`) สคริปต์นี้จะเล่นท่าถือดาบตอนหยิบขึ้นมา เล่นคอมโบตอนคลิก และส่งสัญญาณไป server ตรงจังหวะ marker `Hit`

```lua
-- Tool > SwordClient (LocalScript)
local tool = script.Parent
local player = game:GetService("Players").LocalPlayer
local hitEvent = tool:WaitForChild("Hit") -- RemoteEvent ใน Tool

local HOLD_ID = "rbxassetid://0"   -- Sword hold (Loop, Action)
local ATTACK_ID = "rbxassetid://0" -- Sword combo หรือ Sword slash

local holdTrack, attackTrack, wired

local function load(id)
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	local animator = humanoid and humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		return nil
	end
	local anim = Instance.new("Animation")
	anim.AnimationId = id
	return animator:LoadAnimation(anim)
end

tool.Equipped:Connect(function()
	holdTrack = holdTrack or load(HOLD_ID)
	attackTrack = attackTrack or load(ATTACK_ID)
	if holdTrack then
		holdTrack:Play(0.15)
	end
	if attackTrack and not wired then
		wired = true
		-- marker "Hit" ที่ใส่ไว้ในเว็บ ค่า (value) คือจังหวะที่ 1, 2, 3 ของคอมโบ
		attackTrack:GetMarkerReachedSignal("Hit"):Connect(function(value)
			hitEvent:FireServer(value)
		end)
	end
end)

tool.Unequipped:Connect(function()
	if holdTrack then holdTrack:Stop(0.15) end
	if attackTrack then attackTrack:Stop(0.1) end
end)

tool.Activated:Connect(function()
	if attackTrack and not attackTrack.IsPlaying then
		attackTrack:Play(0.05)
	end
end)
```

ฝั่ง server ทำดาเมจ โดยหาศัตรูที่อยู่หน้าผู้เล่นในระยะดาบ และ **ตรวจระยะที่ server เสมอ** อย่าเชื่อข้อมูลจาก client

```lua
-- Tool > SwordServer (Script)
local tool = script.Parent
local hitEvent = Instance.new("RemoteEvent")
hitEvent.Name = "Hit"
hitEvent.Parent = tool

local RANGE, DAMAGE, COOLDOWN = 7, 15, 0.15
local lastHit = {}

hitEvent.OnServerEvent:Connect(function(player, value)
	local character = player.Character
	if not character or tool.Parent ~= character then
		return
	end
	local now = os.clock()
	if lastHit[player] and now - lastHit[player] < COOLDOWN then
		return
	end
	lastHit[player] = now

	local root = character:FindFirstChild("HumanoidRootPart")
	if not root then
		return
	end
	local hitPoint = root.Position + root.CFrame.LookVector * (RANGE / 2)
	local params = OverlapParams.new()
	params.FilterDescendantsInstances = { character }
	params.FilterType = Enum.RaycastFilterType.Exclude

	local damaged = {}
	for _, part in ipairs(workspace:GetPartBoundsInRadius(hitPoint, RANGE / 2, params)) do
		local humanoid = part.Parent and part.Parent:FindFirstChildOfClass("Humanoid")
		if humanoid and not damaged[humanoid] and humanoid.Health > 0 then
			damaged[humanoid] = true
			humanoid:TakeDamage(value == "3" and DAMAGE * 2 or DAMAGE) -- จังหวะที่ 3 แรงกว่า
		end
	end
end)
```

## 3. ท่าโดนตีและท่าตาย

```lua
-- Script ใน NPC (หรือตัวละครที่ต้องการ)
local humanoid = script.Parent:WaitForChild("Humanoid")
local animator = humanoid:WaitForChild("Animator")

local function track(id)
	local a = Instance.new("Animation")
	a.AnimationId = id
	return animator:LoadAnimation(a)
end
local hitTrack = track("rbxassetid://0")   -- Hit reaction (Action2)
local deathTrack = track("rbxassetid://0") -- Death (Action4)

local lastHealth = humanoid.Health
humanoid.HealthChanged:Connect(function(health)
	if health < lastHealth and health > 0 then
		hitTrack:Play(0.05)
	end
	lastHealth = health
end)

humanoid.BreakJointsOnDeath = false -- ไม่ให้ตัวแตกเป็นชิ้น จะได้เห็นท่าตาย
humanoid.Died:Connect(function()
	deathTrack:Play(0.1)
	-- ค้างท่าสุดท้ายไว้ ไม่ให้เด้งกลับมายืน
	task.wait(math.max(deathTrack.Length - 0.05, 0))
	deathTrack:AdjustSpeed(0)
end)
```

## 4. ให้อาวุธขยับแยกจากมือได้ (ข้อต่อ Handle / LeftHandle)

ท่าที่มีคีย์ของข้อต่ออาวุธ เช่น "ควงดาบ" หรือท่าของชุดอาวุธ (ดาบคู่ ดาบโล่ ธนู) ต้องให้ Tool ยึดกับมือด้วย **Motor6D** แทน Weld ปกติ (`RightGrip`) ไม่อย่างนั้นอาวุธจะนิ่งอยู่ในมือ

- **มือขวา:** Part ชื่อ `Handle` (Part หลักของ Tool อยู่แล้ว)
- **มือซ้าย (ถ้ามี):** Part ชื่อ `LeftHandle` ใน Tool เช่น ดาบเล่มที่สอง โล่ หรือคันธนู ห้าม Weld กับ `Handle` เพราะ Motor6D จะเป็นตัวยึดกับมือซ้ายเอง ถ้าต้องเลื่อนจุดจับ ให้ใส่ Attribute ชนิด CFrame ชื่อ `LeftGrip` ใน Tool (ใช้เหมือน `Tool.Grip`)

ใส่ Script นี้ไว้ใน Tool:

```lua
-- Tool > WeaponMotor (Script)  ทำงานฝั่ง server
local tool = script.Parent
local motors = {}

local function gripC0(hand, side)
	local attachment = hand:FindFirstChild(side .. "GripAttachment") -- R15
	if attachment then
		return attachment.CFrame
	end
	return CFrame.new(0, -1, 0) * CFrame.Angles(math.rad(-90), 0, 0) -- R6
end

tool.Equipped:Connect(function()
	local character = tool.Parent
	local hand = character:FindFirstChild("RightHand") or character:FindFirstChild("Right Arm")
	local grip = hand and hand:WaitForChild("RightGrip", 2)
	if not grip then
		return
	end
	-- มือขวา: Motor6D ที่ C0/C1 เหมือน RightGrip ทุกอย่าง ตอนไม่มีท่าเล่น อาวุธจึงอยู่ตำแหน่งเดิม
	local right = Instance.new("Motor6D")
	right.Name = "HandleMotor"
	right.Part0 = grip.Part0
	right.Part1 = grip.Part1 -- Part ชื่อ "Handle" ชื่อนี้ต้องตรงกับข้อต่อในท่า
	right.C0 = grip.C0
	right.C1 = grip.C1
	right.Parent = hand
	grip:Destroy()
	table.insert(motors, right)

	-- มือซ้าย (ถ้า Tool มี Part ชื่อ LeftHandle)
	local leftPart = tool:FindFirstChild("LeftHandle")
	local leftHand = character:FindFirstChild("LeftHand") or character:FindFirstChild("Left Arm")
	if leftPart and leftHand then
		local left = Instance.new("Motor6D")
		left.Name = "LeftHandleMotor"
		left.Part0 = leftHand
		left.Part1 = leftPart
		left.C0 = gripC0(leftHand, "Left")
		left.C1 = tool:GetAttribute("LeftGrip") or CFrame.new()
		left.Parent = leftHand
		table.insert(motors, left)
	end
end)

tool.Unequipped:Connect(function()
	for _, motor in ipairs(motors) do
		motor:Destroy()
	end
	motors = {}
end)
```

ใน Studio ถ้าจะดูท่าบนตัวละครก่อน ให้ใช้ปุ่ม **ติดอาวุธ (Motor6D)** ใน Plugin (เลือกตัวละครกับ Tool พร้อมกัน) ปุ่มนี้จะใส่ Tool เข้ามือด้วย Motor6D แบบเดียวกับสคริปต์นี้

ค่าของข้อต่อ Handle และ LeftHandle ในท่า (หมุนรอบจุดจับ ตามแกนของมือ):

| ค่า | ผล |
|---|---|
| `rot` x+ | ปลายใบกระดกขึ้น (ตอนแขนห้อย ใบชี้ไปข้างหน้า) |
| `rot` y+ | ปลายใบปัดไปทางซ้าย |
| `rot` z | หมุนรอบตัวใบ (เปลี่ยนด้านคม) |
| `pos` | เลื่อนอาวุธออกจากมือ หน่วย stud ตามแกนของมือ เช่น `[0, 0, -1]` คือเลื่อนไปข้างหน้ามือ 1 stud |

## 5. ให้ตัวละครพุ่ง ถอย หรือกระโดดไปจริง (marker `Move`)

แอนิเมชันใน Roblox ไม่ได้ขยับ HumanoidRootPart ท่าอย่างพุ่งฟัน ม้วนหลบ หรือถอยหลังฟัน ตัวละครจึงจะเด้งกลับที่เดิมตอนจบท่า ท่าพวกนี้ในเว็บจึงมี marker ชื่อ `Move` ที่บอกว่าต้องดันตัวไปทางไหน แรงแค่ไหน และนานเท่าไร เช่น `forward 45 0.2` คือพุ่งไปข้างหน้าด้วยความเร็ว 45 stud/วิ นาน 0.2 วินาที

ทิศที่ใช้ได้: `forward`, `back`, `left`, `right`, `up`

```lua
-- ModuleScript ใน ReplicatedStorage ชื่อ MoveMarker
-- ใช้: require(ReplicatedStorage.MoveMarker).attach(track, character)
local MoveMarker = {}

local DIRS = {
	forward = Vector3.new(0, 0, -1),
	back = Vector3.new(0, 0, 1),
	left = Vector3.new(-1, 0, 0),
	right = Vector3.new(1, 0, 0),
	up = Vector3.new(0, 1, 0),
}

local function push(character, dirName, speed, duration)
	local root = character:FindFirstChild("HumanoidRootPart")
	local dir = DIRS[dirName]
	if not root or not dir then
		return
	end
	local attachment = Instance.new("Attachment")
	attachment.Parent = root
	local velocity = Instance.new("LinearVelocity")
	velocity.Attachment0 = attachment
	velocity.RelativeTo = Enum.ActuatorRelativeTo.Attachment0 -- ทิศตามที่ตัวละครหันอยู่
	velocity.MaxForce = math.huge
	if dirName == "up" then
		velocity.VectorVelocity = dir * speed
	else
		-- ไม่ล็อกแกน Y ให้แรงโน้มถ่วงยังทำงาน
		velocity.VelocityConstraintMode = Enum.VelocityConstraintMode.Plane
		velocity.PrimaryTangentAxis = Vector3.new(1, 0, 0)
		velocity.SecondaryTangentAxis = Vector3.new(0, 0, 1)
		velocity.PlaneVelocity = Vector2.new(dir.X * speed, dir.Z * speed)
	end
	velocity.Parent = root
	task.delay(duration, function()
		velocity:Destroy()
		attachment:Destroy()
	end)
end

function MoveMarker.attach(track, character)
	return track:GetMarkerReachedSignal("Move"):Connect(function(value)
		local dirName, speed, duration = string.match(value, "^(%a+)%s+([%d%.]+)%s+([%d%.]+)$")
		if dirName then
			push(character, dirName, tonumber(speed), tonumber(duration))
		end
	end)
end

return MoveMarker
```

ใช้ใน LocalScript ที่เล่นท่า (ตัวละครของผู้เล่นขยับจากฝั่ง client ได้เลย เพราะ client เป็นเจ้าของฟิสิกส์ของตัวละครตัวเอง):

```lua
local MoveMarker = require(game:GetService("ReplicatedStorage"):WaitForChild("MoveMarker"))
local track = animator:LoadAnimation(dashAnimation)
MoveMarker.attach(track, player.Character)
track:Play()
```

## 6. คอมโบยาว: กดต่อถึงจะไปจังหวะต่อไป (marker `Window`)

ท่าในหมวด **คอมโบยาว** แต่ละท่าเป็นแอนิเมชันยาวไฟล์เดียว เช่น คอมโบดาบยาว 6 จังหวะ ในไฟล์มี marker 2 แบบ:
- `Hit` ค่า `1`, `2`, `3`, ...: ตรงจังหวะที่ตีโดนแต่ละครั้ง
- `Window` ค่า `1`, `2`, ...: ตอนท้ายของแต่ละจังหวะ ถ้าผู้เล่นยังไม่ได้กดโจมตีครั้งต่อไปก่อนถึงจุดนี้ คอมโบจะหยุดและกลับไปยืนท่าปกติ

แบบนี้ทำคอมโบได้โดยใช้ AnimationId แค่ตัวเดียว ไม่ต้องตัดเป็นหลายไฟล์

**คอมโบปืนใหญ่และธนู:** จังหวะที่เป็นการยิงใช้ marker `Fire` (ปืนใหญ่) หรือ `Shoot` (ธนู) แทน `Hit` โดยค่าเป็นเลขจังหวะเหมือนกัน จังหวะที่ตีระยะประชิด เช่น ฟาดพานท้าย หรือฟาดด้วยคันธนู ยังใช้ `Hit` ให้ฟัง `Fire` หรือ `Shoot` เพิ่มเพื่อสร้างกระสุนหรือลูกธนู:

```lua
track:GetMarkerReachedSignal("Fire"):Connect(function(step)
	fireEvent:FireServer(step, mouse.Hit.Position) -- server สร้างกระสุน (จังหวะ 5 = นัดใหญ่)
end)
```

```lua
-- LocalScript ใน Tool (ใช้ร่วมกับ RemoteEvent "Hit" แบบข้อ 2 และ MoveMarker ข้อ 5)
local tool = script.Parent
local player = game:GetService("Players").LocalPlayer
local hitEvent = tool:WaitForChild("Hit")
local COMBO_ID = "rbxassetid://0" -- เช่น คอมโบดาบยาว 6 จังหวะ

local track, queued

local function setup()
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	local animator = humanoid and humanoid:FindFirstChildOfClass("Animator")
	if not animator then
		return
	end
	local anim = Instance.new("Animation")
	anim.AnimationId = COMBO_ID
	track = animator:LoadAnimation(anim)

	track:GetMarkerReachedSignal("Hit"):Connect(function(step)
		hitEvent:FireServer(step) -- step = "1", "2", ... ใช้ทำดาเมจต่างกันแต่ละจังหวะได้
	end)
	track:GetMarkerReachedSignal("Window"):Connect(function()
		if queued then
			queued = false -- กดไว้แล้ว: เล่นจังหวะต่อไปเลย
		else
			track:Stop(0.25) -- ไม่ได้กด: จบคอมโบ
		end
	end)
end

tool.Equipped:Connect(function()
	if not track then
		setup()
	end
end)

tool.Activated:Connect(function()
	if not track then
		return
	end
	if track.IsPlaying then
		queued = true -- จำไว้ว่ากดแล้ว จะไปต่อเมื่อถึง Window
	else
		queued = false
		track:Play(0.05)
	end
end)

tool.Unequipped:Connect(function()
	if track then
		track:Stop(0.1)
	end
end)
```

## 7. สกิลพิเศษ (อัลติเมต): ใช้ marker คุมเอฟเฟกต์

ท่าในหมวด **สกิลพิเศษ** มี marker สำหรับเอฟเฟกต์และดาเมจ:

| Marker | ค่า | ใช้ทำอะไร |
|---|---|---|
| `Charge` | `start` / `full` | เริ่มออร่า, เสียงชาร์จเต็ม |
| `Hit` | `1`, `2`, ... หรือ `Finish` / `Quake` / `Barrier` / `Rush` | ดาเมจแต่ละจังหวะ (`Finish` = ท่าปิด แรงสุด) |
| `Land` | - | ลงพื้น: กล้องสั่น, ฝุ่น |
| `Move` | `<ทิศ> <ความเร็ว> <วินาที>` | พุ่ง/กระโดด (ใช้สคริปต์ข้อ 5) |
| `Fire` | `beam-start` / `beam-end` / `blast` | ปืนใหญ่: ทำดาเมจต่อเนื่องระหว่าง start ถึง end แล้วระเบิดนัดสุดท้าย |
| `Shoot` | `Up` / `Finish` | ธนู: ยิงขึ้นฟ้า และนัดสุดท้าย |
| `Rain` | - | ธนู: จังหวะที่ฝนธนูตกลงมา |
| `Sheathe` | - | ดาบยาว: เก็บดาบ (เล่นเสียง/เอฟเฟกต์ตอนดาบเข้าฝัก) |

```lua
-- ตัวอย่าง: ใส่กล้องสั่นตอนลงพื้น และดาเมจต่อเนื่องของลำแสงปืนใหญ่
local camera = workspace.CurrentCamera
skillTrack:GetMarkerReachedSignal("Land"):Connect(function()
	for i = 1, 6 do
		camera.CFrame = camera.CFrame * CFrame.new(math.random(-10, 10) / 50, math.random(-10, 10) / 50, 0)
		task.wait(0.02)
	end
end)

local beaming = false
skillTrack:GetMarkerReachedSignal("Fire"):Connect(function(value)
	if value == "beam-start" then
		beaming = true
		while beaming do
			beamEvent:FireServer() -- server ทำดาเมจทุก 0.1 วิ ระหว่างยิงลำแสง
			task.wait(0.1)
		end
	elseif value == "beam-end" then
		beaming = false
	elseif value == "blast" then
		blastEvent:FireServer()
	end
end)
```

## 8. บอส: เตือนก่อนโจมตี (marker `Warn`)

ท่าในหมวด **บอส / มอนสเตอร์** ทุกท่าโจมตีเริ่มด้วย marker `Warn` (ค่าคือชื่อท่า เช่น `Slam`, `Swipe`, `Rush`, `Stomp`, `Spin`, `Grab`) ประมาณ 0.5 วินาทีก่อน `Hit` เพื่อให้ผู้เล่นมีเวลาหลบ ส่วน marker อื่น เช่น `Roar`, `Phase`, `Break`, `Summon`, `Throw` ใช้เล่นเอฟเฟกต์หรือเริ่มเหตุการณ์ในเกม

```lua
-- Script ใน Model ของบอส (ฝั่ง server): สุ่มท่าโจมตี + วงเตือนสีแดงบนพื้น
local boss = script.Parent
local humanoid = boss:WaitForChild("Humanoid")
local root = boss:WaitForChild("HumanoidRootPart")
local animator = humanoid:WaitForChild("Animator")

local ATTACKS = { -- ใส่ AnimationId ที่อัปโหลดแล้ว และรัศมีวงเตือน (stud)
	{ id = "rbxassetid://0", radius = 14 }, -- BossDoubleSlam
	{ id = "rbxassetid://0", radius = 10 }, -- BossSwipe
	{ id = "rbxassetid://0", radius = 18 }, -- BossJumpStomp
}

local function warnCircle(radius, seconds)
	local disc = Instance.new("Part")
	disc.Shape = Enum.PartType.Cylinder
	disc.Size = Vector3.new(0.2, radius * 2, radius * 2)
	disc.CFrame = CFrame.new(root.Position - Vector3.new(0, 2.9, 0)) * CFrame.Angles(0, 0, math.rad(90))
	disc.Anchored = true
	disc.CanCollide = false
	disc.Material = Enum.Material.Neon
	disc.Color = Color3.fromRGB(220, 40, 40)
	disc.Transparency = 0.6
	disc.Parent = workspace
	task.delay(seconds, function()
		disc:Destroy()
	end)
end

local function hurtAround(radius, damage)
	for _, player in ipairs(game:GetService("Players"):GetPlayers()) do
		local character = player.Character
		local hrp = character and character:FindFirstChild("HumanoidRootPart")
		local hum = character and character:FindFirstChildOfClass("Humanoid")
		if hrp and hum and (hrp.Position - root.Position).Magnitude <= radius then
			hum:TakeDamage(damage)
		end
	end
end

local tracks = {}
for i, attack in ipairs(ATTACKS) do
	local anim = Instance.new("Animation")
	anim.AnimationId = attack.id
	local track = animator:LoadAnimation(anim)
	track:GetMarkerReachedSignal("Warn"):Connect(function()
		warnCircle(attack.radius, 0.9)
	end)
	track:GetMarkerReachedSignal("Hit"):Connect(function()
		hurtAround(attack.radius, 30)
	end)
	tracks[i] = track
end

while humanoid.Health > 0 do
	task.wait(math.random(20, 35) / 10)
	local track = tracks[math.random(1, #tracks)]
	track:Play(0.1)
	track.Stopped:Wait()
end
```

บอสส่วนใหญ่มักเป็นตัว R15 ที่ขยายขนาดให้ใหญ่ขึ้น แอนิเมชันใช้กับตัวที่ขยายแล้วได้เลย เพราะการหมุนข้อต่อยังเหมือนเดิม แต่ระยะเลื่อนตัว เช่น การย่อตัวหรือกระโดด จะไม่ขยายตามขนาดตัว ถ้าบอสใหญ่มาก ให้เพิ่มความเร็วในค่า `Move` แทน

## Priority ใช้ตัวไหน

| ท่า | Priority | เหตุผล |
|---|---|---|
| ยืน, ตั้งการ์ด | Idle | ถูกทุกท่าอื่นทับได้ |
| เดิน วิ่ง กระโดด ตก ปีน ว่าย นั่ง | Movement | ทับท่ายืน |
| ตี ใช้ของ ถือดาบ ยิงธนู ร่ายเวท | Action | ทับท่าเดิน (ถ้าท่าตีขยับแค่ช่วงบน ขาจะยังเดินต่อได้) |
| โดนตี | Action2 | ขัดจังหวะท่าตีได้ |
| ตาย | Action4 | ทับทุกอย่าง |
