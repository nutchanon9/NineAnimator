# NineAnimator Plugin สำหรับ Roblox Studio

Plugin เป็น "สะพาน" ระหว่างเว็บ NineAnimator/AI กับ Roblox Studio ใช้ทำ 4 อย่าง

1. **สร้าง (Build)**: วาง JSON แล้วสร้าง `KeyframeSequence` ไว้ที่ `ServerStorage > NineAnimator`
2. **▶ ดูบนตัว**: เล่นท่าบนตัวละครที่เลือก โดยไม่ต้องกด Play
3. **อัปโหลด (Publish)**: เปิดหน้าต่างอัปโหลดของ Roblox เสร็จแล้วจะได้ AnimationId
4. **ส่งออก JSON**: เลือก `KeyframeSequence` หรือ `Animation` ของเราเอง แล้วแปลงกลับเป็น JSON เอาไปแก้ในเว็บหรือให้ AI แก้ต่อ

## ติดตั้ง (ครั้งเดียว)

1. ดาวน์โหลดไฟล์ [`plugin/NineAnimator.plugin.lua`](../plugin/NineAnimator.plugin.lua) จาก GitHub (กดปุ่ม Download raw file)
2. เปิด Roblox Studio ไปที่แท็บ **Plugins** แล้วกด **Plugins Folder** จะมีโฟลเดอร์เด้งขึ้นมา
3. ก็อปไฟล์ `NineAnimator.plugin.lua` ไปวางในโฟลเดอร์นั้น
4. ปิดแล้วเปิด Studio ใหม่ จะเห็นปุ่ม **NineAnimator** ในแท็บ Plugins

> ถ้าแก้ไฟล์ plugin เอง ก็แค่บันทึกทับในโฟลเดอร์เดิมแล้วเปิด Studio ใหม่

## ใช้งาน

### เอาท่าจากเว็บ/AI เข้าเกม

1. ต้องมีตัวละครใน Workspace ก่อน: แท็บ **Avatar** > **Rig Builder** > เลือก Block Rig แบบ R15 หรือ R6 (ให้ตรงกับท่า)
2. คลิกตัวละครนั้นใน Explorer
3. ในเว็บกด **คัดลอก JSON** (หรือก็อปคำตอบของ AI มาทั้งก้อน มีข้อความอื่นติดมาก็ได้)
4. ใน plugin คลิกในกล่องแล้วกด Ctrl+V จากนั้นกด **สร้าง (Build)**
5. กด **▶ ดูบนตัว** เพื่อดูท่า ดูเสร็จแล้วกด **■ หยุด** ตัวละครจะกลับไปยืนตรง
6. กด **อัปโหลด (Publish)** ตั้งชื่อแล้วกด Submit จะได้เลข AnimationId

### ใช้ในโค้ดเกม

```lua
-- LocalScript ใน StarterCharacterScripts
local humanoid = script.Parent:WaitForChild("Humanoid")
local animator = humanoid:WaitForChild("Animator")

local anim = Instance.new("Animation")
anim.AnimationId = "rbxassetid://ใส่เลขที่ได้ตอนอัปโหลด"
local track = animator:LoadAnimation(anim)

-- marker "Hit" ที่ใส่ไว้ในเว็บ จะยิงตรงจังหวะที่ตีโดน
track:GetMarkerReachedSignal("Hit"):Connect(function(value)
	print("ตีโดน!", value) -- ส่ง RemoteEvent ไปทำดาเมจที่ server ตรงนี้
end)

game:GetService("UserInputService").InputBegan:Connect(function(input, processed)
	if not processed and input.UserInputType == Enum.UserInputType.MouseButton1 then
		track:Play()
	end
end)
```

ถ้าท่าเป็นของกลุ่ม (Group game) ต้องอัปโหลดในนามกลุ่มเดียวกับเกม ไม่อย่างนั้นท่าจะไม่เล่นในเกม

### แก้ท่าเดิมที่มีอยู่แล้ว

- เลือก `KeyframeSequence` (เช่นที่ Animation Editor เซฟไว้ใน `ServerStorage > RBX_ANIMSAVES`) หรือ `Animation` ที่มี AnimationId ของเราเอง
- กด **ส่งออก JSON** แล้วคลิกในกล่อง กด Ctrl+A, Ctrl+C
- เอาไปวางในเว็บ (ปุ่ม **ให้ AI ช่วยคิดท่า** > ช่องที่ 3) หรือส่งให้ AI พร้อมบอกว่าอยากแก้ตรงไหน

### ท่าที่ขยับอาวุธ (ข้อต่อ Handle)

ท่าอย่าง "ควงดาบ" มีคีย์ของอาวุธเองด้วย จะดูท่าพวกนี้ใน Studio ได้ต้องติดอาวุธเข้ามือด้วย Motor6D ก่อน

1. ใส่ Tool ที่มี Part ชื่อ `Handle` ไว้ใน Workspace หรือใน StarterPack
2. ใน Explorer คลิกตัวละคร แล้วกด Ctrl ค้างไว้แล้วคลิก Tool
3. กด **ติดอาวุธ (Motor6D)** Plugin จะใส่ Tool เข้ามือขวา โดยใช้ Motor6D ชื่อ `HandleMotor` ที่ C0/C1 เหมือนตอนถือปกติ
4. กด **▶ ดูบนตัว** ได้ตามปกติ

ในเกมจริงต้องใส่สคริปต์ใน [GAME_CODE.md ข้อ 4](GAME_CODE.md) ไว้ใน Tool ด้วย ส่วน Animation Editor ของ Roblox ก็จะเห็นข้อต่อนี้และแก้ต่อได้

### ส่งให้ Animation Editor

ปุ่ม **ส่งให้ Animation Editor** คัดลอก KeyframeSequence ไปไว้ที่ `ServerStorage > RBX_ANIMSAVES > (ชื่อตัวละคร)` ซึ่งเป็นที่ที่ Animation Editor ของ Roblox เก็บงานที่เซฟไว้ เปิด Animation Editor กับตัวละครนั้นแล้วเลือกท่าจากเมนู Load เพื่อแก้ละเอียดต่อได้
(ถ้า Animation Editor เวอร์ชันของคุณไม่เห็นท่า ให้ใช้วิธี Publish แล้ว Import จาก Roblox แทน)

## เรื่องที่ควรรู้

- ท่าที่ทำให้ R15 ใช้กับตัว R6 ไม่ได้ ถ้าจะใช้กับ R6 ให้กดปุ่ม **R6** ในเว็บเพื่อแปลงก่อน
- ถ้าตัวละครมี Motor6D พิเศษ (เช่นอาวุธที่ต่อด้วย Motor6D ชื่อ `Handle`) plugin จะรู้จักชื่อชิ้นส่วนนั้นด้วย ใส่ใน JSON ได้เลย แต่เว็บยังแสดงผลชิ้นนั้นไม่ได้
- ปุ่ม **▶ ดูบนตัว** ใช้ API สำหรับดูตัวอย่างในโหมดแก้ไขของ Studio ถ้า Studio เวอร์ชันไหนไม่ยอม ให้ Publish แล้วทดสอบด้วยปุ่ม Play แทน
- รองรับเฉพาะ KeyframeSequence ยังไม่รองรับ CurveAnimation
