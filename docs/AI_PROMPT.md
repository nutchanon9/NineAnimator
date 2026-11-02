# AI prompt template

ข้อความนี้คือ prompt ที่ปุ่ม **ให้ AI ช่วยคิดท่า** ในเว็บสร้างให้ (ตัวอย่างนี้เป็นของ R15) ก็อปไปวางในแชท AI ได้เลย แค่แก้หัวข้อ "What I want" เป็นท่าที่อยากได้

สร้างใหม่ได้ด้วยคำสั่ง `node tools/nine.js prompt R15 "อธิบายท่า"` หรือ `node tools/nine.js prompt R6 ...`

````text
You are a Roblox character animator. Create an animation in the "nineanimator/1" JSON format described below.

## What I want
(describe the move here)

## Rig: R15
Joint names (use exactly these keys inside "poses"):
- LowerTorso   root of the body (child of HumanoidRootPart). The ONLY joint that normally uses "pos" (studs): crouch = pos [0,-0.3,0].
- UpperTorso   chest, relative to LowerTorso.
- Head
- RightUpperArm, RightLowerArm (elbow), RightHand (wrist)
- LeftUpperArm,  LeftLowerArm  (elbow), LeftHand  (wrist)
- RightUpperLeg, RightLowerLeg (knee),  RightFoot (ankle)
- LeftUpperLeg,  LeftLowerLeg  (knee),  LeftFoot  (ankle)
- Handle       optional: the held weapon (child of RightHand), see "Weapon" below.
- LeftHandle   optional: off-hand weapon part (child of LeftHand): second blade, shield or bow.

## Format
- "rot": [x, y, z] in DEGREES, applied like CFrame.Angles(x, y, z), relative to the parent part at the joint. [0,0,0] = default standing pose (arms and legs hang straight down).
- "pos": [x, y, z] offset in studs (optional, root joint only in most cases).
- "time" is in seconds. Each keyframe only needs the joints that change; a joint that is missing from a keyframe interpolates between its neighbouring keys.
- "easing" (per keyframe, controls the motion FROM this key to the next): Linear | Constant | Cubic | Elastic | Bounce. "direction": In | Out | InOut.
- "priority": Idle | Movement | Action | Action2 | Action3 | Action4. Walk/run = Movement, attacks/items/emotes = Action.
- "loop": true for idle/walk/run/stances. For loops, make the last keyframe identical to the first.
- "markers": [{ "time", "name", "value" }] fire AnimationTrack:GetMarkerReachedSignal(name) in Roblox. Put a "Hit" marker on the impact frame of attacks. For dashes, rolls, leaps and backsteps add a "Move" marker with value "<forward|back|left|right|up> <speed> <seconds>" (e.g. "forward 40 0.2"), because animations do not move the character itself. Boss/monster attacks: add a "Warn" marker (value = attack name) about 0.5 s before the "Hit" so players can react. For a multi-hit combo in one animation, number the steps ("Hit" value "1", "2", ...; use "Fire" or "Shoot" instead of "Hit" for gun or bow shots) and put a "Window" marker (value = step number) at the end of every step except the last.

## Angle directions (same on R6 and R15)
- Arms and legs:  x+ = swing forward/up,  x- = swing backward.  z+ = toward the character's RIGHT side (right limb out, left limb in), z- = toward the LEFT.  y = twist along the limb.
- Elbow (LowerArm): x+ bends the elbow (0 straight, ~140 fully bent). Knee (LowerLeg): x- bends the knee (0 straight, about -140 fully bent).
- Torso and head:  x+ = lean back / look up,  x- = lean forward / look down.  y+ = turn LEFT, y- = turn RIGHT.  z+ = tilt to the left.
- Hands/feet: x+ = tilt toward the front (toes up).
- Weapon (optional joint "Handle", child of the right hand; needs the Tool held with a Motor6D in game): [0,0,0] = normal grip, blade forward when the arm hangs. x+ tilts the blade up, y+ swings it left, z spins it around the blade, "pos" slides it in hand axes. Use it for twirls, flips and wrist flicks; leave it out otherwise. "LeftHandle" is the same for the left hand (a shield at [0,90,0] faces forward when the left forearm is held upright in front).
- Two-handed weapons (long sword, great sword, heavy gun): the right hand holds "Handle"; place the left hand next to it on the grip (both forearms angled toward the body centre).
- Arm straight forward = RightUpperArm [90,0,0]. Arm straight up = [180,0,0]. Arm out to the side (T-pose) = RightUpperArm [0,0,90], LeftUpperArm [0,0,-90].
- A held tool (sword) points forward when the arm hangs down; it rotates with the hand.

## Tips for good animation
- Start and end attacks/item uses in a neutral pose so they blend; anticipation (wind-up) -> fast action (Cubic In into the hit) -> follow-through -> recover (Cubic InOut).
- Attacks that should work while walking: animate only the upper body (UpperTorso, Head, arms) and leave the legs out.
- Keep values physically possible; when the torso leans or crouches, counter-rotate the legs/feet so the feet stay on the ground.
- Rotations interpolate the short way round: keep every joint's change between two consecutive keys under 180°. For spins, flips or rolls add a key every 90°.
- 4 to 12 keyframes is usually enough. Typical lengths: punch 0.4-0.6s, sword slash 0.6-0.9s, walk cycle 1.0s, run cycle 0.6-0.7s.

## Example
```json
{"format":"nineanimator/1","name":"QuickJab","rig":"R15","loop":false,"priority":"Action","length":0.4,"keyframes":[{"time":0,"easing":"Cubic","direction":"Out","poses":{"RightUpperArm":{"rot":[50,0,-10]},"RightLowerArm":{"rot":[110,0,0]},"UpperTorso":{"rot":[0,0,0]}}},{"time":0.12,"easing":"Cubic","direction":"InOut","poses":{"RightUpperArm":{"rot":[90,0,-5]},"RightLowerArm":{"rot":[5,0,0]},"UpperTorso":{"rot":[-5,20,0]}}},{"time":0.4,"poses":{"RightUpperArm":{"rot":[50,0,-10]},"RightLowerArm":{"rot":[110,0,0]},"UpperTorso":{"rot":[0,0,0]}}}],"markers":[{"time":0.12,"name":"Hit","value":"RightHand"}]}
```

Reply with ONLY the JSON object, no explanation.
````
