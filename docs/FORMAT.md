# NineAnimator animation format (`nineanimator/1`)

> **ภาษาไทยสั้นๆ:** ไฟล์แอนิเมชันเป็น JSON ที่คนอ่านออกและ AI เขียนได้ หมุนเป็น "องศา" เทียบกับชิ้นส่วนแม่ ค่า `[0,0,0]` = ยืนตรง
> ข้อต่อที่ไม่ได้ใส่ในคีย์เฟรมไหน จะค่อยๆ เปลี่ยนจากคีย์ก่อนหน้าไปคีย์ถัดไปเอง ส่วนที่เหลือของไฟล์นี้เขียนเป็นภาษาอังกฤษเพื่อให้ AI อ่านได้แม่น

This is the single source of truth for the JSON that the web editor, the Studio plugin, the CLI and AI assistants exchange. The reference implementation is `web/js/nine-core.js`. If this document and the code disagree, the code wins. Fix the document.

## Example

```json
{
  "format": "nineanimator/1",
  "name": "QuickJab",
  "rig": "R15",
  "loop": false,
  "priority": "Action",
  "length": 0.4,
  "keyframes": [
    { "time": 0,    "easing": "Cubic", "direction": "Out",
      "poses": { "RightUpperArm": { "rot": [50, 0, -10] }, "RightLowerArm": { "rot": [110, 0, 0] } } },
    { "time": 0.12, "easing": "Cubic", "direction": "InOut",
      "poses": { "RightUpperArm": { "rot": [90, 0, -5] },  "RightLowerArm": { "rot": [5, 0, 0] },
                 "UpperTorso": { "rot": [-5, 20, 0] } } },
    { "time": 0.4,
      "poses": { "RightUpperArm": { "rot": [50, 0, -10] }, "RightLowerArm": { "rot": [110, 0, 0] },
                 "UpperTorso": { "rot": [0, 0, 0] } } }
  ],
  "markers": [ { "time": 0.12, "name": "Hit", "value": "RightHand" } ]
}
```

## Top-level fields

| field | type | default | meaning |
|---|---|---|---|
| `format` | string | `"nineanimator/1"` | Format version. |
| `name` | string | `"Animation"` | Becomes `KeyframeSequence.Name`. |
| `rig` | `"R15"` \| `"R6"` | guessed from joint names | Which body the joint names refer to. |
| `loop` | bool | `false` | `KeyframeSequence.Loop`. |
| `priority` | `Idle` \| `Movement` \| `Action` \| `Action2` \| `Action3` \| `Action4` \| `Core` | `Action` | `AnimationPriority`. |
| `length` | seconds | last keyframe/marker time | Total length. May be longer than the last keyframe (the pose holds). |
| `keyframes` | array | required, ≥ 1 | See below. Sorted by time on load. |
| `markers` | array | `[]` | `{ "time", "name", "value" }`. Exported as `KeyframeMarker`s. In game code: `track:GetMarkerReachedSignal(name)`. |

## Keyframes

```json
{ "time": 0.25, "easing": "Cubic", "direction": "InOut", "poses": { "<Joint>": { "rot": [x, y, z], "pos": [x, y, z] } } }
```

* `time`: seconds, ≥ 0.
* `easing`: `Linear` | `Constant` | `Cubic` | `Elastic` | `Bounce`. Applies to the motion **from this keyframe to the next key of each joint** (same as Roblox Pose easing). `CubicV2` is accepted as an alias of `Cubic`.
* `direction`: `In` | `Out` | `InOut`. Ignored by Linear/Constant.
* `poses`: only the joints that have a key at this time. A joint that is missing interpolates between its previous and next keys, and a joint that never appears is not animated at all. Leaving the legs out of an attack lets it play on top of the walk animation.
* `rot`: degrees `[x, y, z]`, composed exactly like `CFrame.Angles(math.rad(x), math.rad(y), math.rad(z))`.
* `pos`: studs `[x, y, z]`, optional. Normally only used on the root joint (`LowerTorso` / `Torso`) for crouching, bobbing and lunges.

