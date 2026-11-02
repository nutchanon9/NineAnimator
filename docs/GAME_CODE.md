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

## Priority ใช้ตัวไหน

| ท่า | Priority | เหตุผล |
|---|---|---|
| ยืน, ตั้งการ์ด | Idle | ถูกทุกท่าอื่นทับได้ |
| เดิน วิ่ง กระโดด ตก ปีน ว่าย นั่ง | Movement | ทับท่ายืน |
| ตี ใช้ของ ถือดาบ ยิงธนู ร่ายเวท | Action | ทับท่าเดิน (ถ้าท่าตีขยับแค่ช่วงบน ขาจะยังเดินต่อได้) |
| โดนตี | Action2 | ขัดจังหวะท่าตีได้ |
| ตาย | Action4 | ทับทุกอย่าง |
