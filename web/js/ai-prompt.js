/*
 * Builds the prompt you paste into any chat AI (Claude, ChatGPT, Gemini...)
 * so it replies with an animation NineAnimator can import.
 * Used by the web app ("ให้ AI ช่วย") and by `node tools/nine.js prompt`.
 */
(function (root, factory) {
  const api = factory(root.NineCore || (typeof require === 'function' ? require('./nine-core.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NineAI = api;
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  const JOINT_NOTES = {
    R15: [
      'LowerTorso   root of the body (child of HumanoidRootPart). The ONLY joint that normally uses "pos" (studs): crouch = pos [0,-0.3,0].',
      'UpperTorso   chest, relative to LowerTorso.',
      'Head',
      'RightUpperArm, RightLowerArm (elbow), RightHand (wrist)',
      'LeftUpperArm,  LeftLowerArm  (elbow), LeftHand  (wrist)',
      'RightUpperLeg, RightLowerLeg (knee),  RightFoot (ankle)',
      'LeftUpperLeg,  LeftLowerLeg  (knee),  LeftFoot  (ankle)',
    ],
    R6: [
      'Torso        root of the body (child of HumanoidRootPart). The ONLY joint that normally uses "pos" (studs).',
      'Head',
      '"Right Arm", "Left Arm"   (whole arm, no elbow on R6)',
      '"Right Leg", "Left Leg"   (whole leg, no knee on R6)',
    ],
  };

  const EXAMPLE = {
    format: 'nineanimator/1',
    name: 'QuickJab',
    rig: 'R15',
    loop: false,
    priority: 'Action',
    length: 0.4,
    keyframes: [
      { time: 0, easing: 'Cubic', direction: 'Out', poses: { RightUpperArm: { rot: [50, 0, -10] }, RightLowerArm: { rot: [110, 0, 0] }, UpperTorso: { rot: [0, 0, 0] } } },
      { time: 0.12, easing: 'Cubic', direction: 'InOut', poses: { RightUpperArm: { rot: [90, 0, -5] }, RightLowerArm: { rot: [5, 0, 0] }, UpperTorso: { rot: [-5, 20, 0] } } },
      { time: 0.4, poses: { RightUpperArm: { rot: [50, 0, -10] }, RightLowerArm: { rot: [110, 0, 0] }, UpperTorso: { rot: [0, 0, 0] } } },
    ],
    markers: [{ time: 0.12, name: 'Hit', value: 'RightHand' }],
  };

  function buildPrompt(rigId, description, current) {
    rigId = rigId === 'R6' ? 'R6' : 'R15';
    const ex = rigId === 'R6' && C ? C.convertRig(EXAMPLE, 'R6') : EXAMPLE;
    const lines = [
      'You are a Roblox character animator. Create an animation in the "nineanimator/1" JSON format described below.',
      '',
      '## What I want',
      (description && description.trim()) || '(describe the move here)',
      '',
      `## Rig: ${rigId}`,
      'Joint names (use exactly these keys inside "poses"):',
      ...JOINT_NOTES[rigId].map((s) => '- ' + s),
      '',
      '## Format',
      '- "rot": [x, y, z] in DEGREES, applied like CFrame.Angles(x, y, z), relative to the parent part at the joint. [0,0,0] = default standing pose (arms and legs hang straight down).',
      '- "pos": [x, y, z] offset in studs (optional, root joint only in most cases).',
      '- "time" is in seconds. Each keyframe only needs the joints that change; a joint that is missing from a keyframe interpolates between its neighbouring keys.',
      '- "easing" (per keyframe, controls the motion FROM this key to the next): Linear | Constant | Cubic | Elastic | Bounce. "direction": In | Out | InOut.',
      '- "priority": Idle | Movement | Action | Action2 | Action3 | Action4. Walk/run = Movement, attacks/items/emotes = Action.',
      '- "loop": true for idle/walk/run/stances. For loops, make the last keyframe identical to the first.',
      '- "markers": [{ "time", "name", "value" }] fire AnimationTrack:GetMarkerReachedSignal(name) in Roblox. Put a "Hit" marker on the impact frame of attacks.',
      '',
      '## Angle directions (same on R6 and R15)',
      '- Arms and legs:  x+ = swing forward/up,  x- = swing backward.  z+ = toward the character\'s RIGHT side (right limb out, left limb in), z- = toward the LEFT.  y = twist along the limb.',
      '- Elbow (LowerArm): x+ bends the elbow (0 straight, ~140 fully bent). Knee (LowerLeg): x- bends the knee (0 straight, about -140 fully bent).',
      '- Torso and head:  x+ = lean back / look up,  x- = lean forward / look down.  y+ = turn LEFT, y- = turn RIGHT.  z+ = tilt to the left.',
      '- Hands/feet: x+ = tilt toward the front (toes up).',
      '- Arm straight forward = RightUpperArm [90,0,0]. Arm straight up = [180,0,0]. Arm out to the side (T-pose) = RightUpperArm [0,0,90], LeftUpperArm [0,0,-90].',
      '- A held tool (sword) points forward when the arm hangs down; it rotates with the hand.',
      '',
      '## Tips for good animation',
      '- Start and end attacks/item uses in a neutral pose so they blend; anticipation (wind-up) -> fast action (Cubic In into the hit) -> follow-through -> recover (Cubic InOut).',
      '- Attacks that should work while walking: animate only the upper body (UpperTorso, Head, arms) and leave the legs out.',
      '- Keep values physically possible; when the torso leans or crouches, counter-rotate the legs/feet so the feet stay on the ground.',
      '- 4 to 12 keyframes is usually enough. Typical lengths: punch 0.4-0.6s, sword slash 0.6-0.9s, walk cycle 1.0s, run cycle 0.6-0.7s.',
      '',
      '## Example',
      '```json',
      JSON.stringify(ex),
      '```',
    ];
    if (current) {
      lines.push('', '## Current animation (modify this instead of starting over)', '```json', JSON.stringify(current), '```');
    }
    lines.push('', 'Reply with ONLY the JSON object, no explanation.');
    return lines.join('\n');
  }

  return { buildPrompt, EXAMPLE };
});