### What the numbers mean

Rotations are in the **parent part's axes, at the joint**. The parent is HumanoidRootPart for the root joint, UpperTorso for an R15 upper arm, the upper arm for the elbow, and so on. Because of this, the same numbers mean the same motion on R6 and R15, even though R6 Motor6Ds have rotated C0s. The Roblox `Pose.CFrame` written on export is:

```
Pose.CFrame = C0rot:Inverse() * (CFrame.new(pos) * CFrame.Angles(rot)) * C0rot
```

where `C0rot` is the rotation part of the joint's `Motor6D.C0`. For R15 this is the identity, so `Pose.CFrame` is just `CFrame.new(pos) * CFrame.Angles(rot)`.

Directions (Roblox axes: Y up, character faces −Z, character's right is +X):

| part | x+ | x− | y+ | z+ |
|---|---|---|---|---|
| upper arm / upper leg / whole R6 limb | swing forward/up | swing back | twist | toward the character's **right** (right limb outward, left limb inward) |
| elbow (`*LowerArm`) | bend | (hyper-extend) | twist | sideways |
| knee (`*LowerLeg`) | (wrong way) | **bend** | twist | sideways |
| hand / foot | tilt to the front (toes up) | tilt back | twist | sideways |
| torso / head | lean back / look up | lean forward / look down | turn **left** | tilt left |

**Keep each turn under 180°.** Rotations interpolate the short way round (like `CFrame:Lerp`), so if a joint turns 180° or more between two of its keys it will spin the wrong way. For a spin, flip or roll, add a key every 90° (for example `0, -90, 180, 90, 0` for one full forward roll of `LowerTorso`). The validator warns when it sees a step this large.

Handy reference poses: arm straight forward `[90,0,0]`, arm straight up `[180,0,0]`, T-pose `RightUpperArm [0,0,90]` + `LeftUpperArm [0,0,-90]`, crouch `LowerTorso pos [0,-0.3,0]` with hips `x≈35`, knees `x≈-65`, feet `x≈30`.

## Joint names

**R15** (15 joints, parent in brackets):
`LowerTorso` [HumanoidRootPart, root], `UpperTorso` [LowerTorso], `Head` [UpperTorso],
`RightUpperArm` [UpperTorso], `RightLowerArm` [RightUpperArm], `RightHand` [RightLowerArm],
`LeftUpperArm`, `LeftLowerArm`, `LeftHand` (same on the left),
`RightUpperLeg` [LowerTorso], `RightLowerLeg` [RightUpperLeg], `RightFoot` [RightLowerLeg],
`LeftUpperLeg`, `LeftLowerLeg`, `LeftFoot`.

**R6** (6 joints): `Torso` [HumanoidRootPart, root], `Head`, `Right Arm`, `Left Arm`, `Right Leg`, `Left Leg` (all children of Torso; note the spaces).

Name matching is forgiving: case, spaces, `_` and `-` are ignored (`right upper arm` → `RightUpperArm`, `RightArm` → `Right Arm`).

## Loose input

The importers (web and plugin) accept typical AI output: text around the JSON, ```` ```json ```` fences, `//` comments, trailing commas, `{x,y,z}` objects instead of arrays, `rotation`/`position` instead of `rot`/`pos`. Saved files are always written in the strict form above.

## Converting between rigs

`NineCore.convertRig(anim, "R6")` (web: R6/R15 switch, CLI: `node tools/nine.js convert`) maps:
LowerTorso + UpperTorso → Torso, UpperArm → Arm, UpperLeg → Leg, Head → Head. R6 has no elbows, knees, hands or feet, so those keys are dropped. Converting R6 → R15 maps Torso → LowerTorso and the limbs to the upper limbs.
