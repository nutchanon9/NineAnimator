/*
 * Built-in starting animations (all authored for R15; NineCore.convertRig
 * turns them into R6 on demand). Walk and run are generated from sine
 * waves so they loop smoothly; the rest are hand-keyed.
 *
 * Angle cheat-sheet (same as docs/FORMAT.md):
 *   arms/legs  x+ swing forward      z+ toward the character's right
 *   elbow      x+ bends              knee  x- bends
 *   torso/head x+ lean back/look up  y+ turn left   z+ tilt left
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NinePresets = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const r = (v) => Math.round(v * 100) / 100;
  const kf = (time, poses, easing, direction) => ({
    time, easing: easing || 'Cubic', direction: direction || 'InOut', poses,
  });
  const anim = (name, priority, loop, length, keyframes, markers) => ({
    format: 'nineanimator/1', name, rig: 'R15', loop, priority, length, keyframes, markers: markers || [],
  });

  /** Sample a cyclic gait function at `steps` points over one cycle. */
  function cycle(name, priority, length, steps, fn) {
    const keys = [];
    for (let i = 0; i <= steps; i++) {
      const phase = (i % steps) / steps * Math.PI * 2;
      keys.push(kf(r(length * i / steps), fn(phase), 'Linear'));
    }
    return anim(name, priority, true, length, keys);
  }
  const rot = (x, y, z) => ({ rot: [r(x), r(y || 0), r(z || 0)] });
  const pos = (x, y, z, p) => ({ rot: [r(x), r(y || 0), r(z || 0)], pos: p.map(r) });
  const pos0 = (v) => (v > 0 ? v : 0);

  function gait(o) {
    return (ph) => {
      const s = Math.sin(ph), c = Math.cos(ph);
      const rHip = o.hip * s + o.hipBias, lHip = -o.hip * s + o.hipBias;
      const rKnee = -(o.kneeBase + o.knee * pos0(c));
      const lKnee = -(o.kneeBase + o.knee * pos0(-c));
      return {
        LowerTorso: pos(o.lean, o.twist * s, 0, [0, o.bounce * Math.abs(c) - o.bounce * 0.6, 0]),
        UpperTorso: rot(o.chest, -o.twist * 1.6 * s, 0),
        Head: rot(-o.lean - o.chest, o.twist * 0.6 * s, 0),
        RightUpperLeg: rot(rHip, 0, 0),
        RightLowerLeg: rot(rKnee, 0, 0),
        RightFoot: rot(-0.45 * (rHip + rKnee), 0, 0),
        LeftUpperLeg: rot(lHip, 0, 0),
        LeftLowerLeg: rot(lKnee, 0, 0),
        LeftFoot: rot(-0.45 * (lHip + lKnee), 0, 0),
        RightUpperArm: rot(-o.arm * s, 0, o.armOut),
        RightLowerArm: rot(o.elbow + o.elbowSwing * pos0(-s), 0, 0),
        LeftUpperArm: rot(o.arm * s, 0, -o.armOut),
        LeftLowerArm: rot(o.elbow + o.elbowSwing * pos0(s), 0, 0),
      };
    };
  }

  const GUARD = {
    RightUpperArm: rot(55, 0, -12), RightLowerArm: rot(105), RightHand: rot(0),
    LeftUpperArm: rot(60, 0, 12), LeftLowerArm: rot(110), LeftHand: rot(0),
    UpperTorso: rot(-5), Head: rot(4),
  };
  const merge = (...ps) => Object.assign({}, ...ps.map((p) => JSON.parse(JSON.stringify(p))));
  const crouch = (hip, knee, drop) => ({
    LowerTorso: pos(0, 0, 0, [0, -drop, 0]),
    RightUpperLeg: rot(hip, 0, 6), RightLowerLeg: rot(knee), RightFoot: rot(-(hip + knee)),
    LeftUpperLeg: rot(hip, 0, -6), LeftLowerLeg: rot(knee), LeftFoot: rot(-(hip + knee)),
  });

  const SWORD_READY = {
    UpperTorso: rot(0), Head: rot(0),
    RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40),
    LeftUpperArm: rot(10, 0, -8), LeftLowerArm: rot(20),
  };
  const KICK_REST = {
    LowerTorso: pos(0, 0, 0, [0, 0, 0]),
    RightUpperLeg: rot(0), RightLowerLeg: rot(0), RightFoot: rot(0),
    LeftUpperLeg: rot(0), LeftLowerLeg: rot(0),
    RightUpperArm: rot(40, 0, -10), RightLowerArm: rot(100),
    LeftUpperArm: rot(50, 0, 10), LeftLowerArm: rot(100),
  };
  const KICK_CHAMBER = {
    LowerTorso: pos(6, 0, 0, [0, 0, 0]),
    RightUpperLeg: rot(75), RightLowerLeg: rot(-90), RightFoot: rot(0),
    LeftUpperLeg: rot(-6), LeftLowerLeg: rot(0),
    RightUpperArm: rot(40, 0, -10), RightLowerArm: rot(100),
    LeftUpperArm: rot(50, 0, 10), LeftLowerArm: rot(100),
  };
  const ARM_REST = { RightUpperArm: rot(0), RightLowerArm: rot(0), RightHand: rot(0), Head: rot(0) };

  const LIST = [
    {
      id: 'idle', label: 'ยืนหายใจ (Idle)',
      make: () => anim('Idle', 'Idle', true, 2.4, [
        kf(0, { LowerTorso: pos(0, 0, 0, [0, 0, 0]), UpperTorso: rot(0), Head: rot(0), RightUpperArm: rot(0, 0, 5), LeftUpperArm: rot(0, 0, -5), RightLowerArm: rot(8), LeftLowerArm: rot(8) }),
        kf(1.2, { LowerTorso: pos(0, 0, 0, [0, -0.03, 0]), UpperTorso: rot(2.5), Head: rot(-2), RightUpperArm: rot(2, 0, 7), LeftUpperArm: rot(2, 0, -7), RightLowerArm: rot(11), LeftLowerArm: rot(11) }),
        kf(2.4, { LowerTorso: pos(0, 0, 0, [0, 0, 0]), UpperTorso: rot(0), Head: rot(0), RightUpperArm: rot(0, 0, 5), LeftUpperArm: rot(0, 0, -5), RightLowerArm: rot(8), LeftLowerArm: rot(8) }),
      ]),
    },
    {
      id: 'walk', label: 'เดิน (Walk)',
      make: () => cycle('Walk', 'Movement', 1.0, 8, gait({
        hip: 28, hipBias: 0, kneeBase: 6, knee: 38, arm: 22, armOut: 4, elbow: 14, elbowSwing: 10,
        twist: 6, lean: 0, chest: 0, bounce: 0.08,
      })),
    },
    {
      id: 'run', label: 'วิ่ง (Run)',
      make: () => cycle('Run', 'Movement', 0.66, 8, gait({
        hip: 48, hipBias: 8, kneeBase: 18, knee: 75, arm: 50, armOut: 6, elbow: 80, elbowSwing: 12,
        twist: 10, lean: -10, chest: -6, bounce: 0.16,
      })),
    },
    {
      id: 'stance', label: 'ท่าตั้งการ์ด (Combat stance)',
      make: () => anim('CombatStance', 'Idle', true, 1.2, [
        kf(0, merge(GUARD, crouch(35, -65, 0.27))),
        kf(0.6, merge(GUARD, crouch(40, -74, 0.35), { UpperTorso: rot(-7), Head: rot(6) })),
        kf(1.2, merge(GUARD, crouch(35, -65, 0.27))),
      ]),
    },
    {
      id: 'punch', label: 'ต่อยหมัดขวา (Punch)',
      make: () => anim('Punch', 'Action', false, 0.55, [
        kf(0, merge(GUARD), 'Cubic', 'Out'),
        kf(0.1, merge(GUARD, { UpperTorso: rot(-5, -15), RightUpperArm: rot(45, 0, -5), RightLowerArm: rot(120) }), 'Cubic', 'Out'),
        kf(0.2, merge(GUARD, { UpperTorso: rot(-8, 25), Head: rot(3, -20), RightUpperArm: rot(90, 0, -5), RightLowerArm: rot(5), LeftUpperArm: rot(55, 0, 20), LeftLowerArm: rot(115) }), 'Linear'),
        kf(0.3, merge(GUARD, { UpperTorso: rot(-8, 22), Head: rot(3, -18), RightUpperArm: rot(85, 0, -5), RightLowerArm: rot(20), LeftUpperArm: rot(55, 0, 20), LeftLowerArm: rot(115) }), 'Cubic', 'InOut'),
        kf(0.55, merge(GUARD)),
      ], [{ time: 0.2, name: 'Hit', value: 'RightHand' }]),
    },
    {
      id: 'slash', label: 'ฟันดาบ (Sword slash)',
      make: () => anim('SwordSlash', 'Action', false, 0.75, [
        kf(0, merge(SWORD_READY), 'Cubic', 'Out'),
        kf(0.22, { UpperTorso: rot(5, -25), Head: rot(0, 20), RightUpperArm: rot(165, 0, 25), RightLowerArm: rot(35), RightHand: rot(20), LeftUpperArm: rot(40, 0, -15), LeftLowerArm: rot(60) }, 'Cubic', 'In'),
        kf(0.36, { UpperTorso: rot(-15, 30), Head: rot(5, -25), RightUpperArm: rot(30, 0, -35), RightLowerArm: rot(5), RightHand: rot(-50), LeftUpperArm: rot(-20, 0, -20), LeftLowerArm: rot(30) }, 'Cubic', 'Out'),
        kf(0.48, { UpperTorso: rot(-15, 35), Head: rot(5, -28), RightUpperArm: rot(15, 0, -40), RightLowerArm: rot(5), RightHand: rot(-50), LeftUpperArm: rot(-20, 0, -20), LeftLowerArm: rot(30) }, 'Cubic', 'InOut'),
        kf(0.75, merge(SWORD_READY)),
      ], [{ time: 0.31, name: 'Hit', value: 'Blade' }]),
    },
    {
      id: 'kick', label: 'เตะหน้า (Front kick)',
      make: () => anim('FrontKick', 'Action', false, 0.7, [
        kf(0, merge(KICK_REST), 'Cubic', 'Out'),
        kf(0.15, merge(KICK_CHAMBER), 'Cubic', 'Out'),
        kf(0.27, merge(KICK_CHAMBER, {
          LowerTorso: pos(14, 0, 0, [0, 0, 0]), RightUpperLeg: rot(85), RightLowerLeg: rot(-5), RightFoot: rot(20),
          LeftUpperLeg: rot(-14), LeftLowerLeg: rot(-5), RightUpperArm: rot(-25, 0, 10), RightLowerArm: rot(40),
        }), 'Cubic', 'InOut'),
        kf(0.42, merge(KICK_CHAMBER), 'Cubic', 'InOut'),
        kf(0.7, merge(KICK_REST)),
      ], [{ time: 0.27, name: 'Hit', value: 'RightFoot' }]),
    },
    {
      id: 'use', label: 'ใช้ไอเทม/ดื่มยา (Use item)',
      make: () => anim('UseItem', 'Action', false, 1.1, [
        kf(0, merge(ARM_REST)),
        kf(0.3, { RightUpperArm: rot(40, 0, -30), RightLowerArm: rot(125), RightHand: rot(0), Head: rot(0) }),
        kf(0.45, { RightUpperArm: rot(60, 0, -25), RightLowerArm: rot(135), RightHand: rot(0), Head: rot(20) }, 'Linear'),
        kf(0.8, { RightUpperArm: rot(60, 0, -25), RightLowerArm: rot(135), RightHand: rot(0), Head: rot(20) }),
        kf(1.1, merge(ARM_REST)),
      ], [{ time: 0.6, name: 'Use', value: '' }]),
    },
    {
      id: 'wave', label: 'โบกมือ (Wave)',
      make: () => anim('Wave', 'Action', false, 1.6, [
        kf(0, { RightUpperArm: rot(0), RightLowerArm: rot(0), Head: rot(0) }, 'Cubic', 'Out'),
        kf(0.3, { RightUpperArm: rot(0, 0, 150), RightLowerArm: rot(0, 0, 25), Head: rot(0, 0, -5) }),
        kf(0.55, { RightUpperArm: rot(0, 0, 150), RightLowerArm: rot(0, 0, -25), Head: rot(0, 0, -5) }),
        kf(0.8, { RightUpperArm: rot(0, 0, 150), RightLowerArm: rot(0, 0, 25), Head: rot(0, 0, -5) }),
        kf(1.05, { RightUpperArm: rot(0, 0, 150), RightLowerArm: rot(0, 0, -25), Head: rot(0, 0, -5) }),
        kf(1.6, { RightUpperArm: rot(0), RightLowerArm: rot(0), Head: rot(0) }),
      ]),
    },
  ];

  return { LIST, get: (id) => { const p = LIST.find((x) => x.id === id); return p ? p.make() : null; } };
});
