/*
 * Built-in starting animations (all authored for R15; NineCore.convertRig
 * turns them into R6 on demand). Walk and run are generated from sine
 * waves so they loop smoothly; the rest are hand-keyed.
 *
 * Each entry: { id, cat, label, prop, make() }. `cat` groups the preset
 * menu, `prop` is the preview prop to show (sword | bow | shield | none);
 * neither is part of the animation file.
 *
 * Angle cheat-sheet (same as docs/FORMAT.md):
 *   arms/legs  x+ swing forward      z+ toward the character's right
 *   elbow      x+ bends              knee  x- bends
 *   torso/head x+ lean back/look up  y+ turn left   z+ tilt left
 */
(function (root, factory) {
  const api = factory(root.NineCore || (typeof require === 'function' ? require('./nine-core.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NinePresets = api;
})(typeof self !== 'undefined' ? self : this, function (C) {
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
  const merge = (...ps) => Object.assign({}, ...ps.map((p) => JSON.parse(JSON.stringify(p))));

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

  /**
   * Bent legs with the feet kept flat and under the body.
   * hip/knee in degrees (knee negative), returns poses incl. the root drop.
   */
  function legs(hip, knee, opts) {
    const o = opts || {};
    const L1 = 0.822, L2 = 0.922; // hip->knee, knee->ankle (R15 block rig)
    const h = hip * Math.PI / 180, k = (hip + knee) * Math.PI / 180;
    const drop = (L1 + L2) - (L1 * Math.cos(h) + L2 * Math.cos(k));
    const fwd = L1 * Math.sin(h) + L2 * Math.sin(k);
    const spread = o.spread === undefined ? 6 : o.spread;
    return {
      LowerTorso: pos(o.lean || 0, o.twist || 0, 0, [0, -drop, fwd]),
      RightUpperLeg: rot(hip - (o.lean || 0), 0, spread), RightLowerLeg: rot(knee), RightFoot: rot(-(hip + knee)),
      LeftUpperLeg: rot(hip - (o.lean || 0), 0, -spread), LeftLowerLeg: rot(knee), LeftFoot: rot(-(hip + knee)),
    };
  }
  const STAND = legs(0, 0, { spread: 0 });

  // ---------------- shared poses ----------------
  const GUARD = {
    RightUpperArm: rot(55, 0, -12), RightLowerArm: rot(105), RightHand: rot(0),
    LeftUpperArm: rot(60, 0, 12), LeftLowerArm: rot(110), LeftHand: rot(0),
    UpperTorso: rot(-5), Head: rot(4),
  };
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
  const UPPER_REST = {
    UpperTorso: rot(0), Head: rot(0),
    RightUpperArm: rot(0), RightLowerArm: rot(0), RightHand: rot(0),
    LeftUpperArm: rot(0), LeftLowerArm: rot(0), LeftHand: rot(0),
  };
  const BODY_REST = merge(UPPER_REST, STAND);
  /** Torso turn with the head turning back so the eyes stay on the target. */
  const turn = (x, y, z) => ({ UpperTorso: rot(x, y, z || 0), Head: rot(-x * 0.5, -y * 0.8, 0) });

  /**
   * Two-handed weapon pose from where the weapon is: `base` holds the torso
   * (and anything else), `grip` is the right-hand grip point and `dir` the
   * weapon direction, both in the UpperTorso's frame (x right, y up, z back).
   * Solves the right arm, aims the weapon, then puts the left hand on `point`
   * (Handle frame). opts.gun: `dir` is the barrel (-Z of the handle) and the
   * grip stays upright.
   */
  function wield(base, grip, dir, point, opts) {
    const o = opts || {};
    const rig = C.RIGS.R15;
    const ms = {};
    for (const [n, p] of Object.entries(base)) if (rig.byName[n]) ms[n] = C.poseToM(p);
    const torso = C.computeWorld(rig, ms).UpperTorso;
    const toWorldDir = (v) => [0, 1, 2].map((i) => torso.r[i * 3] * v[0] + torso.r[i * 3 + 1] * v[1] + torso.r[i * 3 + 2] * v[2]);
    const g = toWorldDir(grip);
    const gripW = [torso.p[0] + g[0], torso.p[1] + g[1], torso.p[2] + g[2]];
    const right = o.gun
      ? C.solveWeaponIK(rig, ms, 'Right', gripW, toWorldDir(dir), { axis: [0, 0, -1], upAxis: [0, 1, 0], upWorld: toWorldDir([0, 1, 0]) })
      : C.solveWeaponIK(rig, ms, 'Right', gripW, toWorldDir(dir));
    for (const [n, p] of Object.entries(right.poses)) ms[n] = C.poseToM(p);
    const target = C.pointOn(rig, ms, 'Handle', point);
    const left = C.solveArmIK(rig, ms, 'Left', target);
    return Object.assign({}, base, right.poses, left.poses, { LeftHand: rot(0) });
  }
  const LS_GRIP = [0, -0.6, 0], GS_GRIP = [0, -0.7, 0], HG_GRIP = [0, 0.3, -0.6];
  // Two-handed holds (see wield): b = small breathing offset in degrees.
  const LS = { guard: (b) => wield(turn(-2 - b, 15), [0, -0.35 - b * 0.005, -1.0], [0, 0.57, -0.82], LS_GRIP) };
  const GS = { low: (b) => wield(turn(-6 - b, 10), [0, -0.6 - b * 0.01, -0.9], [0, -0.45, -0.89], GS_GRIP) };
  const HG = { hold: (b) => wield(turn(-5 - b, 10), [-0.1, -0.65 - b * 0.01, -0.55], [0, 0, -1], HG_GRIP, { gun: true }) };
  // Dual blades: both arms low and forward, blades forward.
  const DB_GUARD = { UpperTorso: rot(-8), Head: rot(6), RightUpperArm: rot(25, 0, 25), RightLowerArm: rot(50), RightHand: rot(-50), LeftUpperArm: rot(25, 0, -25), LeftLowerArm: rot(50), LeftHand: rot(-50) };

  // ---------------- presets ----------------
  const LIST = [
    // ===== Movement (the slots of Roblox's default Animate script) =====
    {
      id: 'idle', cat: 'move', label: 'ยืนหายใจ (Idle)', prop: 'none',
      make: () => anim('Idle', 'Idle', true, 2.4, [
        kf(0, { LowerTorso: pos(0, 0, 0, [0, 0, 0]), UpperTorso: rot(0), Head: rot(0), RightUpperArm: rot(0, 0, 5), LeftUpperArm: rot(0, 0, -5), RightLowerArm: rot(8), LeftLowerArm: rot(8) }),
        kf(1.2, { LowerTorso: pos(0, 0, 0, [0, -0.03, 0]), UpperTorso: rot(2.5), Head: rot(-2), RightUpperArm: rot(2, 0, 7), LeftUpperArm: rot(2, 0, -7), RightLowerArm: rot(11), LeftLowerArm: rot(11) }),
        kf(2.4, { LowerTorso: pos(0, 0, 0, [0, 0, 0]), UpperTorso: rot(0), Head: rot(0), RightUpperArm: rot(0, 0, 5), LeftUpperArm: rot(0, 0, -5), RightLowerArm: rot(8), LeftLowerArm: rot(8) }),
      ]),
    },
    {
      id: 'walk', cat: 'move', label: 'เดิน (Walk)', prop: 'none',
      make: () => cycle('Walk', 'Movement', 1.0, 8, gait({
        hip: 28, hipBias: 0, kneeBase: 6, knee: 38, arm: 22, armOut: 4, elbow: 14, elbowSwing: 10,
        twist: 6, lean: 0, chest: 0, bounce: 0.08,
      })),
    },
    {
      id: 'run', cat: 'move', label: 'วิ่ง (Run)', prop: 'none',
      make: () => cycle('Run', 'Movement', 0.66, 8, gait({
        hip: 48, hipBias: 8, kneeBase: 18, knee: 75, arm: 50, armOut: 6, elbow: 80, elbowSwing: 12,
        twist: 10, lean: -10, chest: -6, bounce: 0.16,
      })),
    },
    {
      id: 'jump', cat: 'move', label: 'กระโดด (Jump)', prop: 'none',
      make: () => anim('Jump', 'Movement', false, 0.35, [
        kf(0, merge(legs(25, -45), { UpperTorso: rot(-8), Head: rot(6), RightUpperArm: rot(-15, 0, 8), LeftUpperArm: rot(-15, 0, -8), RightLowerArm: rot(15), LeftLowerArm: rot(15) }), 'Cubic', 'Out'),
        kf(0.15, merge(legs(0, 0, { spread: 3 }), { RightLowerLeg: rot(-10), LeftLowerLeg: rot(-10), UpperTorso: rot(4), Head: rot(-4), RightUpperArm: rot(150, 0, 20), LeftUpperArm: rot(150, 0, -20), RightLowerArm: rot(15), LeftLowerArm: rot(15) }), 'Cubic', 'InOut'),
        kf(0.35, merge(legs(0, 0, { spread: 3 }), { RightUpperLeg: rot(25, 0, 3), RightLowerLeg: rot(-45), LeftUpperLeg: rot(5, 0, -3), LeftLowerLeg: rot(-20), UpperTorso: rot(2), Head: rot(-2), RightUpperArm: rot(140, 0, 25), LeftUpperArm: rot(140, 0, -25), RightLowerArm: rot(20), LeftLowerArm: rot(20) })),
      ]),
    },
    {
      id: 'fall', cat: 'move', label: 'ตกลงมา (Fall)', prop: 'none',
      make: () => anim('Fall', 'Movement', true, 0.8, [
        kf(0, { UpperTorso: rot(6), Head: rot(-6), RightUpperArm: rot(125, 0, 45), LeftUpperArm: rot(125, 0, -45), RightLowerArm: rot(20), LeftLowerArm: rot(20), RightUpperLeg: rot(25), RightLowerLeg: rot(-40), LeftUpperLeg: rot(-5), LeftLowerLeg: rot(-15) }),
        kf(0.4, { UpperTorso: rot(8), Head: rot(-8), RightUpperArm: rot(135, 0, 55), LeftUpperArm: rot(135, 0, -55), RightLowerArm: rot(10), LeftLowerArm: rot(10), RightUpperLeg: rot(10), RightLowerLeg: rot(-20), LeftUpperLeg: rot(15), LeftLowerLeg: rot(-35) }),
        kf(0.8, { UpperTorso: rot(6), Head: rot(-6), RightUpperArm: rot(125, 0, 45), LeftUpperArm: rot(125, 0, -45), RightLowerArm: rot(20), LeftLowerArm: rot(20), RightUpperLeg: rot(25), RightLowerLeg: rot(-40), LeftUpperLeg: rot(-5), LeftLowerLeg: rot(-15) }),
      ]),
    },
    {
      id: 'climb', cat: 'move', label: 'ปีนบันได (Climb)', prop: 'none',
      make: () => {
        const a = { RightUpperArm: rot(160, 0, 8), RightLowerArm: rot(35), LeftUpperArm: rot(115, 0, -8), LeftLowerArm: rot(85), RightUpperLeg: rot(10), RightLowerLeg: rot(-20), RightFoot: rot(10), LeftUpperLeg: rot(55), LeftLowerLeg: rot(-85), LeftFoot: rot(30), UpperTorso: rot(-4), Head: rot(12) };
        const b = { RightUpperArm: rot(115, 0, 8), RightLowerArm: rot(85), LeftUpperArm: rot(160, 0, -8), LeftLowerArm: rot(35), RightUpperLeg: rot(55), RightLowerLeg: rot(-85), RightFoot: rot(30), LeftUpperLeg: rot(10), LeftLowerLeg: rot(-20), LeftFoot: rot(10), UpperTorso: rot(-4), Head: rot(12) };
        return anim('Climb', 'Movement', true, 1.0, [kf(0, a), kf(0.5, b), kf(1.0, a)]);
      },
    },
    {
      id: 'swim', cat: 'move', label: 'ว่ายน้ำ (Swim)', prop: 'none',
      make: () => {
        // Freestyle: arms windmill in 90° steps so the motion keeps its direction.
        const body = { LowerTorso: pos(-75, 0, 0, [0, 0, 0]), UpperTorso: rot(0), Head: rot(45) };
        const R = [[180, 0, 12], [90, 0, 12], [0, 0, 12], [-90, 0, 30]];
        const L = [[0, 0, -12], [-90, 0, -30], [180, 0, -12], [90, 0, -12]];
        const keys = [];
        for (let i = 0; i <= 4; i++) {
          const f = i % 2 === 0 ? 12 : -12;
          keys.push(kf(r(i * 0.3), merge(body, {
            RightUpperArm: rot(...R[i % 4]), LeftUpperArm: rot(...L[i % 4]), RightLowerArm: rot(10), LeftLowerArm: rot(10),
            RightUpperLeg: rot(f), LeftUpperLeg: rot(-f), RightLowerLeg: rot(-10), LeftLowerLeg: rot(-10),
            UpperTorso: rot(0, i % 2 === 0 ? 8 : -8, 0),
          }), 'Linear'));
        }
        return anim('Swim', 'Movement', true, 1.2, keys);
      },
    },
    {
      id: 'sit', cat: 'move', label: 'นั่ง (Sit)', prop: 'none',
      make: () => {
        const p = { RightUpperLeg: rot(90, 0, 4), LeftUpperLeg: rot(90, 0, -4), RightLowerLeg: rot(-90), LeftLowerLeg: rot(-90), RightUpperArm: rot(35, 0, -5), LeftUpperArm: rot(35, 0, 5), RightLowerArm: rot(40), LeftLowerArm: rot(40), UpperTorso: rot(0), Head: rot(0) };
        return anim('Sit', 'Movement', true, 1, [kf(0, p), kf(1, p)]);
      },
    },

    // ===== Combat =====
    {
      id: 'stance', cat: 'combat', label: 'ท่าตั้งการ์ด (Combat stance)', prop: 'none',
      make: () => anim('CombatStance', 'Idle', true, 1.2, [
        kf(0, merge(GUARD, legs(35, -65))),
        kf(0.6, merge(GUARD, legs(40, -74), { UpperTorso: rot(-7), Head: rot(6) })),
        kf(1.2, merge(GUARD, legs(35, -65))),
      ]),
    },
    {
      id: 'punch', cat: 'combat', label: 'ต่อยหมัดขวา (Punch)', prop: 'none',
      make: () => anim('Punch', 'Action', false, 0.55, [
        kf(0, merge(GUARD), 'Cubic', 'Out'),
        kf(0.1, merge(GUARD, { UpperTorso: rot(-5, -15), RightUpperArm: rot(45, 0, -5), RightLowerArm: rot(120) }), 'Cubic', 'Out'),
        kf(0.2, merge(GUARD, { UpperTorso: rot(-8, 25), Head: rot(3, -20), RightUpperArm: rot(90, 0, -5), RightLowerArm: rot(5), LeftUpperArm: rot(55, 0, 20), LeftLowerArm: rot(115) }), 'Linear'),
        kf(0.3, merge(GUARD, { UpperTorso: rot(-8, 22), Head: rot(3, -18), RightUpperArm: rot(85, 0, -5), RightLowerArm: rot(20), LeftUpperArm: rot(55, 0, 20), LeftLowerArm: rot(115) }), 'Cubic', 'InOut'),
        kf(0.55, merge(GUARD)),
      ], [{ time: 0.2, name: 'Hit', value: 'RightHand' }]),
    },
    {
      id: 'kick', cat: 'combat', label: 'เตะหน้า (Front kick)', prop: 'none',
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
      id: 'swordhold', cat: 'combat', label: 'ถือดาบเตรียม (Sword hold)', prop: 'sword',
      make: () => {
        const a = { RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40) };
        const b = { RightUpperArm: rot(22, 0, 5), RightLowerArm: rot(74), RightHand: rot(-42) };
        return anim('SwordHold', 'Action', true, 2, [kf(0, a), kf(1, b), kf(2, a)]);
      },
    },
    {
      id: 'slash', cat: 'combat', label: 'ฟันดาบ (Sword slash)', prop: 'sword',
      make: () => anim('SwordSlash', 'Action', false, 0.75, [
        kf(0, merge(SWORD_READY), 'Cubic', 'Out'),
        kf(0.22, { UpperTorso: rot(5, -25), Head: rot(0, 20), RightUpperArm: rot(165, 0, 25), RightLowerArm: rot(35), RightHand: rot(20), LeftUpperArm: rot(40, 0, -15), LeftLowerArm: rot(60) }, 'Cubic', 'In'),
        kf(0.36, { UpperTorso: rot(-15, 30), Head: rot(5, -25), RightUpperArm: rot(30, 0, -35), RightLowerArm: rot(5), RightHand: rot(-50), LeftUpperArm: rot(-20, 0, -20), LeftLowerArm: rot(30) }, 'Cubic', 'Out'),
        kf(0.48, { UpperTorso: rot(-15, 35), Head: rot(5, -28), RightUpperArm: rot(15, 0, -40), RightLowerArm: rot(5), RightHand: rot(-50), LeftUpperArm: rot(-20, 0, -20), LeftLowerArm: rot(30) }, 'Cubic', 'InOut'),
        kf(0.75, merge(SWORD_READY)),
      ], [{ time: 0.31, name: 'Hit', value: 'Blade' }]),
    },
    {
      id: 'combo', cat: 'combat', label: 'คอมโบดาบ 3 จังหวะ (Sword combo)', prop: 'sword',
      make: () => {
        const guardL = { LeftUpperArm: rot(25, 0, -12), LeftLowerArm: rot(60) };
        return anim('SwordCombo3', 'Action', false, 1.55, [
          kf(0, merge(SWORD_READY), 'Cubic', 'Out'),
          // 1: horizontal cut, right to left
          kf(0.14, merge(guardL, turn(0, -35), { RightUpperArm: rot(75, 0, 70), RightLowerArm: rot(25), RightHand: rot(0, 90) }), 'Cubic', 'In'),
          kf(0.26, merge(guardL, turn(-6, 40), { RightUpperArm: rot(80, 0, -50), RightLowerArm: rot(8), RightHand: rot(0, 90) }), 'Cubic', 'Out'),
          // 2: backhand cut, left to right
          kf(0.42, merge(guardL, turn(-4, 45), { RightUpperArm: rot(70, 0, -60), RightLowerArm: rot(30), RightHand: rot(0, 60) }), 'Cubic', 'In'),
          kf(0.56, merge(guardL, turn(-6, -40), { RightUpperArm: rot(80, 0, 75), RightLowerArm: rot(10), RightHand: rot(0, -60) }), 'Cubic', 'Out'),
          // 3: overhead finisher
          kf(0.78, merge(turn(6, -15), { RightUpperArm: rot(170, 0, 15), RightLowerArm: rot(35), RightHand: rot(20), LeftUpperArm: rot(140, 0, -25), LeftLowerArm: rot(60) }), 'Cubic', 'In'),
          kf(0.92, merge(turn(-22, 10), { RightUpperArm: rot(35, 0, -15), RightLowerArm: rot(5), RightHand: rot(-55), LeftUpperArm: rot(30, 0, -10), LeftLowerArm: rot(40) }), 'Cubic', 'Out'),
          kf(1.12, merge(turn(-22, 12), { RightUpperArm: rot(28, 0, -18), RightLowerArm: rot(5), RightHand: rot(-55), LeftUpperArm: rot(25, 0, -10), LeftLowerArm: rot(40) }), 'Cubic', 'InOut'),
          kf(1.55, merge(SWORD_READY)),
        ], [
          { time: 0.22, name: 'Hit', value: '1' },
          { time: 0.51, name: 'Hit', value: '2' },
          { time: 0.88, name: 'Hit', value: '3' },
        ]);
      },
    },
    {
      id: 'heavy', cat: 'combat', label: 'ฟาดหนักสองมือ (Heavy slam)', prop: 'sword',
      make: () => {
        const up = { RightUpperArm: rot(170, 0, 10), RightLowerArm: rot(30), RightHand: rot(25), LeftUpperArm: rot(165, 0, -10), LeftLowerArm: rot(35) };
        const down = { RightUpperArm: rot(45, 0, -12), RightLowerArm: rot(5), RightHand: rot(-60), LeftUpperArm: rot(45, 0, 15), LeftLowerArm: rot(15) };
        return anim('HeavySlam', 'Action', false, 1.15, [
          kf(0, merge(SWORD_READY, STAND), 'Cubic', 'Out'),
          kf(0.38, merge(up, legs(8, -10, { spread: 10 }), { UpperTorso: rot(14), Head: rot(-8) }), 'Cubic', 'In'),
          kf(0.52, merge(down, legs(42, -78, { spread: 12, lean: -8 }), { UpperTorso: rot(-28), Head: rot(22) }), 'Cubic', 'Out'),
          kf(0.78, merge(down, legs(40, -75, { spread: 12, lean: -8 }), { UpperTorso: rot(-25), Head: rot(20) }), 'Cubic', 'InOut'),
          kf(1.15, merge(SWORD_READY, STAND)),
        ], [{ time: 0.5, name: 'Hit', value: 'Slam' }]);
      },
    },
    {
      id: 'twirl', cat: 'combat', label: 'ควงดาบ (Sword twirl, ขยับอาวุธ)', prop: 'sword',
      make: () => {
        // Uses the weapon joint "Handle": two full spins in 90° steps.
        const arm = { RightUpperArm: rot(35, 0, 15), RightLowerArm: rot(80), RightHand: rot(-10) };
        const ready = { RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40), Handle: rot(0) };
        const keys = [kf(0, merge(ready), 'Cubic', 'InOut'), kf(0.2, merge(arm, { Handle: rot(0) }), 'Linear')];
        [-90, 180, 90, 0, -90, 180, 90, 0].forEach((x, i) => {
          keys.push(kf(r(0.3 + i * 0.1), merge(arm, { Handle: rot(x) }), i === 7 ? 'Cubic' : 'Linear', 'Out'));
        });
        keys.push(kf(1.3, merge(ready)));
        return anim('SwordTwirl', 'Action', false, 1.3, keys);
      },
    },
    {
      id: 'block', cat: 'sns', label: 'ยกโล่กัน (Shield block)', prop: 'swordshield',
      make: () => {
        // LeftHandle y=90 turns the shield face from the forearm's outside to its front.
        const a = { LeftUpperArm: rot(75, 0, 28), LeftLowerArm: rot(95), LeftHand: rot(0), LeftHandle: rot(0, 90), RightUpperArm: rot(15, 0, 8), RightLowerArm: rot(55), RightHand: rot(-35), UpperTorso: rot(-6, 12), Head: rot(4, -10) };
        const b = merge(a, { LeftUpperArm: rot(78, 0, 28), UpperTorso: rot(-8, 12) });
        return anim('ShieldBlock', 'Action', true, 1.2, [kf(0, a), kf(0.6, b), kf(1.2, a)]);
      },
    },
    {
      id: 'dodge', cat: 'combat', label: 'ม้วนหลบ (Dodge roll)', prop: 'none',
      make: () => {
        // The root turns a full circle in steps of <= 90° (slerp takes the short way).
        const tuck = { RightUpperLeg: rot(110, 0, 5), LeftUpperLeg: rot(110, 0, -5), RightLowerLeg: rot(-130), LeftLowerLeg: rot(-130), RightUpperArm: rot(70, 0, -20), LeftUpperArm: rot(70, 0, 20), RightLowerArm: rot(110), LeftLowerArm: rot(110), UpperTorso: rot(-30), Head: rot(-35) };
        const k = (t, x, y) => kf(t, merge(tuck, { LowerTorso: pos(x, 0, 0, [0, y, 0]) }), 'Linear');
        return anim('DodgeRoll', 'Action', false, 0.8, [
          kf(0, merge(BODY_REST), 'Cubic', 'In'),
          k(0.1, -25, -0.6), k(0.22, -115, -0.9), k(0.34, 155, -0.9), k(0.46, 65, -0.8),
          kf(0.58, merge(tuck, { LowerTorso: pos(0, 0, 0, [0, -0.75, 0]) }), 'Cubic', 'Out'),
          kf(0.8, merge(BODY_REST)),
        ]);
      },
    },
    {
      id: 'bow', cat: 'bow', label: 'ยิงธนู (Bow shot)', prop: 'bow',
      make: () => {
        const aim = { UpperTorso: rot(0, -50), Head: rot(0, 45), LeftUpperArm: rot(0, -40, -88), LeftLowerArm: rot(0), LeftHand: rot(0) };
        return anim('BowShot', 'Action', false, 1.3, [
          kf(0, { UpperTorso: rot(0), Head: rot(0), LeftUpperArm: rot(20, 0, -8), LeftLowerArm: rot(20), LeftHand: rot(0), RightUpperArm: rot(0), RightLowerArm: rot(0) }, 'Cubic', 'InOut'),
          kf(0.3, merge(aim, { RightUpperArm: rot(70, 0, -35), RightLowerArm: rot(80) }), 'Cubic', 'InOut'),
          kf(0.65, merge(aim, { RightUpperArm: rot(0, -40, 88), RightLowerArm: rot(150) }), 'Linear'),
          kf(0.8, merge(aim, { RightUpperArm: rot(0, -42, 88), RightLowerArm: rot(152) }), 'Cubic', 'Out'),
          kf(0.88, merge(aim, { RightUpperArm: rot(0, -60, 95), RightLowerArm: rot(95) }), 'Cubic', 'InOut'),
          kf(1.3, { UpperTorso: rot(0), Head: rot(0), LeftUpperArm: rot(20, 0, -8), LeftLowerArm: rot(20), LeftHand: rot(0), RightUpperArm: rot(0), RightLowerArm: rot(0) }),
        ], [{ time: 0.8, name: 'Shoot', value: '' }]);
      },
    },
    {
      id: 'cast', cat: 'combat', label: 'ร่ายเวท (Spell cast)', prop: 'none',
      make: () => anim('SpellCast', 'Action', false, 1.4, [
        kf(0, merge(UPPER_REST)),
        kf(0.4, merge(UPPER_REST, { UpperTorso: rot(10), Head: rot(18), RightUpperArm: rot(165, 0, 22), LeftUpperArm: rot(165, 0, -22), RightLowerArm: rot(15), LeftLowerArm: rot(15), RightHand: rot(10), LeftHand: rot(10) })),
        kf(0.62, merge(UPPER_REST, { UpperTorso: rot(12), Head: rot(20), RightUpperArm: rot(170, 0, 15), LeftUpperArm: rot(170, 0, -15), RightLowerArm: rot(25), LeftLowerArm: rot(25), RightHand: rot(10), LeftHand: rot(10) }), 'Cubic', 'In'),
        kf(0.76, merge(UPPER_REST, { UpperTorso: rot(-12), Head: rot(5), RightUpperArm: rot(88, 0, -12), LeftUpperArm: rot(88, 0, 12), RightLowerArm: rot(0), LeftLowerArm: rot(0), RightHand: rot(-70), LeftHand: rot(-70) }), 'Cubic', 'Out'),
        kf(1.0, merge(UPPER_REST, { UpperTorso: rot(-10), Head: rot(4), RightUpperArm: rot(85, 0, -12), LeftUpperArm: rot(85, 0, 12), RightLowerArm: rot(5), LeftLowerArm: rot(5), RightHand: rot(-65), LeftHand: rot(-65) }), 'Cubic', 'InOut'),
        kf(1.4, merge(UPPER_REST)),
      ], [{ time: 0.76, name: 'Cast', value: '' }]),
    },

    // ===== Reactions =====
    {
      id: 'hit', cat: 'react', label: 'โดนตี (Hit reaction)', prop: 'none',
      make: () => anim('HitReact', 'Action2', false, 0.55, [
        kf(0, merge(UPPER_REST, { LowerTorso: pos(0, 0, 0, [0, 0, 0]) }), 'Cubic', 'Out'),
        kf(0.08, merge(UPPER_REST, { LowerTorso: pos(8, 0, 0, [0, -0.05, 0.25]), UpperTorso: rot(18, 0, 4), Head: rot(22, 0, -6), RightUpperArm: rot(30, 0, 25), LeftUpperArm: rot(30, 0, -25), RightLowerArm: rot(35), LeftLowerArm: rot(35) }), 'Cubic', 'InOut'),
        kf(0.2, merge(UPPER_REST, { LowerTorso: pos(6, 0, 0, [0, -0.04, 0.2]), UpperTorso: rot(14, 0, 3), Head: rot(16, 0, -4), RightUpperArm: rot(22, 0, 18), LeftUpperArm: rot(22, 0, -18), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Cubic', 'InOut'),
        kf(0.55, merge(UPPER_REST, { LowerTorso: pos(0, 0, 0, [0, 0, 0]) })),
      ]),
    },
    {
      id: 'death', cat: 'react', label: 'ล้มตาย (Death)', prop: 'none',
      make: () => anim('Death', 'Action4', false, 1.5, [
        kf(0, merge(BODY_REST), 'Cubic', 'Out'),
        kf(0.25, merge(BODY_REST, { UpperTorso: rot(12, 15, 5), Head: rot(25, 10, 0), RightUpperArm: rot(25, 0, 30), LeftUpperArm: rot(25, 0, -30), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Cubic', 'In'),
        kf(0.65, merge(legs(70, -120, { spread: 10 }), { UpperTorso: rot(-15, 10, 5), Head: rot(-20), RightUpperArm: rot(10, 0, 15), LeftUpperArm: rot(10, 0, -15), RightLowerArm: rot(20), LeftLowerArm: rot(20) }), 'Cubic', 'In'),
        kf(1.1, { LowerTorso: pos(85, 0, 0, [0, -1.55, 0.9]), UpperTorso: rot(5), Head: rot(-10, 20, 0), RightUpperLeg: rot(5, 0, 10), LeftUpperLeg: rot(15, 0, -8), RightLowerLeg: rot(-10), LeftLowerLeg: rot(-35), RightFoot: rot(20), LeftFoot: rot(20), RightUpperArm: rot(0, 0, 65), LeftUpperArm: rot(10, 0, -55), RightLowerArm: rot(15), LeftLowerArm: rot(25) }, 'Bounce', 'Out'),
        kf(1.5, { LowerTorso: pos(88, 0, 0, [0, -1.6, 0.95]), UpperTorso: rot(4), Head: rot(-12, 25, 0), RightUpperLeg: rot(5, 0, 10), LeftUpperLeg: rot(15, 0, -8), RightLowerLeg: rot(-10), LeftLowerLeg: rot(-35), RightFoot: rot(20), LeftFoot: rot(20), RightUpperArm: rot(0, 0, 70), LeftUpperArm: rot(10, 0, -60), RightLowerArm: rot(15), LeftLowerArm: rot(25) }),
      ]),
    },

    // ===== Items & emotes =====
    {
      id: 'use', cat: 'item', label: 'ใช้ไอเทม/ดื่มยา (Use item)', prop: 'none',
      make: () => anim('UseItem', 'Action', false, 1.1, [
        kf(0, merge(ARM_REST)),
        kf(0.3, { RightUpperArm: rot(40, 0, -30), RightLowerArm: rot(125), RightHand: rot(0), Head: rot(0) }),
        kf(0.45, { RightUpperArm: rot(60, 0, -25), RightLowerArm: rot(135), RightHand: rot(0), Head: rot(20) }, 'Linear'),
        kf(0.8, { RightUpperArm: rot(60, 0, -25), RightLowerArm: rot(135), RightHand: rot(0), Head: rot(20) }),
        kf(1.1, merge(ARM_REST)),
      ], [{ time: 0.6, name: 'Use', value: '' }]),
    },
    {
      id: 'pickup', cat: 'item', label: 'ก้มเก็บของ (Pick up)', prop: 'none',
      make: () => anim('PickUp', 'Action', false, 1.2, [
        kf(0, merge(BODY_REST)),
        kf(0.4, merge(legs(80, -110, { spread: 8 }), { UpperTorso: rot(-35), Head: rot(25), RightUpperArm: rot(55, 0, -5), RightLowerArm: rot(10), RightHand: rot(0), LeftUpperArm: rot(15, 0, -10), LeftLowerArm: rot(30), LeftHand: rot(0) })),
        kf(0.6, merge(legs(80, -110, { spread: 8 }), { UpperTorso: rot(-35), Head: rot(25), RightUpperArm: rot(50, 0, -5), RightLowerArm: rot(25), RightHand: rot(10), LeftUpperArm: rot(15, 0, -10), LeftLowerArm: rot(30), LeftHand: rot(0) })),
        kf(1.2, merge(BODY_REST)),
      ], [{ time: 0.5, name: 'Grab', value: '' }]),
    },
    {
      id: 'wave', cat: 'item', label: 'โบกมือ (Wave)', prop: 'none',
      make: () => anim('Wave', 'Action', false, 1.6, [
        kf(0, { RightUpperArm: rot(0), RightLowerArm: rot(0), Head: rot(0) }, 'Cubic', 'Out'),
        kf(0.3, { RightUpperArm: rot(0, 0, 150), RightLowerArm: rot(0, 0, 25), Head: rot(0, 0, -5) }),
        kf(0.55, { RightUpperArm: rot(0, 0, 150), RightLowerArm: rot(0, 0, -25), Head: rot(0, 0, -5) }),
        kf(0.8, { RightUpperArm: rot(0, 0, 150), RightLowerArm: rot(0, 0, 25), Head: rot(0, 0, -5) }),
        kf(1.05, { RightUpperArm: rot(0, 0, 150), RightLowerArm: rot(0, 0, -25), Head: rot(0, 0, -5) }),
        kf(1.6, { RightUpperArm: rot(0), RightLowerArm: rot(0), Head: rot(0) }),
      ]),
    },

    // ===== Weapon sets. Two-handed keys get the left arm from IK (see wield). =====
    // ---- Long sword ----
    {
      id: 'ls_ready', cat: 'longsword', label: 'ดาบยาว: ท่าตั้ง (Ready)', prop: 'longsword',
      make: () => {
        const p = (b) => merge(LS.guard(b), legs(18 + b, -32 - b * 2));
        return anim('LongSwordReady', 'Idle', true, 1.6, [kf(0, p(0)), kf(0.8, p(2)), kf(1.6, p(0))]);
      },
    },
    {
      id: 'ls_combo', cat: 'longsword', label: 'ดาบยาว: ฟันลง-แทง-ฟันขึ้น (Combo)', prop: 'longsword',
      make: () => {
        const w = (torso, grip, dir) => wield(torso, grip, dir, LS_GRIP);
        return anim('LongSwordCombo', 'Action', false, 1.9, [
          kf(0, LS.guard(0), 'Cubic', 'Out'),
          kf(0.18, w(turn(8, 5), [0.1, 1.1, -0.5], [0, -0.3, 0.95]), 'Cubic', 'In'),
          kf(0.32, w(turn(-15, 0), [0, -0.4, -1.05], [0, -0.35, -0.94]), 'Cubic', 'Out'),
          kf(0.55, w(turn(-5, 25), [0.3, -0.4, -0.5], [0, 0.05, -1]), 'Cubic', 'In'),
          kf(0.68, w(turn(-12, -10), [0.1, 0, -1.45], [0, 0, -1]), 'Cubic', 'Out'),
          kf(0.95, w(turn(-15, 20), [0, -0.55, -0.8], [-0.4, -0.4, -0.82]), 'Cubic', 'In'),
          kf(1.1, w(turn(10, -20), [0.5, 1.0, -0.8], [0.3, 0.9, 0.3]), 'Cubic', 'Out'),
          kf(1.35, w(turn(10, -22), [0.5, 1.0, -0.75], [0.3, 0.9, 0.3]), 'Cubic', 'InOut'),
          kf(1.9, LS.guard(0)),
        ], [
          { time: 0.28, name: 'Hit', value: '1' }, { time: 0.66, name: 'Hit', value: '2' }, { time: 1.03, name: 'Hit', value: '3' },
        ]);
      },
    },

    // ---- Dual blades ----
    {
      id: 'db_ready', cat: 'dual', label: 'ดาบคู่: ท่าตั้ง (Ready)', prop: 'dual',
      make: () => anim('DualReady', 'Idle', true, 1.0, [
        kf(0, merge(DB_GUARD, legs(30, -55, { spread: 10 }))),
        kf(0.5, merge(DB_GUARD, legs(34, -62, { spread: 10 }), { UpperTorso: rot(-12) })),
        kf(1.0, merge(DB_GUARD, legs(30, -55, { spread: 10 }))),
      ]),
    },
    {
      id: 'db_flurry', cat: 'dual', label: 'ดาบคู่: ฟันสลับรัว (Flurry)', prop: 'dual',
      make: () => {
        const rUp = { RightUpperArm: rot(120, 0, 40), RightLowerArm: rot(40), RightHand: rot(0) };
        const rDown = { RightUpperArm: rot(30, 0, -35), RightLowerArm: rot(10), RightHand: rot(-40) };
        const lUp = { LeftUpperArm: rot(120, 0, -40), LeftLowerArm: rot(40), LeftHand: rot(0) };
        const lDown = { LeftUpperArm: rot(30, 0, 35), LeftLowerArm: rot(10), LeftHand: rot(-40) };
        const rRest = { RightUpperArm: rot(25, 0, 25), RightLowerArm: rot(50), RightHand: rot(-50) };
        const lRest = { LeftUpperArm: rot(25, 0, -25), LeftLowerArm: rot(50), LeftHand: rot(-50) };
        return anim('DualFlurry', 'Action', false, 1.4, [
          kf(0, merge(DB_GUARD), 'Cubic', 'Out'),
          kf(0.1, merge(rUp, lRest, turn(0, -20)), 'Cubic', 'In'),
          kf(0.2, merge(rDown, lRest, turn(-10, 20)), 'Cubic', 'Out'),
          kf(0.3, merge(rRest, lUp, turn(0, 20)), 'Cubic', 'In'),
          kf(0.4, merge(rRest, lDown, turn(-10, -20)), 'Cubic', 'Out'),
          kf(0.5, merge(rUp, lRest, turn(0, -20)), 'Cubic', 'In'),
          kf(0.6, merge(rDown, lRest, turn(-10, 20)), 'Cubic', 'Out'),
          kf(0.75, merge({ RightUpperArm: rot(150, 0, 30), LeftUpperArm: rot(150, 0, -30), RightLowerArm: rot(30), LeftLowerArm: rot(30), RightHand: rot(0), LeftHand: rot(0) }, turn(10, 0)), 'Cubic', 'In'),
          kf(0.9, merge({ RightUpperArm: rot(40, 0, -40), LeftUpperArm: rot(40, 0, 40), RightLowerArm: rot(10), LeftLowerArm: rot(10), RightHand: rot(-40), LeftHand: rot(-40) }, turn(-15, 0)), 'Cubic', 'Out'),
          kf(1.4, merge(DB_GUARD)),
        ], [
          { time: 0.18, name: 'Hit', value: 'R' }, { time: 0.38, name: 'Hit', value: 'L' },
          { time: 0.58, name: 'Hit', value: 'R' }, { time: 0.86, name: 'Hit', value: 'X' },
        ]);
      },
    },
    {
      id: 'db_spin', cat: 'dual', label: 'ดาบคู่: หมุนตัวฟัน (Spin)', prop: 'dual',
      make: () => {
        // Whole body turns once to the left in 90° steps, blades held out.
        const arms = { RightUpperArm: rot(10, 0, 85), LeftUpperArm: rot(10, 0, -85), RightLowerArm: rot(10), LeftLowerArm: rot(10), RightHand: rot(-10), LeftHand: rot(-10), UpperTorso: rot(-8), Head: rot(4) };
        const k = (t, y, e) => kf(t, merge(arms, { LowerTorso: pos(0, y, 0, [0, -0.15, 0]) }), e || 'Linear');
        return anim('DualSpin', 'Action', false, 1.0, [
          kf(0, merge(DB_GUARD, { LowerTorso: pos(0, 0, 0, [0, 0, 0]) }), 'Cubic', 'In'),
          k(0.15, 0), k(0.3, 90), k(0.45, 180), k(0.6, -90), k(0.75, 0, 'Cubic'),
          kf(1.0, merge(DB_GUARD, { LowerTorso: pos(0, 0, 0, [0, 0, 0]) })),
        ], [{ time: 0.3, name: 'Hit', value: '1' }, { time: 0.6, name: 'Hit', value: '2' }]);
      },
    },

    // ---- Great sword ----
    {
      id: 'gs_ready', cat: 'greatsword', label: 'ดาบใหญ่: ท่าตั้ง (Ready)', prop: 'greatsword',
      make: () => {
        const p = (b) => merge(GS.low(b), legs(25 + b, -45 - b * 2, { spread: 10 }));
        return anim('GreatSwordReady', 'Idle', true, 1.8, [kf(0, p(0)), kf(0.9, p(2)), kf(1.8, p(0))]);
      },
    },
    {
      id: 'gs_charge', cat: 'greatsword', label: 'ดาบใหญ่: ชาร์จแล้วฟาด (Charge slam)', prop: 'greatsword',
      make: () => {
        const w = (torso, grip, dir) => wield(torso, grip, dir, GS_GRIP);
        const up = (s) => w(turn(12 + s, -10), [0.1, 1.2, -0.4 - s * 0.02], [0, -0.5, 0.87]);
        const down = w(turn(-30, 5), [0, -0.5, -1.0], [0, -0.55, -0.83]);
        return anim('GreatSwordCharge', 'Action', false, 2.2, [
          kf(0, merge(GS.low(0), legs(25, -45, { spread: 10 })), 'Cubic', 'InOut'),
          kf(0.2, merge(w(turn(4, 0), [0.1, 0.4, -1.1], [0, 0.9, -0.43]), legs(20, -35, { spread: 11 })), 'Cubic', 'Out'),
          kf(0.4, merge(up(0), legs(15, -25, { spread: 12 })), 'Linear'),
          kf(0.75, merge(up(2), legs(18, -30, { spread: 12 })), 'Linear'),
          kf(1.1, merge(up(4), legs(20, -34, { spread: 12 })), 'Cubic', 'In'),
          kf(1.25, merge(down, legs(45, -80, { spread: 14, lean: -8 })), 'Cubic', 'Out'),
          kf(1.6, merge(down, legs(44, -78, { spread: 14, lean: -8 })), 'Cubic', 'InOut'),
          kf(2.2, merge(GS.low(0), legs(25, -45, { spread: 10 }))),
        ], [{ time: 0.4, name: 'Charge', value: 'start' }, { time: 1.1, name: 'Charge', value: 'full' }, { time: 1.22, name: 'Hit', value: 'Slam' }]);
      },
    },
    {
      id: 'gs_sweep', cat: 'greatsword', label: 'ดาบใหญ่: กวาดแนวนอน (Sweep)', prop: 'greatsword',
      make: () => {
        const w = (torso, grip, dir) => wield(torso, grip, dir, GS_GRIP);
        return anim('GreatSwordSweep', 'Action', false, 1.6, [
          kf(0, merge(GS.low(0), legs(25, -45, { spread: 10 })), 'Cubic', 'InOut'),
          kf(0.35, merge(w(turn(0, -50), [0.7, -0.3, -0.6], [0.8, 0.1, 0.6]), legs(25, -45, { spread: 12, twist: -20 })), 'Cubic', 'In'),
          kf(0.62, merge(w(turn(-5, 45), [-0.2, -0.3, -0.9], [-0.8, 0, -0.6]), legs(30, -55, { spread: 12, twist: 20 })), 'Cubic', 'Out'),
          kf(0.85, merge(w(turn(-6, 50), [-0.2, -0.32, -0.88], [-0.8, -0.05, -0.6]), legs(30, -55, { spread: 12, twist: 22 })), 'Cubic', 'InOut'),
          kf(1.6, merge(GS.low(0), legs(25, -45, { spread: 10 }))),
        ], [{ time: 0.52, name: 'Hit', value: 'Sweep' }]);
      },
    },

    // ---- Heavy gun ----
    {
      id: 'hg_aim', cat: 'heavygun', label: 'ปืนใหญ่: เล็ง (Aim)', prop: 'heavygun',
      make: () => {
        const p = (b) => merge(HG.hold(b), legs(25 + b, -45 - b * 2, { spread: 12 }));
        return anim('HeavyGunAim', 'Idle', true, 1.6, [kf(0, p(0)), kf(0.8, p(1.5)), kf(1.6, p(0))]);
      },
    },
    {
      id: 'hg_fire', cat: 'heavygun', label: 'ปืนใหญ่: ยิง 3 นัด (Fire)', prop: 'heavygun',
      make: () => {
        const aim = HG.hold(0);
        const kick = wield(turn(8, 8), [0, -0.5, -0.45], [0, 0.3, -0.95], HG_GRIP, { gun: true });
        const keys = [kf(0, aim, 'Linear')];
        const markers = [];
        [0.15, 0.55, 0.95].forEach((t) => {
          keys.push(kf(t, aim, 'Cubic', 'Out'));
          keys.push(kf(r(t + 0.06), kick, 'Cubic', 'InOut'));
          keys.push(kf(r(t + 0.32), aim, 'Linear'));
          markers.push({ time: t, name: 'Fire', value: '' });
        });
        keys.push(kf(1.5, aim));
        return anim('HeavyGunFire', 'Action', false, 1.5, keys, markers);
      },
    },
    {
      id: 'hg_reload', cat: 'heavygun', label: 'ปืนใหญ่: บรรจุกระสุน (Reload)', prop: 'heavygun',
      make: () => {
        const tilt = (pt) => wield(turn(-10, 0), [0.1, -0.6, -0.6], [0.3, -0.25, -0.92], pt, { gun: true });
        return anim('HeavyGunReload', 'Action', false, 1.6, [
          kf(0, HG.hold(0)),
          kf(0.35, tilt([0, 1.0, -0.3])),
          kf(0.6, tilt([0, 1.0, 0.4]), 'Cubic', 'Out'),
          kf(0.85, tilt([0, 1.0, -0.4])),
          kf(1.6, HG.hold(0)),
        ], [{ time: 0.6, name: 'Reload', value: '' }]);
      },
    },

    // ---- Bow (BowShot is above) ----
    {
      id: 'bow_rapid', cat: 'bow', label: 'ธนู: ยิงรัว 3 ดอก (Rapid shot)', prop: 'bow',
      make: () => {
        const aim = { UpperTorso: rot(0, -50), Head: rot(0, 45), LeftUpperArm: rot(0, -40, -88), LeftLowerArm: rot(0), LeftHand: rot(0) };
        const nock = merge(aim, { RightUpperArm: rot(60, 0, -40), RightLowerArm: rot(95) });
        const draw = merge(aim, { RightUpperArm: rot(0, -40, 88), RightLowerArm: rot(150) });
        const loose = merge(aim, { RightUpperArm: rot(0, -60, 95), RightLowerArm: rot(95) });
        const rest = { UpperTorso: rot(0), Head: rot(0), LeftUpperArm: rot(20, 0, -8), LeftLowerArm: rot(20), LeftHand: rot(0), RightUpperArm: rot(0), RightLowerArm: rot(0) };
        const keys = [kf(0, rest), kf(0.25, nock)];
        const markers = [];
        [0.45, 0.85, 1.25].forEach((t) => {
          keys.push(kf(t, draw, 'Cubic', 'Out'));
          keys.push(kf(r(t + 0.08), loose, 'Cubic', 'InOut'));
          // Rapid fire: the hand goes straight back to the string, no re-nock.
          markers.push({ time: r(t + 0.02), name: 'Shoot', value: '' });
        });
        keys.push(kf(1.75, rest));
        return anim('BowRapid', 'Action', false, 1.75, keys, markers);
      },
    },

    // ---- Sword & shield (ShieldBlock is above) ----
    {
      id: 'sns_combo', cat: 'sns', label: 'ดาบโล่: ฟัน 2 ครั้ง + กระแทกโล่ (Combo)', prop: 'swordshield',
      make: () => {
        // Guard: left forearm upright in front, shield turned to face forward (as in ShieldBlock).
        const shield = { LeftUpperArm: rot(50, 0, 25), LeftLowerArm: rot(105), LeftHand: rot(0), LeftHandle: rot(0, 90) };
        const ready = merge(shield, { RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40), UpperTorso: rot(0, 10), Head: rot(0, -8) });
        return anim('SwordShieldCombo', 'Action', false, 1.3, [
          kf(0, merge(ready), 'Cubic', 'Out'),
          kf(0.12, merge(shield, turn(5, -20), { RightUpperArm: rot(150, 0, 30), RightLowerArm: rot(30), RightHand: rot(10) }), 'Cubic', 'In'),
          kf(0.24, merge(shield, turn(-12, 25), { RightUpperArm: rot(35, 0, -30), RightLowerArm: rot(5), RightHand: rot(-50) }), 'Cubic', 'Out'),
          kf(0.42, merge(shield, turn(-5, 35), { RightUpperArm: rot(70, 0, -55), RightLowerArm: rot(30), RightHand: rot(-45, 60) }), 'Cubic', 'In'),
          kf(0.56, merge(shield, turn(-5, -30), { RightUpperArm: rot(80, 0, 70), RightLowerArm: rot(10), RightHand: rot(-45, -60) }), 'Cubic', 'Out'),
          kf(0.75, merge(turn(0, -25), { RightUpperArm: rot(20, 0, 10), RightLowerArm: rot(70), RightHand: rot(-40), LeftUpperArm: rot(10, 0, 10), LeftLowerArm: rot(90), LeftHand: rot(0), LeftHandle: rot(0, 90) }), 'Cubic', 'In'),
          kf(0.88, merge(turn(-10, 30), { RightUpperArm: rot(10, 0, 10), RightLowerArm: rot(60), RightHand: rot(-40), LeftUpperArm: rot(85, 0, 15), LeftLowerArm: rot(15), LeftHand: rot(0), LeftHandle: rot(0, 0, 90) }), 'Cubic', 'Out'),
          kf(1.3, merge(ready)),
        ], [{ time: 0.21, name: 'Hit', value: '1' }, { time: 0.52, name: 'Hit', value: '2' }, { time: 0.86, name: 'Hit', value: 'Bash' }]);
      },
    },
  ];

  const CATEGORIES = [
    ['move', 'เคลื่อนที่ (ท่าพื้นฐาน Roblox)'],
    ['combat', 'ต่อสู้'],
    ['react', 'โดนตี / ตาย'],
    ['item', 'ไอเทม / อีโมต'],
    ['longsword', 'อาวุธ: ดาบยาว'],
    ['dual', 'อาวุธ: ดาบคู่'],
    ['greatsword', 'อาวุธ: ดาบใหญ่'],
    ['heavygun', 'อาวุธ: ปืนใหญ่'],
    ['bow', 'อาวุธ: ธนู'],
    ['sns', 'อาวุธ: ดาบโล่'],
  ];

  return {
    LIST,
    CATEGORIES,
    get: (id) => { const p = LIST.find((x) => x.id === id); return p ? p.make() : null; },
    info: (id) => LIST.find((x) => x.id === id) || null,
  };
});
