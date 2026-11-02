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
        LowerTorso: pos(o.lean, o.twist * s, 0, [0, o.bounce * Math.abs(c) - o.bounce * 0.6 - (o.drop || 0), 0]),
        UpperTorso: rot(o.chest, -o.twist * 1.6 * s, 0),
        Head: rot(-o.lean - o.chest, o.twist * 0.6 * s, 0),
        RightUpperLeg: rot(rHip, 0, 0),
        RightLowerLeg: rot(rKnee, 0, 0),
        RightFoot: rot(-(o.foot || 0.45) * (rHip + rKnee), 0, 0),
        LeftUpperLeg: rot(lHip, 0, 0),
        LeftLowerLeg: rot(lKnee, 0, 0),
        LeftFoot: rot(-(o.foot || 0.45) * (lHip + lKnee), 0, 0),
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
    if (!point) return Object.assign({}, base, right.poses); // one-handed
    const target = C.pointOn(rig, ms, 'Handle', point);
    const left = C.solveArmIK(rig, ms, 'Left', target);
    return Object.assign({}, base, right.poses, left.poses, { LeftHand: rot(0) });
  }
  /** Solve both arms so the hands reach points given in the UpperTorso frame. */
  function reach(base, rightPt, leftPt) {
    const rig = C.RIGS.R15;
    const ms = {};
    for (const [n, p] of Object.entries(base)) if (rig.byName[n]) ms[n] = C.poseToM(p);
    const torso = C.computeWorld(rig, ms).UpperTorso;
    const w = (v) => [0, 1, 2].map((i) => torso.p[i] + torso.r[i * 3] * v[0] + torso.r[i * 3 + 1] * v[1] + torso.r[i * 3 + 2] * v[2]);
    const out = Object.assign({}, base);
    if (rightPt) Object.assign(out, C.solveArmIK(rig, ms, 'Right', w(rightPt)).poses);
    if (leftPt) Object.assign(out, C.solveArmIK(rig, ms, 'Left', w(leftPt)).poses);
    return out;
  }
  const mirror = (poses) => C.mirrorPoses(C.RIGS.R15, poses);

  const ARM_JOINTS = ['RightUpperArm', 'RightLowerArm', 'RightHand', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand'];
  /**
   * wield() that remembers its previous result and starts each solve from it,
   * so the arms move smoothly from one combo key to the next.
   */
  function wielder(point, opts) {
    let prev = null;
    return (torso, grip, dir, extra) => {
      const seed = {};
      if (prev) for (const n of ARM_JOINTS) if (prev[n]) seed[n] = prev[n];
      prev = wield(merge(seed, torso), grip, dir, point, opts);
      return merge(prev, extra || {});
    };
  }

  /**
   * Long combo as one animation. Each step: windup `w` -> (optional `mid`
   * keys) -> strike `s` -> hold. Adds the step's event marker at each strike
   * (`event`, default "Hit"; "Fire"/"Shoot" for ranged steps) with the step
   * number as value, and "Window" at the end of every step except the last: a
   * game script stops the track there unless the player pressed attack again
   * (docs/GAME_CODE.md section 6). `marks`: extra markers at the windup or
   * strike, e.g. { at: 'windup', name: 'Charge', value: 'start' }.
   */
  function combo(name, start, steps, end) {
    let t = 0;
    const keys = [kf(0, start, 'Cubic', 'Out')];
    const markers = [];
    steps.forEach((st, i) => {
      t += st.tw || 0.16;
      keys.push(kf(r(t), st.w, 'Cubic', st.mid ? 'Out' : 'In'));
      const windupAt = t;
      const strikeStart = t;
      for (const m of st.mid || []) { t += st.tm || 0.08; keys.push(kf(r(t), m, 'Linear')); }
      t += st.ts || 0.12;
      keys.push(kf(r(t), st.s, 'Cubic', 'Out'));
      markers.push({ time: r(t - 0.02), name: st.event || 'Hit', value: String(i + 1) });
      if (st.move) markers.push({ time: r(strikeStart), name: 'Move', value: st.move });
      for (const m of st.marks || []) markers.push({ time: r((m.at === 'windup' ? windupAt : t - 0.02) + (m.dt || 0)), name: m.name, value: m.value || '' });
      t += st.th || 0.14;
      keys.push(kf(r(t), st.h || st.s, 'Cubic', 'InOut'));
      if (i < steps.length - 1) markers.push({ time: r(t), name: 'Window', value: String(i + 1) });
    });
    t += 0.45;
    keys.push(kf(r(t), end || start));
    markers.sort((a, b) => a.time - b.time);
    return anim(name, 'Action', false, r(t), keys, markers);
  }
  const LS_GRIP = [0, -0.6, 0], GS_GRIP = [0, -0.7, 0], HG_GRIP = [0, 0.3, -0.6];
  // Two-handed holds (see wield): b = small breathing offset in degrees.
  const LS = { guard: (b) => wield(turn(-2 - b, 15), [0, -0.35 - b * 0.005, -1.0], [0, 0.57, -0.82], LS_GRIP) };
  const GS = { low: (b) => wield(turn(-6 - b, 10), [0, -0.6 - b * 0.01, -0.9], [0, -0.45, -0.89], GS_GRIP) };
  const HG = { hold: (b) => wield(turn(-5 - b, 10), [-0.1, -0.65 - b * 0.01, -0.55], [0, 0, -1], HG_GRIP, { gun: true }) };
  // Boss base poses: wide, hunched, arms hanging forward; kneel on the right knee.
  const BOSS = {
    idle: (b) => merge(legs(25, -45, { spread: 16 }), { UpperTorso: rot(-12 + b * 3), Head: rot(10 - b * 2), RightUpperArm: rot(15, 0, 25 + b * 3), LeftUpperArm: rot(15, 0, -25 - b * 3), RightLowerArm: rot(30), LeftLowerArm: rot(30) }),
    kneel: { LowerTorso: pos(0, 0, 0, [0, -0.85, 0]), RightUpperLeg: rot(0, 0, 8), RightLowerLeg: rot(-90), RightFoot: rot(0), LeftUpperLeg: rot(90, 0, -8), LeftLowerLeg: rot(-90), LeftFoot: rot(0) },
  };
  // Small monster / minion: crouched, hunched, arms dangling like claws.
  const MINION = {
    idle: (b, tilt) => merge(legs(40 - b * 5, -75 + b * 10, { spread: 12 }), { UpperTorso: rot(-30 + b * 3), Head: rot(30 - b * 3, 0, tilt || 0), RightUpperArm: rot(30, 0, 20 + b * 4), LeftUpperArm: rot(30, 0, -20 - b * 4), RightLowerArm: rot(40), LeftLowerArm: rot(40), RightHand: rot(-20), LeftHand: rot(-20) }),
  };
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
        ], [{ time: 0.05, name: 'Move', value: 'forward 28 0.45' }]);
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

    // ===== More moves (v0.5) =====
    {
      id: 'draw', cat: 'combat', label: 'ชักอาวุธจากหลัง (Draw weapon)', prop: 'sword',
      make: () => anim('DrawWeapon', 'Action', false, 0.85, [
        kf(0, { UpperTorso: rot(0), Head: rot(0), RightUpperArm: rot(0), RightLowerArm: rot(0), RightHand: rot(0) }, 'Cubic', 'InOut'),
        kf(0.22, { UpperTorso: rot(4, -12), Head: rot(0, 10), RightUpperArm: rot(150, 0, 25), RightLowerArm: rot(120), RightHand: rot(0) }, 'Cubic', 'Out'),
        kf(0.38, { UpperTorso: rot(6, -6), Head: rot(-4, 6), RightUpperArm: rot(175, 0, 15), RightLowerArm: rot(30), RightHand: rot(0) }, 'Linear'),
        kf(0.52, { UpperTorso: rot(2, 0), Head: rot(0), RightUpperArm: rot(150, 0, 10), RightLowerArm: rot(10), RightHand: rot(-50) }, 'Cubic', 'Out'),
        kf(0.85, { UpperTorso: rot(0), Head: rot(0), RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40) }),
      ], [{ time: 0.22, name: 'Grab', value: '' }]),
    },
    {
      id: 'stagger', cat: 'react', label: 'เซถอยหลัง (Stagger)', prop: 'none',
      make: () => anim('Stagger', 'Action2', false, 0.9, [
        kf(0, merge(BODY_REST), 'Cubic', 'Out'),
        kf(0.1, merge(STAND, { LowerTorso: pos(8, 0, 0, [0, -0.05, 0.2]), UpperTorso: rot(15, 10, 5), Head: rot(20, -6), RightUpperArm: rot(40, 0, 40), LeftUpperArm: rot(20, 0, -35), RightLowerArm: rot(30), LeftLowerArm: rot(40) }), 'Cubic', 'InOut'),
        kf(0.35, { LowerTorso: pos(6, 0, 0, [0, -0.15, 0.45]), UpperTorso: rot(10, 6, 3), Head: rot(12, -4), RightUpperLeg: rot(-25, 0, 4), RightLowerLeg: rot(-25), RightFoot: rot(20), LeftUpperLeg: rot(15, 0, -4), LeftLowerLeg: rot(-20), LeftFoot: rot(5), RightUpperArm: rot(30, 0, 35), LeftUpperArm: rot(15, 0, -30), RightLowerArm: rot(25), LeftLowerArm: rot(30) }, 'Cubic', 'InOut'),
        kf(0.55, merge(legs(15, -25), { UpperTorso: rot(-8), Head: rot(4), RightUpperArm: rot(10, 0, 15), LeftUpperArm: rot(10, 0, -15), RightLowerArm: rot(20), LeftLowerArm: rot(20) }), 'Cubic', 'InOut'),
        kf(0.9, merge(BODY_REST)),
      ]),
    },
    {
      id: 'knockdown', cat: 'react', label: 'ล้มแล้วลุก (Knockdown & get up)', prop: 'none',
      make: () => {
        const lying = { LowerTorso: pos(85, 0, 0, [0, -1.55, 0.9]), UpperTorso: rot(5), Head: rot(-10, 15, 0), RightUpperLeg: rot(5, 0, 10), LeftUpperLeg: rot(15, 0, -8), RightLowerLeg: rot(-10), LeftLowerLeg: rot(-35), RightFoot: rot(20), LeftFoot: rot(20), RightUpperArm: rot(0, 0, 60), LeftUpperArm: rot(10, 0, -55), RightLowerArm: rot(15), LeftLowerArm: rot(25) };
        const sitting = { LowerTorso: pos(0, 0, 0, [0, -1.45, 0.3]), UpperTorso: rot(-15), Head: rot(5), RightUpperLeg: rot(85, 0, 8), LeftUpperLeg: rot(70, 0, -8), RightLowerLeg: rot(-15), LeftLowerLeg: rot(-60), RightFoot: rot(0), LeftFoot: rot(20), RightUpperArm: rot(-35, 0, 25), LeftUpperArm: rot(-35, 0, -25), RightLowerArm: rot(10), LeftLowerArm: rot(10) };
        return anim('Knockdown', 'Action3', false, 2.6, [
          kf(0, merge(BODY_REST), 'Cubic', 'Out'),
          kf(0.12, merge(STAND, { LowerTorso: pos(10, 0, 0, [0, -0.05, 0.3]), UpperTorso: rot(20, 0, 4), Head: rot(25), RightUpperArm: rot(35, 0, 30), LeftUpperArm: rot(35, 0, -30), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Cubic', 'In'),
          kf(0.45, merge(legs(50, -90, { spread: 10 }), { LowerTorso: pos(40, 0, 0, [0, -0.9, 0.6]), UpperTorso: rot(10), Head: rot(-15), RightUpperArm: rot(60, 0, 40), LeftUpperArm: rot(60, 0, -40), RightLowerArm: rot(20), LeftLowerArm: rot(20) }), 'Cubic', 'In'),
          kf(0.7, lying, 'Bounce', 'Out'),
          kf(1.3, lying, 'Cubic', 'InOut'),
          kf(1.7, sitting, 'Cubic', 'InOut'),
          kf(2.05, merge(legs(80, -120, { spread: 10, lean: -15 }), { UpperTorso: rot(-20), Head: rot(25), RightUpperArm: rot(40, 0, 10), LeftUpperArm: rot(40, 0, -10), RightLowerArm: rot(40), LeftLowerArm: rot(40) }), 'Cubic', 'Out'),
          kf(2.6, merge(BODY_REST)),
        ], [{ time: 0.7, name: 'Land', value: '' }]);
      },
    },
    {
      id: 'victory', cat: 'item', label: 'ท่าชนะ (Victory)', prop: 'sword',
      make: () => {
        const up = (b) => ({ UpperTorso: rot(6 + b, 0), Head: rot(15 + b, 0), RightUpperArm: rot(170 + b, 0, 10), RightLowerArm: rot(5), RightHand: rot(-80), LeftUpperArm: rot(-10, 0, -40), LeftLowerArm: rot(95), LeftHand: rot(0) });
        return anim('Victory', 'Action', false, 2.0, [
          kf(0, merge(UPPER_REST), 'Cubic', 'In'),
          kf(0.18, { UpperTorso: rot(2), Head: rot(6), RightUpperArm: rot(90, 0, 8), RightLowerArm: rot(30), RightHand: rot(-50), LeftUpperArm: rot(-5, 0, -25), LeftLowerArm: rot(60), LeftHand: rot(0) }, 'Linear'),
          kf(0.35, up(4), 'Cubic', 'Out'),
          kf(0.55, up(0), 'Cubic', 'InOut'),
          kf(2.0, up(1)),
        ], [{ time: 0.35, name: 'Cheer', value: '' }]);
      },
    },

    // ---- Long sword ----
    {
      id: 'ls_spin', cat: 'longsword', label: 'ดาบยาว: หมุนตัวฟัน (Spin slash)', prop: 'longsword',
      make: () => {
        // Arms hold the sword out to the right; the whole body turns once (90° steps).
        const arms = wield(turn(-6, 0), [0.75, -0.25, -0.85], [0.75, 0, -0.65], LS_GRIP);
        const k = (t, y, e) => kf(t, merge(arms, STAND, { LowerTorso: pos(0, y, 0, [0, -0.1, 0]) }), e || 'Linear');
        return anim('LongSwordSpin', 'Action', false, 1.2, [
          kf(0, merge(LS.guard(0), STAND), 'Cubic', 'In'),
          k(0.15, 0), k(0.3, -90), k(0.45, 180), k(0.6, 90), k(0.75, 0, 'Cubic'),
          kf(1.2, merge(LS.guard(0), STAND)),
        ], [{ time: 0.35, name: 'Hit', value: '1' }, { time: 0.6, name: 'Hit', value: '2' }]);
      },
    },
    {
      id: 'ls_quickdraw', cat: 'longsword', label: 'ดาบยาว: ชักดาบฟันเร็ว (Quick draw)', prop: 'longsword',
      make: () => {
        const sheath = (b) => merge(wield(turn(-10, 25), [-0.55, -0.9 - b * 0.01, -0.45], [-0.2, -0.25, 0.95], [0, 0.45, 0]), legs(45 + b, -80 - b * 2, { spread: 12 }));
        const leftHip = { LeftUpperArm: rot(-10, 0, -15), LeftLowerArm: rot(30), LeftHand: rot(0) };
        return anim('LongSwordQuickDraw', 'Action', false, 1.9, [
          kf(0, merge(LS.guard(0), STAND), 'Cubic', 'InOut'),
          kf(0.3, sheath(0), 'Linear'),
          kf(0.75, sheath(2), 'Cubic', 'In'),
          kf(0.8, merge(wield(turn(-8, 10), [0, -0.6, -1.0], [-0.3, 0, -0.95], null), leftHip, legs(42, -75, { spread: 12 })), 'Linear'),
          kf(0.86, merge(wield(turn(-5, -30), [0.9, -0.3, -0.9], [0.95, 0.05, -0.3], null), leftHip, legs(40, -70, { spread: 12 })), 'Cubic', 'Out'),
          kf(1.3, merge(wield(turn(-5, -32), [0.9, -0.28, -0.88], [0.95, 0.05, -0.3], null), leftHip, legs(38, -68, { spread: 12 })), 'Cubic', 'InOut'),
          kf(1.9, merge(LS.guard(0), STAND)),
        ], [{ time: 0.83, name: 'Hit', value: 'Draw' }]);
      },
    },

    // ---- Dual blades ----
    {
      id: 'db_dash', cat: 'dual', label: 'ดาบคู่: พุ่งฟัน (Dash slash)', prop: 'dual',
      make: () => {
        const lunge = { LowerTorso: pos(-20, 0, 0, [0, -0.45, -0.3]), RightUpperLeg: rot(80, 0, 4), RightLowerLeg: rot(-75), RightFoot: rot(15), LeftUpperLeg: rot(-10, 0, -4), LeftLowerLeg: rot(-35), LeftFoot: rot(30) };
        return anim('DualDash', 'Action', false, 1.0, [
          kf(0, merge(DB_GUARD, legs(30, -55, { spread: 10 })), 'Cubic', 'In'),
          kf(0.2, merge(lunge, { UpperTorso: rot(-15), Head: rot(25), RightUpperArm: rot(-50, 0, 30), LeftUpperArm: rot(-50, 0, -30), RightLowerArm: rot(20), LeftLowerArm: rot(20), RightHand: rot(-20), LeftHand: rot(-20) }), 'Cubic', 'In'),
          kf(0.35, merge(lunge, { UpperTorso: rot(-10), Head: rot(20), RightUpperArm: rot(60, 0, -45), LeftUpperArm: rot(60, 0, 45), RightLowerArm: rot(10), LeftLowerArm: rot(10), RightHand: rot(-30), LeftHand: rot(-30) }), 'Cubic', 'Out'),
          kf(0.6, merge(lunge, { UpperTorso: rot(-10), Head: rot(20), RightUpperArm: rot(55, 0, -45), LeftUpperArm: rot(55, 0, 45), RightLowerArm: rot(15), LeftLowerArm: rot(15), RightHand: rot(-30), LeftHand: rot(-30) }), 'Cubic', 'InOut'),
          kf(1.0, merge(DB_GUARD, legs(30, -55, { spread: 10 }))),
        ], [{ time: 0.12, name: 'Move', value: 'forward 45 0.2' }, { time: 0.33, name: 'Hit', value: 'X' }]);
      },
    },
    {
      id: 'db_upper', cat: 'dual', label: 'ดาบคู่: ฟันเสยขึ้น (Rising slash)', prop: 'dual',
      make: () => {
        const arms = (x, z, e, h) => ({ RightUpperArm: rot(x, 0, z), LeftUpperArm: rot(x, 0, -z), RightLowerArm: rot(e), LeftLowerArm: rot(e), RightHand: rot(h), LeftHand: rot(h) });
        return anim('DualRising', 'Action', false, 1.1, [
          kf(0, merge(DB_GUARD, legs(30, -55, { spread: 10 })), 'Cubic', 'InOut'),
          kf(0.25, merge(arms(-30, 20, 30, -60), legs(55, -100, { spread: 12 }), { UpperTorso: rot(-20), Head: rot(15) }), 'Cubic', 'In'),
          kf(0.33, merge(arms(70, 25, 15, -20), legs(20, -30, { spread: 10 }), { UpperTorso: rot(-5), Head: rot(5) }), 'Linear'),
          kf(0.42, merge(arms(170, 25, 10, 0), { LowerTorso: pos(0, 0, 0, [0, 0.4, 0]), RightUpperLeg: rot(10, 0, 4), LeftUpperLeg: rot(25, 0, -4), RightLowerLeg: rot(-15), LeftLowerLeg: rot(-40), RightFoot: rot(20), LeftFoot: rot(20), UpperTorso: rot(10), Head: rot(-10) }), 'Cubic', 'In'),
          kf(0.65, merge(arms(150, 25, 20, 0), legs(30, -55, { spread: 10 }), { UpperTorso: rot(5), Head: rot(-5) }), 'Cubic', 'InOut'),
          kf(1.1, merge(DB_GUARD, legs(30, -55, { spread: 10 }))),
        ], [{ time: 0.36, name: 'Hit', value: 'Up' }]);
      },
    },

    // ---- Great sword ----
    {
      id: 'gs_tackle', cat: 'greatsword', label: 'ดาบใหญ่: กระแทกไหล่ (Shoulder tackle)', prop: 'greatsword',
      make: () => {
        const guard = (torso) => wield(torso, [-0.15, -0.4, -0.9], [0.1, 1, -0.15], GS_GRIP);
        return anim('GreatSwordTackle', 'Action', false, 1.3, [
          kf(0, merge(GS.low(0), legs(25, -45, { spread: 10 })), 'Cubic', 'InOut'),
          kf(0.3, merge(guard(turn(-5, 0)), legs(35, -65, { spread: 12 })), 'Cubic', 'In'),
          kf(0.45, merge(guard(turn(-10, -50)), legs(30, -55, { spread: 12, lean: -12, twist: -15 }), { LowerTorso: pos(-12, -15, 0, [0, -0.3, -0.5]) }), 'Cubic', 'Out'),
          kf(0.8, merge(guard(turn(-8, -45)), legs(30, -55, { spread: 12, lean: -10, twist: -12 }), { LowerTorso: pos(-10, -12, 0, [0, -0.3, -0.4]) }), 'Cubic', 'InOut'),
          kf(1.3, merge(GS.low(0), legs(25, -45, { spread: 10 }))),
        ], [{ time: 0.45, name: 'Hit', value: 'Tackle' }]);
      },
    },

    // ---- Heavy gun ----
    {
      id: 'hg_crouchfire', cat: 'heavygun', label: 'ปืนใหญ่: หมอบยิงต่อเนื่อง (Crouch fire)', prop: 'heavygun',
      make: () => {
        const crouch = legs(70, -120, { spread: 14 });
        const aim = merge(wield(turn(-12, 10), [-0.1, -0.6, -0.6], [0, 0.05, -1], HG_GRIP, { gun: true }), crouch);
        const armsOf = (p) => { const o = {}; for (const n of ['RightUpperArm', 'RightLowerArm', 'RightHand', 'LeftUpperArm', 'LeftLowerArm']) o[n] = p[n]; return o; };
        const kick = merge(wield(merge(armsOf(aim), turn(-8, 10)), [-0.1, -0.55, -0.5], [0, 0.15, -0.99], HG_GRIP, { gun: true }), crouch);
        return anim('HeavyGunCrouchFire', 'Action', true, 0.6, [
          kf(0, kick, 'Cubic', 'Out'), kf(0.15, aim, 'Linear'), kf(0.16, kick, 'Cubic', 'Out'), kf(0.3, aim, 'Linear'),
          kf(0.31, kick, 'Cubic', 'Out'), kf(0.45, aim, 'Linear'), kf(0.46, kick, 'Cubic', 'Out'), kf(0.6, kick),
        ], [0, 0.15, 0.3, 0.45].map((t) => ({ time: t, name: 'Fire', value: '' })));
      },
    },
    {
      id: 'hg_bash', cat: 'heavygun', label: 'ปืนใหญ่: ฟาดพานท้าย (Stock bash)', prop: 'heavygun',
      make: () => {
        // Solve keys in order, seeding each left arm with the previous one so it moves smoothly.
        let prev = HG.hold(0);
        const w = (torso, grip, dir) => {
          const seed = { LeftUpperArm: prev.LeftUpperArm, LeftLowerArm: prev.LeftLowerArm };
          prev = wield(merge(seed, torso), grip, dir, HG_GRIP, { gun: true });
          return prev;
        };
        return anim('HeavyGunBash', 'Action', false, 1.2, [
          kf(0, HG.hold(0), 'Cubic', 'InOut'),
          kf(0.25, w(turn(5, 25), [0.4, 0.0, -0.4], [0, 0.75, 0.65]), 'Cubic', 'In'),
          kf(0.33, w(turn(-4, 0), [0.25, -0.15, -0.7], [0, 0.6, 0.8]), 'Linear'),
          kf(0.4, w(turn(-12, -25), [0.05, -0.3, -1.0], [0, 0.35, 0.94]), 'Cubic', 'Out'),
          kf(0.7, w(turn(-12, -27), [0.05, -0.32, -0.98], [0, 0.35, 0.94]), 'Cubic', 'InOut'),
          kf(1.2, HG.hold(0)),
        ], [{ time: 0.38, name: 'Hit', value: 'Bash' }]);
      },
    },

    // ---- Bow ----
    {
      id: 'bow_charge', cat: 'bow', label: 'ธนู: ง้างนานยิงแรง (Charged shot)', prop: 'bow',
      make: () => {
        const aim = (lean) => ({ UpperTorso: rot(lean, -50), Head: rot(-lean, 45), LeftUpperArm: rot(0, -40, -88), LeftLowerArm: rot(0), LeftHand: rot(0) });
        const draw = (lean, y) => merge(aim(lean), { RightUpperArm: rot(0, y, 88), RightLowerArm: rot(150) });
        const rest = { UpperTorso: rot(0), Head: rot(0), LeftUpperArm: rot(20, 0, -8), LeftLowerArm: rot(20), LeftHand: rot(0), RightUpperArm: rot(0), RightLowerArm: rot(0) };
        return anim('BowCharged', 'Action', false, 2.1, [
          kf(0, rest), kf(0.3, merge(aim(0), { RightUpperArm: rot(60, 0, -40), RightLowerArm: rot(95) })),
          kf(0.7, draw(3, -40), 'Linear'), kf(0.9, draw(4, -43), 'Linear'), kf(1.1, draw(4, -41), 'Linear'),
          kf(1.3, draw(5, -44), 'Linear'), kf(1.45, draw(5, -44), 'Cubic', 'Out'),
          kf(1.55, merge(aim(2), { UpperTorso: rot(8, -55), RightUpperArm: rot(0, -70, 100), RightLowerArm: rot(80) }), 'Cubic', 'InOut'),
          kf(2.1, rest),
        ], [{ time: 0.7, name: 'Charge', value: 'start' }, { time: 1.3, name: 'Charge', value: 'full' }, { time: 1.46, name: 'Shoot', value: 'Power' }]);
      },
    },
    {
      id: 'bow_arc', cat: 'bow', label: 'ธนู: ยิงโค้งขึ้นฟ้า (Arc shot)', prop: 'bow',
      make: () => {
        const aim = { UpperTorso: rot(15, -50), Head: rot(20, 45), LeftUpperArm: rot(25, -40, -88), LeftLowerArm: rot(0), LeftHand: rot(0) };
        const rest = { UpperTorso: rot(0), Head: rot(0), LeftUpperArm: rot(20, 0, -8), LeftLowerArm: rot(20), LeftHand: rot(0), RightUpperArm: rot(0), RightLowerArm: rot(0) };
        return anim('BowArc', 'Action', false, 1.5, [
          kf(0, rest),
          kf(0.35, merge(aim, { RightUpperArm: rot(70, 0, -30), RightLowerArm: rot(80) })),
          kf(0.75, merge(aim, { RightUpperArm: rot(25, -40, 88), RightLowerArm: rot(150) }), 'Linear'),
          kf(0.9, merge(aim, { RightUpperArm: rot(25, -42, 88), RightLowerArm: rot(152) }), 'Cubic', 'Out'),
          kf(0.98, merge(aim, { RightUpperArm: rot(25, -60, 95), RightLowerArm: rot(95) }), 'Cubic', 'InOut'),
          kf(1.5, rest),
        ], [{ time: 0.9, name: 'Shoot', value: 'Arc' }]);
      },
    },

    // ---- Sword & shield ----
    {
      id: 'sns_jump', cat: 'sns', label: 'ดาบโล่: กระโดดฟัน (Jump slash)', prop: 'swordshield',
      make: () => {
        const shield = { LeftUpperArm: rot(50, 0, 25), LeftLowerArm: rot(105), LeftHand: rot(0), LeftHandle: rot(0, 90) };
        const ready = merge(shield, STAND, { RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40), UpperTorso: rot(0, 10), Head: rot(0, -8) });
        return anim('SwordShieldJump', 'Action', false, 1.3, [
          kf(0, ready, 'Cubic', 'In'),
          kf(0.2, merge(shield, legs(40, -75, { spread: 8 }), { UpperTorso: rot(-10), Head: rot(10), RightUpperArm: rot(110, 0, 20), RightLowerArm: rot(40), RightHand: rot(0) }), 'Cubic', 'Out'),
          kf(0.42, merge(shield, { LowerTorso: pos(0, 0, 0, [0, 1.0, -0.3]), RightUpperLeg: rot(60, 0, 6), RightLowerLeg: rot(-90), RightFoot: rot(20), LeftUpperLeg: rot(40, 0, -6), LeftLowerLeg: rot(-70), LeftFoot: rot(20), UpperTorso: rot(8), Head: rot(-6), RightUpperArm: rot(170, 0, 15), RightLowerArm: rot(30), RightHand: rot(10) }), 'Cubic', 'In'),
          kf(0.56, merge(shield, legs(45, -80, { spread: 10, lean: -6 }), { UpperTorso: rot(-25), Head: rot(22), RightUpperArm: rot(35, 0, -25), RightLowerArm: rot(5), RightHand: rot(-55) }), 'Cubic', 'Out'),
          kf(0.85, merge(shield, legs(42, -76, { spread: 10, lean: -6 }), { UpperTorso: rot(-22), Head: rot(20), RightUpperArm: rot(30, 0, -25), RightLowerArm: rot(5), RightHand: rot(-55) }), 'Cubic', 'InOut'),
          kf(1.3, ready),
        ], [{ time: 0.53, name: 'Hit', value: 'Jump' }, { time: 0.56, name: 'Land', value: '' }]);
      },
    },
    {
      id: 'sns_backstep', cat: 'sns', label: 'ดาบโล่: ถอยหลังฟัน (Backstep slash)', prop: 'swordshield',
      make: () => {
        const shield = { LeftUpperArm: rot(50, 0, 25), LeftLowerArm: rot(105), LeftHand: rot(0), LeftHandle: rot(0, 90) };
        const ready = merge(shield, STAND, { RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40), UpperTorso: rot(0, 10), Head: rot(0, -8) });
        const hop = (z, y) => ({ LowerTorso: pos(6, 0, 0, [0, y, z]), RightUpperLeg: rot(20, 0, 5), LeftUpperLeg: rot(-5, 0, -5), RightLowerLeg: rot(-45), LeftLowerLeg: rot(-30), RightFoot: rot(15), LeftFoot: rot(25) });
        return anim('SwordShieldBackstep', 'Action', false, 1.1, [
          kf(0, ready, 'Cubic', 'In'),
          kf(0.15, merge(shield, legs(30, -55, { spread: 8 }), turn(0, -35), { RightUpperArm: rot(75, 0, 70), RightLowerArm: rot(25), RightHand: rot(0, 90) }), 'Cubic', 'In'),
          kf(0.3, merge(shield, hop(0.45, 0.25), turn(-6, 5), { RightUpperArm: rot(80, 0, 10), RightLowerArm: rot(10), RightHand: rot(0, 90) }), 'Linear'),
          kf(0.42, merge(shield, legs(35, -60, { spread: 10 }), { LowerTorso: pos(0, 0, 0, [0, -0.3, 0.7]) }, turn(-8, 40), { RightUpperArm: rot(80, 0, -50), RightLowerArm: rot(8), RightHand: rot(0, 90) }), 'Cubic', 'Out'),
          kf(0.7, merge(shield, legs(32, -58, { spread: 10 }), { LowerTorso: pos(0, 0, 0, [0, -0.28, 0.65]) }, turn(-8, 38), { RightUpperArm: rot(75, 0, -45), RightLowerArm: rot(12), RightHand: rot(0, 90) }), 'Cubic', 'InOut'),
          kf(1.1, ready),
        ], [{ time: 0.2, name: 'Move', value: 'back 22 0.22' }, { time: 0.33, name: 'Hit', value: 'Back' }]);
      },
    },

    // ===== More moves (v0.6) =====
    {
      id: 'sprint', cat: 'move', label: 'วิ่งเร็ว (Sprint)', prop: 'none',
      make: () => cycle('Sprint', 'Movement', 0.5, 8, gait({
        hip: 58, hipBias: 12, kneeBase: 20, knee: 95, arm: 65, armOut: 6, elbow: 85, elbowSwing: 10,
        twist: 12, lean: -18, chest: -8, bounce: 0.2,
      })),
    },
    {
      id: 'walkback', cat: 'move', label: 'เดินถอยหลัง (Walk back)', prop: 'none',
      make: () => {
        const g = gait({ hip: 22, hipBias: 0, kneeBase: 6, knee: 30, arm: 14, armOut: 5, elbow: 16, elbowSwing: 6, twist: 4, lean: 3, chest: 2, bounce: 0.06 });
        return cycle('WalkBack', 'Movement', 1.1, 8, (ph) => g(-ph));
      },
    },
    {
      id: 'crouchwalk', cat: 'move', label: 'ย่อเดิน (Crouch walk)', prop: 'none',
      make: () => cycle('CrouchWalk', 'Movement', 1.2, 8, gait({
        hip: 25, hipBias: 45, kneeBase: 75, knee: 30, arm: 14, armOut: 10, elbow: 60, elbowSwing: 10,
        twist: 4, lean: -15, chest: -12, bounce: 0.04, drop: 0.55, foot: 1,
      })),
    },
    {
      id: 'swimidle', cat: 'move', label: 'ลอยตัวในน้ำ (Swim idle)', prop: 'none',
      make: () => {
        const p = (a, b) => ({
          UpperTorso: rot(-4), Head: rot(6),
          RightUpperArm: rot(15, 0, 30 + a), LeftUpperArm: rot(15, 0, -30 - a), RightLowerArm: rot(35), LeftLowerArm: rot(35),
          RightUpperLeg: rot(25 + b), LeftUpperLeg: rot(25 - b), RightLowerLeg: rot(-40 - b), LeftLowerLeg: rot(-40 + b),
        });
        return anim('SwimIdle', 'Movement', true, 1.6, [kf(0, p(0, 15)), kf(0.8, p(18, -15)), kf(1.6, p(0, 15))]);
      },
    },
    {
      id: 'idlelook', cat: 'move', label: 'ยืนมองรอบๆ (Idle 2)', prop: 'none',
      make: () => {
        const look = (y, t) => ({ UpperTorso: rot(0, t), Head: rot(-3, y), RightUpperArm: rot(0, 0, 5), LeftUpperArm: rot(0, 0, -5), RightLowerArm: rot(8), LeftLowerArm: rot(8) });
        return anim('IdleLook', 'Idle', true, 4.0, [
          kf(0, look(0, 0)), kf(1.0, look(40, 8)), kf(1.6, look(42, 8)), kf(2.6, look(-40, -8)), kf(3.2, look(-42, -8)), kf(4.0, look(0, 0)),
        ]);
      },
    },
    {
      id: 'ride', cat: 'move', label: 'ขี่สัตว์ (Ride)', prop: 'none',
      make: () => {
        const p = (b) => ({
          LowerTorso: pos(-5 + b * 4, 0, 0, [0, -0.05 + b * 0.08, 0]), UpperTorso: rot(-6 - b * 3), Head: rot(8 + b * 3),
          RightUpperLeg: rot(75, 0, 28), LeftUpperLeg: rot(75, 0, -28), RightLowerLeg: rot(-85), LeftLowerLeg: rot(-85), RightFoot: rot(10), LeftFoot: rot(10),
          RightUpperArm: rot(35 + b * 4, 0, -10), LeftUpperArm: rot(35 + b * 4, 0, 10), RightLowerArm: rot(70), LeftLowerArm: rot(70),
        });
        return anim('Ride', 'Movement', true, 0.8, [kf(0, p(0)), kf(0.4, p(1)), kf(0.8, p(0))]);
      },
    },
    {
      id: 'sidestep', cat: 'combat', label: 'หลบด้านข้าง (Side dodge)', prop: 'none',
      make: () => {
        const air = { LowerTorso: pos(0, 0, 10, [-0.35, 0.1, 0]), UpperTorso: rot(-5, 0, 8), Head: rot(4, 0, -8),
          LeftUpperLeg: rot(10, 0, -30), LeftLowerLeg: rot(-15), RightUpperLeg: rot(15, 0, -5), RightLowerLeg: rot(-45), RightFoot: rot(20), LeftFoot: rot(10),
          RightUpperArm: rot(20, 0, 45), LeftUpperArm: rot(20, 0, -55), RightLowerArm: rot(30), LeftLowerArm: rot(20) };
        return anim('SideDodge', 'Action', false, 0.6, [
          kf(0, merge(BODY_REST), 'Cubic', 'Out'),
          kf(0.1, merge(UPPER_REST, legs(30, -55, { spread: 8 }), { UpperTorso: rot(-8, 0, -6) }), 'Cubic', 'Out'),
          kf(0.25, air, 'Cubic', 'In'),
          kf(0.38, merge(UPPER_REST, legs(35, -65, { spread: 14 }), { UpperTorso: rot(-10, 0, 6), RightUpperArm: rot(15, 0, 25), LeftUpperArm: rot(15, 0, -30) }), 'Cubic', 'InOut'),
          kf(0.6, merge(BODY_REST)),
        ], [{ time: 0.1, name: 'Move', value: 'left 30 0.25' }]);
      },
    },
    {
      id: 'rollback', cat: 'combat', label: 'ม้วนถอยหลัง (Back roll)', prop: 'none',
      make: () => {
        const tuck = { RightUpperLeg: rot(110, 0, 5), LeftUpperLeg: rot(110, 0, -5), RightLowerLeg: rot(-130), LeftLowerLeg: rot(-130), RightUpperArm: rot(70, 0, -20), LeftUpperArm: rot(70, 0, 20), RightLowerArm: rot(110), LeftLowerArm: rot(110), UpperTorso: rot(-30), Head: rot(-35) };
        const k = (t, x, y) => kf(t, merge(tuck, { LowerTorso: pos(x, 0, 0, [0, y, 0]) }), 'Linear');
        return anim('BackRoll', 'Action', false, 0.85, [
          kf(0, merge(BODY_REST), 'Cubic', 'In'),
          k(0.12, 25, -0.45), k(0.24, 115, -0.55), k(0.36, -155, -0.55), k(0.48, -65, -0.5),
          kf(0.6, merge(tuck, { LowerTorso: pos(0, 0, 0, [0, -0.6, 0]) }), 'Cubic', 'Out'),
          kf(0.85, merge(BODY_REST)),
        ], [{ time: 0.05, name: 'Move', value: 'back 26 0.45' }]);
      },
    },
    {
      id: 'uppercut', cat: 'combat', label: 'อัปเปอร์คัต (Uppercut)', prop: 'none',
      make: () => anim('Uppercut', 'Action', false, 0.7, [
        kf(0, merge(GUARD, legs(25, -45)), 'Cubic', 'Out'),
        kf(0.14, merge(GUARD, legs(45, -85, { spread: 8 }), { UpperTorso: rot(-14, -15), Head: rot(10, 12), RightUpperArm: rot(10, 0, -10), RightLowerArm: rot(100) }), 'Cubic', 'In'),
        kf(0.25, merge(GUARD, legs(5, -10, { spread: 6 }), { UpperTorso: rot(10, 30), Head: rot(-8, -24), RightUpperArm: rot(150, 0, -20), RightLowerArm: rot(55), LeftUpperArm: rot(50, 0, 15) }), 'Cubic', 'Out'),
        kf(0.4, merge(GUARD, legs(10, -18, { spread: 6 }), { UpperTorso: rot(8, 28), Head: rot(-6, -22), RightUpperArm: rot(145, 0, -20), RightLowerArm: rot(60) }), 'Cubic', 'InOut'),
        kf(0.7, merge(GUARD, legs(25, -45))),
      ], [{ time: 0.23, name: 'Hit', value: 'Uppercut' }]),
    },
    {
      id: 'sweepkick', cat: 'combat', label: 'เตะกวาดหมุนตัว (Sweep kick)', prop: 'none',
      make: () => {
        // Low crouch with the right leg out to the side; the body turns once (90° steps).
        const base = merge(legs(70, -120, { spread: 0 }), {
          RightUpperLeg: rot(10, 0, 75), RightLowerLeg: rot(-5), RightFoot: rot(0),
          UpperTorso: rot(-25), Head: rot(20), RightUpperArm: rot(55, 0, -10), LeftUpperArm: rot(55, 0, 10), RightLowerArm: rot(10), LeftLowerArm: rot(10),
        });
        const k = (t, y, e) => kf(t, merge(base, { LowerTorso: pos(0, y, 0, [0, -0.95, 0]) }), e || 'Linear');
        return anim('SweepKick', 'Action', false, 1.1, [
          kf(0, merge(GUARD, legs(25, -45)), 'Cubic', 'Out'),
          k(0.15, 0), k(0.3, -90), k(0.45, 180), k(0.6, 90), k(0.75, 0, 'Cubic'),
          kf(1.1, merge(GUARD, legs(25, -45))),
        ], [{ time: 0.45, name: 'Hit', value: 'Sweep' }]);
      },
    },
    {
      id: 'groundpound', cat: 'combat', label: 'กระโดดทุบพื้น (Ground pound)', prop: 'none',
      make: () => anim('GroundPound', 'Action', false, 1.3, [
        kf(0, merge(GUARD, legs(25, -45)), 'Cubic', 'In'),
        kf(0.2, merge(legs(50, -95, { spread: 10 }), { UpperTorso: rot(-15), Head: rot(15), RightUpperArm: rot(-30, 0, 15), LeftUpperArm: rot(-30, 0, -15), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Cubic', 'Out'),
        kf(0.42, { LowerTorso: pos(0, 0, 0, [0, 0.9, 0]), RightUpperLeg: rot(55, 0, 8), LeftUpperLeg: rot(55, 0, -8), RightLowerLeg: rot(-90), LeftLowerLeg: rot(-90), RightFoot: rot(20), LeftFoot: rot(20), UpperTorso: rot(8), Head: rot(-6), RightUpperArm: rot(170, 0, 15), LeftUpperArm: rot(170, 0, -15), RightLowerArm: rot(30), LeftLowerArm: rot(30) }, 'Cubic', 'In'),
        kf(0.56, merge(legs(60, -110, { spread: 12, lean: -10 }), { UpperTorso: rot(-35), Head: rot(30), RightUpperArm: rot(70, 0, -10), LeftUpperArm: rot(70, 0, 10), RightLowerArm: rot(10), LeftLowerArm: rot(10) }), 'Cubic', 'Out'),
        kf(0.9, merge(legs(58, -106, { spread: 12, lean: -10 }), { UpperTorso: rot(-32), Head: rot(28), RightUpperArm: rot(68, 0, -10), LeftUpperArm: rot(68, 0, 10), RightLowerArm: rot(12), LeftLowerArm: rot(12) }), 'Cubic', 'InOut'),
        kf(1.3, merge(GUARD, legs(25, -45))),
      ], [{ time: 0.42, name: 'Move', value: 'up 30 0.15' }, { time: 0.55, name: 'Hit', value: 'Pound' }, { time: 0.56, name: 'Land', value: '' }]),
    },
    {
      id: 'shieldhit', cat: 'sns', label: 'ดาบโล่: รับแรงกระแทก (Block impact)', prop: 'swordshield',
      make: () => {
        const block = { LeftUpperArm: rot(75, 0, 28), LeftLowerArm: rot(95), LeftHand: rot(0), LeftHandle: rot(0, 90), RightUpperArm: rot(15, 0, 8), RightLowerArm: rot(55), RightHand: rot(-35) };
        return anim('BlockImpact', 'Action2', false, 0.6, [
          kf(0, merge(block, turn(-6, 12), legs(25, -45)), 'Cubic', 'Out'),
          kf(0.08, merge(block, turn(10, 15), legs(30, -55), { LowerTorso: pos(4, 0, 0, [0, -0.2, 0.4]), LeftUpperArm: rot(65, 0, 30), LeftLowerArm: rot(110) }), 'Cubic', 'InOut'),
          kf(0.25, merge(block, turn(4, 14), legs(30, -55), { LowerTorso: pos(2, 0, 0, [0, -0.2, 0.35]) }), 'Cubic', 'InOut'),
          kf(0.6, merge(block, turn(-6, 12), legs(25, -45))),
        ], [{ time: 0.0, name: 'Move', value: 'back 12 0.15' }]);
      },
    },
    {
      id: 'dance', cat: 'item', label: 'เต้น (Dance)', prop: 'none',
      make: () => {
        const a = { LowerTorso: pos(0, 0, -6, [0.15, -0.1, 0]), UpperTorso: rot(0, 0, 4), Head: rot(0, 0, -8),
          RightUpperArm: rot(160, 0, 20), RightLowerArm: rot(20), LeftUpperArm: rot(20, 0, -20), LeftLowerArm: rot(90),
          RightUpperLeg: rot(0, 0, 4), RightLowerLeg: rot(0), RightFoot: rot(0), LeftUpperLeg: rot(25, 0, -4), LeftLowerLeg: rot(-45), LeftFoot: rot(20) };
        const mid = merge(legs(20, -35, { spread: 6 }), { UpperTorso: rot(-4), Head: rot(4), RightUpperArm: rot(60, 0, 20), LeftUpperArm: rot(60, 0, -20), RightLowerArm: rot(90), LeftLowerArm: rot(90) });
        return anim('Dance', 'Action', true, 1.0, [kf(0, a), kf(0.25, mid), kf(0.5, mirror(a)), kf(0.75, mid), kf(1.0, a)]);
      },
    },
    {
      id: 'bowdown', cat: 'item', label: 'คำนับ (Bow)', prop: 'none',
      make: () => {
        const down = { LowerTorso: pos(-12, 0, 0, [0, 0, 0.1]), RightUpperLeg: rot(12), LeftUpperLeg: rot(12), UpperTorso: rot(-40), Head: rot(-10), RightUpperArm: rot(12, 0, 2), LeftUpperArm: rot(12, 0, -2), RightLowerArm: rot(5), LeftLowerArm: rot(5) };
        return anim('BowDown', 'Action', false, 1.6, [
          kf(0, merge(BODY_REST)), kf(0.5, down, 'Linear'), kf(1.0, down), kf(1.6, merge(BODY_REST)),
        ]);
      },
    },
    {
      id: 'clap', cat: 'item', label: 'ปรบมือ (Clap)', prop: 'none',
      make: () => {
        const open = reach({ UpperTorso: rot(0), Head: rot(4) }, [0.7, -0.1, -0.95], [-0.7, -0.1, -0.95]);
        const shut = reach({ UpperTorso: rot(-2), Head: rot(4) }, [0.13, -0.05, -1.05], [-0.13, -0.05, -1.05]);
        return anim('Clap', 'Action', true, 0.5, [kf(0, open, 'Cubic', 'In'), kf(0.18, shut, 'Cubic', 'Out'), kf(0.5, open)],
          [{ time: 0.18, name: 'Clap', value: '' }]);
      },
    },
    {
      id: 'point', cat: 'item', label: 'ชี้ไปข้างหน้า (Point)', prop: 'none',
      make: () => {
        const p = { UpperTorso: rot(0, 10), Head: rot(4, -8), RightUpperArm: rot(100, 0, -5), RightLowerArm: rot(0), RightHand: rot(0), LeftUpperArm: rot(-10, 0, -40), LeftLowerArm: rot(95) };
        return anim('Point', 'Action', false, 1.4, [kf(0, merge(UPPER_REST), 'Cubic', 'Out'), kf(0.3, p), kf(1.0, p), kf(1.4, merge(UPPER_REST))]);
      },
    },
    {
      id: 'sitground', cat: 'item', label: 'นั่งขัดสมาธิ (Sit on ground)', prop: 'none',
      make: () => {
        const p = (b) => ({
          LowerTorso: pos(0, 0, 0, [0, -1.72, 0]), UpperTorso: rot(-6 + b, 0), Head: rot(4 - b, 0),
          RightUpperLeg: rot(80, -25, 50), LeftUpperLeg: rot(80, 25, -50), RightLowerLeg: rot(-140), LeftLowerLeg: rot(-140), RightFoot: rot(0, 0, 0), LeftFoot: rot(0, 0, 0),
          RightUpperArm: rot(30, 0, -5), LeftUpperArm: rot(30, 0, 5), RightLowerArm: rot(40), LeftLowerArm: rot(40),
        });
        return anim('SitGround', 'Idle', true, 2.4, [kf(0, p(0)), kf(1.2, p(2.5)), kf(2.4, p(0))]);
      },
    },

    // ===== Long combos (v0.7): one animation, "Hit" per strike, "Window" between steps =====
    {
      id: 'cb_fist', cat: 'combo', label: 'คอมโบมือเปล่า 5 จังหวะ', prop: 'none',
      make: () => {
        const L = legs(25, -45);
        const g = (p) => merge(GUARD, L, p);
        return combo('ComboFist5', g({}), [
          { // 1 left jab
            w: g({ UpperTorso: rot(-5, 8), LeftUpperArm: rot(55, 0, 15), LeftLowerArm: rot(120) }), tw: 0.08,
            s: g({ UpperTorso: rot(-6, -18), Head: rot(4, 14), LeftUpperArm: rot(90, 0, 8), LeftLowerArm: rot(5) }), ts: 0.08, th: 0.1,
          },
          { // 2 right cross
            w: g({ UpperTorso: rot(-5, -15), RightUpperArm: rot(45, 0, -5), RightLowerArm: rot(120) }), tw: 0.08,
            s: g({ UpperTorso: rot(-8, 28), Head: rot(3, -22), RightUpperArm: rot(90, 0, -8), RightLowerArm: rot(5), LeftUpperArm: rot(55, 0, 20) }), ts: 0.09, th: 0.12,
          },
          { // 3 left hook
            w: g({ UpperTorso: rot(-4, 25), Head: rot(2, -20), LeftUpperArm: rot(80, 0, -55), LeftLowerArm: rot(90) }), tw: 0.12,
            s: g({ UpperTorso: rot(-6, -35), Head: rot(4, 28), LeftUpperArm: rot(85, 0, 15), LeftLowerArm: rot(95) }), ts: 0.1, th: 0.14,
          },
          { // 4 right uppercut
            w: merge(GUARD, legs(45, -85, { spread: 8 }), { UpperTorso: rot(-14, -15), Head: rot(10, 12), RightUpperArm: rot(10, 0, -10), RightLowerArm: rot(100) }), tw: 0.14,
            s: merge(GUARD, legs(5, -10, { spread: 6 }), { UpperTorso: rot(10, 30), Head: rot(-8, -24), RightUpperArm: rot(150, 0, -20), RightLowerArm: rot(55) }), ts: 0.1, th: 0.16,
          },
          { // 5 roundhouse kick (right)
            w: merge(GUARD, { LowerTorso: pos(0, 20, 8, [0, 0, 0]), LeftUpperLeg: rot(-5, 0, -8), LeftLowerLeg: rot(-10), RightUpperLeg: rot(55, 0, 35), RightLowerLeg: rot(-110), RightFoot: rot(0), UpperTorso: rot(0, -15) }), tw: 0.16,
            s: merge(GUARD, { LowerTorso: pos(0, 45, 18, [0, 0, 0]), LeftUpperLeg: rot(-5, 0, -18), LeftLowerLeg: rot(-10), RightUpperLeg: rot(70, 0, 60), RightLowerLeg: rot(-10), RightFoot: rot(20), UpperTorso: rot(0, -30, -8), Head: rot(0, -15, 8) }), ts: 0.1, th: 0.2,
          },
        ]);
      },
    },
    {
      id: 'cb_sword', cat: 'combo', label: 'คอมโบดาบมือเดียว 5 จังหวะ', prop: 'sword',
      make: () => {
        const W = wielder(null);
        const guardL = { LeftUpperArm: rot(25, 0, -12), LeftLowerArm: rot(60), LeftHand: rot(0) };
        const w = (torso, grip, dir, extra) => W(torso, grip, dir, merge(guardL, extra || {}));
        const start = merge(SWORD_READY, STAND);
        const spinArm = w(turn(-6, 0), [1.1, 0.05, -0.6], [0.8, 0, -0.6], STAND);
        const spin = (y) => merge(spinArm, { LowerTorso: pos(0, y, 0, [0, -0.1, 0]) });
        return combo('ComboSword5', start, [
          { w: w(turn(5, -25), [0.9, 1.0, -0.4], [0.3, 0.6, 0.75], STAND), s: w(turn(-12, 25), [-0.2, -0.5, -1.0], [-0.5, -0.5, -0.7], STAND) },
          { w: w(turn(-5, 35), [-0.3, 0, -0.8], [-0.9, 0.1, 0.4], STAND), s: w(turn(-6, -35), [0.9, 0, -0.9], [0.9, 0, -0.4], STAND) },
          {
            w: w(turn(-5, 30), [0.7, -0.2, -0.2], [0, 0, -1], legs(25, -45)),
            s: w(turn(-10, -15), [0.3, 0.1, -1.55], [0, 0, -1], merge(legs(30, -50, { spread: 8 }), { LowerTorso: pos(-6, 0, 0, [0, -0.25, -0.3]) })), move: 'forward 30 0.15',
          },
          { w: w(turn(-15, 20), [-0.3, -0.8, -0.8], [-0.4, -0.6, -0.7], legs(30, -55)), s: w(turn(8, -25), [0.8, 0.9, -0.8], [0.4, 0.8, -0.3], STAND) },
          { w: spin(0), mid: [spin(-90), spin(180), spin(90)], tm: 0.09, s: spin(0), ts: 0.09, th: 0.2 },
        ], start);
      },
    },
    {
      id: 'cb_longsword', cat: 'combo', label: 'คอมโบดาบยาว 6 จังหวะ', prop: 'longsword',
      make: () => {
        const w = wielder(LS_GRIP);
        const start = merge(LS.guard(0), STAND);
        return combo('ComboLongSword6', start, [
          { w: merge(w(turn(8, 5), [0.1, 1.1, -0.5], [0, -0.3, 0.95]), STAND), s: merge(w(turn(-15, 0), [0, -0.4, -1.05], [0, -0.35, -0.94]), legs(25, -45)) },
          { w: merge(w(turn(-15, 20), [-0.1, -0.6, -0.8], [-0.5, -0.5, -0.7]), legs(30, -55)), s: merge(w(turn(10, -20), [0.5, 1.0, -0.8], [0.3, 0.9, 0.3]), STAND) },
          { w: merge(w(turn(0, -40), [0.7, -0.1, -0.6], [0.8, 0.1, 0.6]), legs(20, -35)), s: merge(w(turn(-5, 40), [-0.2, -0.1, -0.95], [-0.8, 0, -0.6]), legs(25, -45)) },
          { w: merge(w(turn(-5, 45), [-0.2, -0.1, -0.75], [-0.85, 0.05, 0.5]), legs(25, -45)), s: merge(w(turn(-5, -40), [0.7, -0.1, -0.7], [0.8, 0, -0.6]), legs(25, -45)) },
          {
            w: merge(w(turn(-5, 25), [0.3, -0.4, -0.5], [0, 0.05, -1]), legs(30, -55)),
            s: merge(w(turn(-12, -10), [0.1, 0, -1.45], [0, 0, -1]), legs(30, -50, { spread: 8 }), { LowerTorso: pos(-6, 0, 0, [0, -0.25, -0.3]) }), move: 'forward 30 0.15',
          },
          {
            w: merge(w(turn(14, -5), [0.1, 1.2, -0.4], [0, -0.4, 0.9]), STAND), tw: 0.3,
            s: merge(w(turn(-25, 0), [0, -0.5, -1.0], [0, -0.55, -0.83]), legs(45, -80, { spread: 12, lean: -8 })), ts: 0.12, th: 0.3,
          },
        ], start);
      },
    },
    {
      id: 'cb_dual', cat: 'combo', label: 'คอมโบดาบคู่ 6 จังหวะ', prop: 'dual',
      make: () => {
        const L = legs(30, -55, { spread: 10 });
        const g = (p) => merge(DB_GUARD, L, p);
        const both = (x, z, e, h, hy) => ({ RightUpperArm: rot(x, 0, z), LeftUpperArm: rot(x, 0, -z), RightLowerArm: rot(e), LeftLowerArm: rot(e), RightHand: rot(h, hy || 0), LeftHand: rot(h, -(hy || 0)) });
        const spinArms = merge(both(10, 85, 10, -10), { UpperTorso: rot(-8), Head: rot(4) }, STAND);
        const spin = (y) => merge(spinArms, { LowerTorso: pos(0, y, 0, [0, -0.15, 0]) });
        return combo('ComboDual6', g({}), [
          { w: g({ RightUpperArm: rot(120, 0, 40), RightLowerArm: rot(40), RightHand: rot(0), UpperTorso: rot(0, -20) }), tw: 0.1, s: g({ RightUpperArm: rot(30, 0, -35), RightLowerArm: rot(10), RightHand: rot(-40), UpperTorso: rot(-10, 20) }), ts: 0.08, th: 0.08 },
          { w: g({ LeftUpperArm: rot(120, 0, -40), LeftLowerArm: rot(40), LeftHand: rot(0), UpperTorso: rot(0, 20) }), tw: 0.1, s: g({ LeftUpperArm: rot(30, 0, 35), LeftLowerArm: rot(10), LeftHand: rot(-40), UpperTorso: rot(-10, -20) }), ts: 0.08, th: 0.08 },
          { w: g(merge(both(70, -40, 30, 0, 90), { UpperTorso: rot(-8) })), tw: 0.12, s: g(merge(both(80, 70, 10, 0, 90), { UpperTorso: rot(-4) })), ts: 0.09, th: 0.12 },
          { w: g(merge(both(150, 30, 30, 0), { UpperTorso: rot(10) })), tw: 0.14, s: g(merge(both(40, -40, 10, -40), { UpperTorso: rot(-15) })), ts: 0.09, th: 0.14 },
          { w: spin(0), mid: [spin(90), spin(180), spin(-90), spin(0), spin(90), spin(180), spin(-90)], tm: 0.06, s: spin(0), ts: 0.06, th: 0.12 },
          {
            w: merge(both(-30, 20, 60, -40), legs(40, -75, { spread: 10 }), { UpperTorso: rot(-10) }), tw: 0.16,
            s: merge(both(90, -8, 5, -90), { LowerTorso: pos(-15, 0, 0, [0, -0.4, -0.35]), RightUpperLeg: rot(75, 0, 4), RightLowerLeg: rot(-75), RightFoot: rot(15), LeftUpperLeg: rot(-5, 0, -4), LeftLowerLeg: rot(-35), LeftFoot: rot(30), UpperTorso: rot(-10), Head: rot(20) }),
            ts: 0.1, th: 0.25, move: 'forward 40 0.18',
          },
        ], g({}));
      },
    },
    {
      id: 'cb_greatsword', cat: 'combo', label: 'คอมโบดาบใหญ่ 4 จังหวะ', prop: 'greatsword',
      make: () => {
        const w = wielder(GS_GRIP);
        const start = merge(GS.low(0), legs(25, -45, { spread: 10 }));
        const up = (t) => merge(w(turn(12, -10), [0.1, 1.2, -0.4], [0, -0.5, 0.87]), t);
        return combo('ComboGreatSword4', start, [
          { w: merge(w(turn(4, 0), [0.1, 0.4, -1.1], [0, 0.9, -0.43]), legs(20, -35, { spread: 11 })), tw: 0.2, mid: [up(legs(15, -25, { spread: 12 }))], tm: 0.2, s: merge(w(turn(-30, 5), [0, -0.5, -1.0], [0, -0.55, -0.83]), legs(45, -80, { spread: 14, lean: -8 })), ts: 0.14, th: 0.28 },
          { w: merge(w(turn(-25, 10), [0, -0.6, -0.95], [0, -0.5, -0.86]), legs(40, -72, { spread: 12 })), tw: 0.12, s: merge(w(turn(10, -15), [0.3, 1.0, -0.7], [0.1, 0.9, 0.4]), legs(10, -15, { spread: 10 })), ts: 0.16, th: 0.22 },
          { w: merge(w(turn(0, -50), [0.7, -0.3, -0.6], [0.8, 0.1, 0.6]), legs(25, -45, { spread: 12, twist: -20 })), tw: 0.3, s: merge(w(turn(-5, 45), [-0.2, -0.3, -0.9], [-0.8, 0, -0.6]), legs(30, -55, { spread: 12, twist: 20 })), ts: 0.2, th: 0.26 },
          {
            w: merge(w(turn(4, 0), [0.1, 0.4, -1.1], [0, 0.9, -0.43]), legs(40, -75, { spread: 12 })), tw: 0.25,
            mid: [up({ LowerTorso: pos(0, 0, 0, [0, 0.7, 0]), RightUpperLeg: rot(50, 0, 8), LeftUpperLeg: rot(50, 0, -8), RightLowerLeg: rot(-80), LeftLowerLeg: rot(-80), RightFoot: rot(20), LeftFoot: rot(20) })], tm: 0.22,
            s: merge(w(turn(-32, 5), [0, -0.55, -1.0], [0, -0.6, -0.8]), legs(55, -100, { spread: 14, lean: -10 })), ts: 0.14, th: 0.4, move: 'up 22 0.15',
          },
        ], start);
      },
    },
    {
      id: 'cb_sns', cat: 'combo', label: 'คอมโบดาบโล่ 5 จังหวะ', prop: 'swordshield',
      make: () => {
        const shield = { LeftUpperArm: rot(50, 0, 25), LeftLowerArm: rot(105), LeftHand: rot(0), LeftHandle: rot(0, 90) };
        const g = (p) => merge(shield, STAND, p);
        const start = g({ RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40), UpperTorso: rot(0, 10), Head: rot(0, -8) });
        return combo('ComboSwordShield5', start, [
          { w: g(merge(turn(5, -20), { RightUpperArm: rot(150, 0, 30), RightLowerArm: rot(30), RightHand: rot(10) })), s: g(merge(turn(-12, 25), { RightUpperArm: rot(35, 0, -30), RightLowerArm: rot(5), RightHand: rot(-50) })) },
          { w: g(merge(turn(-5, 35), { RightUpperArm: rot(70, 0, -55), RightLowerArm: rot(30), RightHand: rot(-45, 60) })), s: g(merge(turn(-5, -30), { RightUpperArm: rot(80, 0, 70), RightLowerArm: rot(10), RightHand: rot(-45, -60) })) },
          {
            w: merge(STAND, turn(0, -25), { RightUpperArm: rot(20, 0, 10), RightLowerArm: rot(70), RightHand: rot(-40), LeftUpperArm: rot(10, 0, 10), LeftLowerArm: rot(90), LeftHand: rot(0), LeftHandle: rot(0, 90) }), tw: 0.18,
            s: merge(legs(25, -45, { spread: 8 }), turn(-10, 30), { RightUpperArm: rot(10, 0, 10), RightLowerArm: rot(60), RightHand: rot(-40), LeftUpperArm: rot(85, 0, 15), LeftLowerArm: rot(15), LeftHand: rot(0), LeftHandle: rot(0, 0, 90) }), move: 'forward 20 0.12',
          },
          { w: g(merge(turn(-5, 25), { RightUpperArm: rot(20, 0, 10), RightLowerArm: rot(110), RightHand: rot(-110) })), tw: 0.14, s: merge(shield, legs(30, -50, { spread: 8 }), { LowerTorso: pos(-6, 0, 0, [0, -0.25, -0.3]) }, turn(-10, -15), { RightUpperArm: rot(90, 0, -5), RightLowerArm: rot(5), RightHand: rot(-90) }) },
          { w: g(merge(turn(-15, 20), legs(30, -55), { RightUpperArm: rot(10, 0, -30), RightLowerArm: rot(40), RightHand: rot(-90) })), tw: 0.16, s: g(merge(turn(8, -25), { RightUpperArm: rot(150, 0, 15), RightLowerArm: rot(20), RightHand: rot(0) })), ts: 0.12, th: 0.25 },
        ], start);
      },
    },

    {
      id: 'cb_heavygun', cat: 'combo', label: 'คอมโบปืนใหญ่ 5 จังหวะ', prop: 'heavygun',
      make: () => {
        const w = wielder(HG_GRIP, { gun: true });
        const L = legs(25, -45, { spread: 12 });
        const aim = (b) => merge(w(turn(-5 - b, 10), [-0.1, -0.65, -0.55], [0, 0, -1]), L);
        const kick = () => merge(w(turn(8, 8), [0, -0.5, -0.45], [0, 0.3, -0.95]), L);
        const start = merge(HG.hold(0), L);
        return combo('ComboHeavyGun5', start, [
          { w: aim(0), tw: 0.12, s: kick(), ts: 0.06, th: 0.22, event: 'Fire' },
          { w: aim(1), tw: 0.14, s: kick(), ts: 0.06, th: 0.22, event: 'Fire' },
          { // stock bash
            w: merge(w(turn(5, 25), [0.4, 0, -0.4], [0, 0.75, 0.65]), L), tw: 0.2,
            mid: [merge(w(turn(-4, 0), [0.25, -0.15, -0.7], [0, 0.6, 0.8]), L)], tm: 0.07,
            s: merge(w(turn(-12, -25), [0.05, -0.3, -1.0], [0, 0.35, 0.94]), legs(30, -50, { spread: 12 })), ts: 0.07, th: 0.2,
          },
          { // swing the gun like a club, right to left
            w: merge(w(turn(0, -40), [0.75, -0.3, -0.45], [0.8, 0, 0.6]), legs(25, -45, { spread: 12, twist: -15 })), tw: 0.22,
            s: merge(w(turn(-5, 40), [-0.2, -0.3, -0.9], [-0.8, 0, -0.6]), legs(30, -55, { spread: 12, twist: 15 })), ts: 0.14, th: 0.22,
          },
          { // point-blank blast with a big kick back
            w: merge(w(turn(-14, 8), [-0.1, -0.7, -0.6], [0, 0.05, -1]), legs(40, -75, { spread: 14 })), tw: 0.3,
            s: merge(w(turn(16, 5), [0, -0.4, -0.3], [0, 0.5, -0.85]), legs(30, -55, { spread: 14 }), { LowerTorso: pos(6, 0, 0, [0, -0.3, 0.35]) }),
            ts: 0.06, th: 0.4, event: 'Fire', move: 'back 18 0.2',
          },
        ], start);
      },
    },
    {
      id: 'cb_bow', cat: 'combo', label: 'คอมโบธนู 5 จังหวะ', prop: 'bow',
      make: () => {
        const aim = (lean) => ({ UpperTorso: rot(lean || 0, -50), Head: rot(-(lean || 0), 45), LeftUpperArm: rot(0, -40, -88), LeftLowerArm: rot(0), LeftHand: rot(0) });
        const draw = (lean, extra) => merge(aim(lean), { RightUpperArm: rot(0, -40, 88), RightLowerArm: rot(150) }, extra || {});
        const loose = (lean, extra) => merge(aim(lean), { RightUpperArm: rot(0, -60, 95), RightLowerArm: rot(95) }, extra || {});
        const rest = merge(STAND, { UpperTorso: rot(0), Head: rot(0), LeftUpperArm: rot(20, 0, -8), LeftLowerArm: rot(20), LeftHand: rot(0), RightUpperArm: rot(0), RightLowerArm: rot(0) });
        const hop = { LowerTorso: pos(6, 0, 0, [0, 0.2, 0.45]), RightUpperLeg: rot(20, 0, 5), LeftUpperLeg: rot(-5, 0, -5), RightLowerLeg: rot(-45), LeftLowerLeg: rot(-30), RightFoot: rot(15), LeftFoot: rot(25) };
        return combo('ComboBow5', rest, [
          { w: draw(0, STAND), tw: 0.3, s: loose(0, STAND), ts: 0.06, th: 0.1, event: 'Shoot' },
          { w: draw(0, STAND), tw: 0.2, s: loose(0, STAND), ts: 0.06, th: 0.1, event: 'Shoot' },
          { // swing the bow limb at a close enemy
            w: merge(STAND, { UpperTorso: rot(0, -60), Head: rot(0, 40), LeftUpperArm: rot(10, 0, -70), LeftLowerArm: rot(30), LeftHand: rot(0), RightUpperArm: rot(20, 0, 10), RightLowerArm: rot(60) }), tw: 0.18,
            s: merge(legs(20, -35, { spread: 8 }), { UpperTorso: rot(-10, 30), Head: rot(5, -20), LeftUpperArm: rot(80, 0, 40), LeftLowerArm: rot(10), LeftHand: rot(0), RightUpperArm: rot(10, 0, 20), RightLowerArm: rot(50) }), ts: 0.12, th: 0.16,
          },
          { // hop back and shoot while landing
            w: draw(0, hop), tw: 0.22,
            s: loose(0, merge(legs(35, -60, { spread: 10 }), { LowerTorso: pos(0, 0, 0, [0, -0.3, 0.7]) })), ts: 0.08, th: 0.18, event: 'Shoot', move: 'back 22 0.22',
          },
          { // long draw, then a power shot
            w: draw(3, STAND), tw: 0.3,
            mid: [draw(4, merge(STAND, { RightUpperArm: rot(0, -43, 88) })), draw(5, merge(STAND, { RightUpperArm: rot(0, -41, 88) })), draw(5, merge(STAND, { RightUpperArm: rot(0, -44, 88) }))], tm: 0.2,
            s: loose(2, merge(STAND, { UpperTorso: rot(8, -55), RightUpperArm: rot(0, -70, 100), RightLowerArm: rot(80) })), ts: 0.06, th: 0.35, event: 'Shoot',
            marks: [{ at: 'windup', name: 'Charge', value: 'start' }, { at: 'windup', dt: 0.6, name: 'Charge', value: 'full' }],
          },
        ], rest);
      },
    },

    // ===== Special skills / ultimates (v0.9) =====
    {
      id: 'sk_fist', cat: 'skill', label: 'สกิล มือเปล่า: หมัดรัวพลังรวม', prop: 'none',
      make: () => {
        const L = legs(25, -45);
        const gather = (b) => merge(legs(45 + b, -85 - b * 2, { spread: 14 }), { UpperTorso: rot(-5 - b, 0), Head: rot(5 + b), RightUpperArm: rot(-20, 0, 20), RightLowerArm: rot(100), LeftUpperArm: rot(-20, 0, -20), LeftLowerArm: rot(100), RightHand: rot(0), LeftHand: rot(0) });
        const lunge = legs(30, -50, { spread: 8 });
        const punchR = merge(GUARD, lunge, { UpperTorso: rot(-8, 22), Head: rot(4, -18), RightUpperArm: rot(90, 0, -8), RightLowerArm: rot(5) });
        const punchL = merge(GUARD, lunge, { UpperTorso: rot(-8, -22), Head: rot(4, 18), LeftUpperArm: rot(90, 0, 8), LeftLowerArm: rot(5) });
        const keys = [kf(0, merge(GUARD, L), 'Cubic', 'Out'), kf(0.35, gather(0), 'Linear'), kf(0.9, gather(3), 'Cubic', 'In')];
        const markers = [{ time: 0.35, name: 'Charge', value: 'start' }, { time: 0.9, name: 'Charge', value: 'full' }, { time: 1.0, name: 'Move', value: 'forward 22 0.55' }];
        for (let i = 0; i < 8; i++) {
          const t = r(1.0 + i * 0.07);
          keys.push(kf(t, i % 2 ? punchL : punchR, 'Linear'));
          markers.push({ time: t, name: 'Hit', value: String(i + 1) });
        }
        keys.push(kf(1.75, merge(GUARD, legs(40, -75, { spread: 10 }), { UpperTorso: rot(-5, -30), Head: rot(0, 24), RightUpperArm: rot(30, 0, 10), RightLowerArm: rot(120) }), 'Cubic', 'In'));
        keys.push(kf(1.85, merge(GUARD, legs(30, -50, { spread: 8 }), { LowerTorso: pos(-8, 0, 0, [0, -0.25, -0.4]), UpperTorso: rot(-12, 35), Head: rot(6, -28), RightUpperArm: rot(92, 0, -5), RightLowerArm: rot(0) }), 'Cubic', 'Out'));
        keys.push(kf(2.2, merge(GUARD, legs(30, -50, { spread: 8 }), { LowerTorso: pos(-8, 0, 0, [0, -0.25, -0.4]), UpperTorso: rot(-12, 33), Head: rot(6, -26), RightUpperArm: rot(90, 0, -5), RightLowerArm: rot(3) }), 'Cubic', 'InOut'));
        keys.push(kf(2.6, merge(GUARD, L)));
        markers.push({ time: 1.83, name: 'Hit', value: 'Finish' });
        return anim('SkillFistRush', 'Action', false, 2.6, keys, markers);
      },
    },
    {
      id: 'sk_sword', cat: 'skill', label: 'สกิล ดาบ: เสยฟ้าหมุนฟาด', prop: 'sword',
      make: () => {
        const tuck = { RightUpperLeg: rot(60, 0, 6), LeftUpperLeg: rot(40, 0, -6), RightLowerLeg: rot(-90), LeftLowerLeg: rot(-70), RightFoot: rot(20), LeftFoot: rot(20) };
        const guardL = { LeftUpperArm: rot(25, 0, -12), LeftLowerArm: rot(60), LeftHand: rot(0) };
        const air = (y, h) => merge(tuck, { LowerTorso: pos(0, y, 0, [0, h, 0]), UpperTorso: rot(-6), Head: rot(4), RightUpperArm: rot(10, 0, 85), RightLowerArm: rot(10), RightHand: rot(-10), LeftUpperArm: rot(10, 0, -60), LeftLowerArm: rot(20) });
        return anim('SkillSwordSkyfall', 'Action', false, 2.4, [
          kf(0, merge(SWORD_READY, STAND), 'Cubic', 'Out'),
          kf(0.3, merge(guardL, legs(50, -95, { spread: 10 }), { UpperTorso: rot(-15), Head: rot(12), RightUpperArm: rot(-30, 0, 20), RightLowerArm: rot(20), RightHand: rot(-40) }), 'Cubic', 'In'),
          kf(0.4, merge(guardL, legs(20, -30, { spread: 8 }), { UpperTorso: rot(-5), Head: rot(4), RightUpperArm: rot(70, 0, 15), RightLowerArm: rot(10), RightHand: rot(-60) }), 'Linear'),
          kf(0.5, merge(guardL, tuck, { LowerTorso: pos(0, 0, 0, [0, 1.2, 0]), UpperTorso: rot(8), Head: rot(-8), RightUpperArm: rot(170, 0, 10), RightLowerArm: rot(10), RightHand: rot(-80) }), 'Cubic', 'Out'),
          kf(0.6, air(0, 1.3), 'Linear'), kf(0.7, air(90, 1.35), 'Linear'), kf(0.8, air(180, 1.35), 'Linear'), kf(0.9, air(-90, 1.3), 'Linear'), kf(1.0, air(0, 1.2), 'Cubic', 'Out'),
          kf(1.1, merge(guardL, tuck, { LowerTorso: pos(0, 0, 0, [0, 1.0, 0]), UpperTorso: rot(8), Head: rot(-6), RightUpperArm: rot(170, 0, 15), RightLowerArm: rot(30), RightHand: rot(10) }), 'Cubic', 'In'),
          kf(1.22, merge(guardL, legs(55, -100, { spread: 12, lean: -10 }), { UpperTorso: rot(-30), Head: rot(25), RightUpperArm: rot(35, 0, -15), RightLowerArm: rot(5), RightHand: rot(-60) }), 'Cubic', 'Out'),
          kf(1.6, merge(guardL, legs(52, -96, { spread: 12, lean: -10 }), { UpperTorso: rot(-28), Head: rot(24), RightUpperArm: rot(32, 0, -15), RightLowerArm: rot(5), RightHand: rot(-60) }), 'Cubic', 'InOut'),
          kf(2.4, merge(SWORD_READY, STAND)),
        ], [
          { time: 0.4, name: 'Move', value: 'up 35 0.18' }, { time: 0.48, name: 'Hit', value: '1' }, { time: 0.8, name: 'Hit', value: '2' },
          { time: 1.2, name: 'Hit', value: 'Finish' }, { time: 1.22, name: 'Land', value: '' },
        ]);
      },
    },
    {
      id: 'sk_longsword', cat: 'skill', label: 'สกิล ดาบยาว: ชักดาบพันคม', prop: 'longsword',
      make: () => {
        const leftHip = { LeftUpperArm: rot(-10, 0, -15), LeftLowerArm: rot(30), LeftHand: rot(0) };
        const sheath = (b) => merge(wield(turn(-10, 25), [-0.55, -0.9 - b * 0.01, -0.45], [-0.2, -0.25, 0.95], [0, 0.45, 0]), legs(45 + b, -80 - b * 2, { spread: 12 }));
        const dash = (b) => merge(wield(turn(-5, -35), [0.9, -0.3 - b * 0.01, -0.9], [0.95, 0.05, -0.3], null), leftHip, legs(45, -80, { spread: 14 }), { LowerTorso: pos(-10, 0, 0, [0, -0.55, -0.5]) });
        const markers = [{ time: 0.4, name: 'Charge', value: 'start' }, { time: 1.0, name: 'Charge', value: 'full' }, { time: 1.0, name: 'Move', value: 'forward 60 0.12' }, { time: 1.1, name: 'Hit', value: '1' }];
        [1.65, 1.72, 1.79, 1.86, 1.93].forEach((t, i) => markers.push({ time: t, name: 'Hit', value: String(i + 2) }));
        markers.push({ time: 2.25, name: 'Sheathe', value: '' });
        return anim('SkillLongSwordThousandCuts', 'Action', false, 2.9, [
          kf(0, merge(LS.guard(0), STAND), 'Cubic', 'InOut'),
          kf(0.4, sheath(0), 'Linear'), kf(1.0, sheath(3), 'Cubic', 'In'),
          kf(1.06, merge(wield(turn(-8, 10), [0, -0.6, -1.0], [-0.3, 0, -0.95], null), leftHip, legs(45, -80, { spread: 13 })), 'Linear'),
          kf(1.12, dash(0), 'Cubic', 'Out'), kf(1.6, dash(1), 'Linear'), kf(2.0, dash(1), 'Cubic', 'InOut'),
          kf(2.25, merge(wield(turn(-5, 20), [-0.55, -0.9, -0.45], [-0.2, -0.25, 0.95], [0, 0.45, 0]), legs(10, -15)), 'Cubic', 'InOut'),
          kf(2.9, merge(LS.guard(0), STAND)),
        ], markers);
      },
    },
    {
      id: 'sk_dual', cat: 'skill', label: 'สกิล ดาบคู่: พายุใบมีด', prop: 'dual',
      make: () => {
        const arms = { RightUpperArm: rot(10, 0, 85), LeftUpperArm: rot(10, 0, -85), RightLowerArm: rot(10), LeftLowerArm: rot(10), RightHand: rot(-10), LeftHand: rot(-10), UpperTorso: rot(-8), Head: rot(4) };
        const tuck = { RightUpperLeg: rot(45, 0, 6), LeftUpperLeg: rot(45, 0, -6), RightLowerLeg: rot(-70), LeftLowerLeg: rot(-70), RightFoot: rot(20), LeftFoot: rot(20) };
        const keys = [kf(0, merge(DB_GUARD, legs(30, -55, { spread: 10 })), 'Cubic', 'In'), kf(0.25, merge(arms, legs(55, -100, { spread: 12 })), 'Linear')];
        const markers = [{ time: 0.3, name: 'Move', value: 'up 16 0.6' }];
        const ys = [90, 180, -90, 0];
        for (let i = 0; i < 12; i++) {
          const t = r(0.32 + i * 0.07), h = r(Math.min(1.0, (i + 1) * 0.1));
          keys.push(kf(t, merge(arms, tuck, { LowerTorso: pos(0, ys[i % 4], 0, [0, h, 0]) }), 'Linear'));
          if (i % 4 === 3) markers.push({ time: t, name: 'Hit', value: String((i + 1) / 4) });
        }
        keys.push(kf(1.25, merge(tuck, { LowerTorso: pos(0, 0, 0, [0, 0.6, 0]), UpperTorso: rot(10), Head: rot(-6), RightUpperArm: rot(150, 0, 30), LeftUpperArm: rot(150, 0, -30), RightLowerArm: rot(30), LeftLowerArm: rot(30), RightHand: rot(0), LeftHand: rot(0) }), 'Cubic', 'In'));
        keys.push(kf(1.4, merge(legs(50, -90, { spread: 12, lean: -8 }), { UpperTorso: rot(-18), Head: rot(16), RightUpperArm: rot(40, 0, -40), LeftUpperArm: rot(40, 0, 40), RightLowerArm: rot(10), LeftLowerArm: rot(10), RightHand: rot(-40), LeftHand: rot(-40) }), 'Cubic', 'Out'));
        keys.push(kf(1.8, merge(legs(48, -86, { spread: 12, lean: -8 }), { UpperTorso: rot(-16), Head: rot(15), RightUpperArm: rot(38, 0, -40), LeftUpperArm: rot(38, 0, 40), RightLowerArm: rot(12), LeftLowerArm: rot(12), RightHand: rot(-40), LeftHand: rot(-40) }), 'Cubic', 'InOut'));
        keys.push(kf(2.4, merge(DB_GUARD, legs(30, -55, { spread: 10 }))));
        markers.push({ time: 1.38, name: 'Hit', value: 'Finish' }, { time: 1.4, name: 'Land', value: '' });
        return anim('SkillDualTempest', 'Action', false, 2.4, keys, markers);
      },
    },
    {
      id: 'sk_greatsword', cat: 'skill', label: 'สกิล ดาบใหญ่: ทุบพสุธา', prop: 'greatsword',
      make: () => {
        const w = wielder(GS_GRIP);
        const up = (s, l) => merge(w(turn(12 + s, -10), [0.1, 1.2, -0.4 - s * 0.01], [0, -0.5, 0.87]), l);
        const down = (l) => merge(w(turn(-32, 5), [0, -0.55, -1.0], [0, -0.6, -0.8]), l);
        return anim('SkillGreatSwordQuake', 'Action', false, 3.2, [
          kf(0, merge(GS.low(0), legs(25, -45, { spread: 10 })), 'Cubic', 'InOut'),
          kf(0.4, merge(w(turn(4, 0), [0.1, 0.4, -1.1], [0, 0.9, -0.43]), legs(20, -35, { spread: 11 })), 'Cubic', 'Out'),
          kf(0.7, up(0, legs(30, -55, { spread: 14 })), 'Linear'),
          kf(1.0, up(2, legs(34, -62, { spread: 14 })), 'Linear'), kf(1.3, up(4, legs(36, -66, { spread: 14 })), 'Linear'), kf(1.6, up(5, legs(40, -72, { spread: 14 })), 'Cubic', 'Out'),
          kf(1.8, up(3, { LowerTorso: pos(0, 0, 0, [0, 1.0, 0]), RightUpperLeg: rot(50, 0, 8), LeftUpperLeg: rot(50, 0, -8), RightLowerLeg: rot(-80), LeftLowerLeg: rot(-80), RightFoot: rot(20), LeftFoot: rot(20) }), 'Cubic', 'In'),
          kf(2.0, down(legs(60, -110, { spread: 16, lean: -12 })), 'Cubic', 'Out'),
          kf(2.5, down(legs(58, -106, { spread: 16, lean: -12 })), 'Cubic', 'InOut'),
          kf(3.2, merge(GS.low(0), legs(25, -45, { spread: 10 }))),
        ], [
          { time: 0.7, name: 'Charge', value: 'start' }, { time: 1.6, name: 'Charge', value: 'full' },
          { time: 1.65, name: 'Move', value: 'up 30 0.15' }, { time: 1.98, name: 'Hit', value: 'Quake' }, { time: 2.0, name: 'Land', value: '' },
        ]);
      },
    },
    {
      id: 'sk_heavygun', cat: 'skill', label: 'สกิล ปืนใหญ่: ลำแสงเต็มกำลัง', prop: 'heavygun',
      make: () => {
        const w = wielder(HG_GRIP, { gun: true });
        const brace = legs(45, -80, { spread: 18 });
        const aim = merge(w(turn(-12, 10), [-0.1, -0.6, -0.55], [0, 0.02, -1]), brace);
        const shake = merge(w(turn(-8, 10), [-0.1, -0.57, -0.49], [0, 0.1, -0.99]), brace);
        const keys = [kf(0, merge(HG.hold(0), legs(25, -45, { spread: 12 })), 'Cubic', 'Out'), kf(0.4, aim, 'Linear'), kf(1.0, aim, 'Linear')];
        for (let i = 0; i < 12; i++) keys.push(kf(r(1.05 + i * 0.1), i % 2 ? aim : shake, 'Linear'));
        const blast = merge(w(turn(16, 5), [0, -0.4, -0.3], [0, 0.5, -0.85]), legs(30, -55, { spread: 14 }), { LowerTorso: pos(6, 0, 0, [0, -0.3, 0.35]) });
        keys.push(kf(2.3, aim, 'Cubic', 'In'), kf(2.36, blast, 'Cubic', 'Out'), kf(2.7, blast, 'Cubic', 'InOut'), kf(3.2, merge(HG.hold(0), legs(25, -45, { spread: 12 }))));
        return anim('SkillHeavyGunBeam', 'Action', false, 3.2, keys, [
          { time: 0.4, name: 'Charge', value: 'start' }, { time: 1.0, name: 'Charge', value: 'full' },
          { time: 1.05, name: 'Fire', value: 'beam-start' }, { time: 1.05, name: 'Move', value: 'back 4 1.2' }, { time: 2.25, name: 'Fire', value: 'beam-end' },
          { time: 2.34, name: 'Fire', value: 'blast' }, { time: 2.34, name: 'Move', value: 'back 20 0.2' },
        ]);
      },
    },
    {
      id: 'sk_bow', cat: 'skill', label: 'สกิล ธนู: ฝนธนู', prop: 'bow',
      make: () => {
        const aim = (up) => ({ UpperTorso: rot(up * 0.5, -50), Head: rot(up * 0.6, 45), LeftUpperArm: rot(up, -40, -88), LeftLowerArm: rot(0), LeftHand: rot(0) });
        const draw = (up) => merge(aim(up), { RightUpperArm: rot(up, -40, 88), RightLowerArm: rot(150) });
        const loose = (up) => merge(aim(up), { RightUpperArm: rot(up, -60, 95), RightLowerArm: rot(95) });
        const rest = { UpperTorso: rot(0), Head: rot(0), LeftUpperArm: rot(20, 0, -8), LeftLowerArm: rot(20), LeftHand: rot(0), RightUpperArm: rot(0), RightLowerArm: rot(0) };
        return anim('SkillBowArrowRain', 'Action', false, 3.0, [
          kf(0, rest),
          kf(0.4, draw(45), 'Linear'), kf(0.9, draw(46), 'Cubic', 'Out'),
          kf(0.96, loose(45)), kf(1.15, draw(45), 'Cubic', 'Out'), kf(1.21, loose(45)), kf(1.4, draw(45), 'Cubic', 'Out'), kf(1.46, loose(45)),
          kf(1.8, draw(0), 'Linear'), kf(1.95, draw(0), 'Cubic', 'Out'), kf(2.01, loose(0), 'Cubic', 'InOut'),
          kf(3.0, rest),
        ], [
          { time: 0.4, name: 'Charge', value: 'start' }, { time: 0.9, name: 'Charge', value: 'full' },
          { time: 0.94, name: 'Shoot', value: 'Up' }, { time: 1.19, name: 'Shoot', value: 'Up' }, { time: 1.44, name: 'Shoot', value: 'Up' },
          { time: 1.9, name: 'Rain', value: '' }, { time: 1.99, name: 'Shoot', value: 'Finish' },
        ]);
      },
    },
    {
      id: 'sk_sns', cat: 'skill', label: 'สกิล ดาบโล่: กำแพงโล่พุ่งชน', prop: 'swordshield',
      make: () => {
        const ready = merge(STAND, { LeftUpperArm: rot(50, 0, 25), LeftLowerArm: rot(105), LeftHand: rot(0), LeftHandle: rot(0, 90), RightUpperArm: rot(20, 0, 5), RightLowerArm: rot(70), RightHand: rot(-40), UpperTorso: rot(0, 10), Head: rot(0, -8) });
        const swordLow = { RightUpperArm: rot(10, 0, 15), RightLowerArm: rot(40), RightHand: rot(-50) };
        const rush = merge(swordLow, legs(35, -60, { spread: 10, lean: -14 }), turn(-10, 15), { LowerTorso: pos(-14, 0, 0, [0, -0.35, -0.5]), LeftUpperArm: rot(75, 0, 28), LeftLowerArm: rot(95), LeftHand: rot(0), LeftHandle: rot(0, 90) });
        return anim('SkillShieldRampart', 'Action', false, 2.8, [
          kf(0, ready, 'Cubic', 'InOut'),
          kf(0.4, merge(swordLow, STAND, { UpperTorso: rot(8), Head: rot(-10), LeftUpperArm: rot(160, 0, -10), LeftLowerArm: rot(20), LeftHand: rot(0), LeftHandle: rot(0, 90) }), 'Cubic', 'In'),
          kf(0.6, merge(swordLow, legs(55, -100, { spread: 14 }), { UpperTorso: rot(-30), Head: rot(25), LeftUpperArm: rot(70, 0, 10), LeftLowerArm: rot(10), LeftHand: rot(0), LeftHandle: rot(0, 90) }), 'Cubic', 'Out'),
          kf(1.1, merge(swordLow, legs(52, -96, { spread: 14 }), { UpperTorso: rot(-28), Head: rot(24), LeftUpperArm: rot(70, 0, 10), LeftLowerArm: rot(12), LeftHand: rot(0), LeftHandle: rot(0, 90) }), 'Cubic', 'InOut'),
          kf(1.3, rush, 'Linear'), kf(1.6, rush, 'Cubic', 'InOut'),
          kf(1.75, merge(ready, turn(-15, 20), legs(30, -55), { RightUpperArm: rot(10, 0, -30), RightLowerArm: rot(40), RightHand: rot(-90) }), 'Cubic', 'In'),
          kf(1.88, merge(ready, turn(8, -25), { RightUpperArm: rot(150, 0, 15), RightLowerArm: rot(20), RightHand: rot(0) }), 'Cubic', 'Out'),
          kf(2.3, merge(ready, turn(8, -26), { RightUpperArm: rot(148, 0, 15), RightLowerArm: rot(20), RightHand: rot(0) }), 'Cubic', 'InOut'),
          kf(2.8, ready),
        ], [
          { time: 0.4, name: 'Charge', value: 'start' }, { time: 0.58, name: 'Hit', value: 'Barrier' }, { time: 0.6, name: 'Land', value: '' },
          { time: 1.2, name: 'Move', value: 'forward 38 0.4' }, { time: 1.5, name: 'Hit', value: 'Rush' }, { time: 1.86, name: 'Hit', value: 'Finish' },
        ]);
      },
    },

    // ===== Boss / monster (v0.10). Attacks start with a "Warn" marker for telegraph effects. =====
    {
      id: 'boss_idle', cat: 'boss', label: 'บอส: ยืนข่ม (Idle)', prop: 'none',
      make: () => anim('BossIdle', 'Idle', true, 2.0, [kf(0, BOSS.idle(0)), kf(1.0, BOSS.idle(1)), kf(2.0, BOSS.idle(0))]),
    },
    {
      id: 'boss_roar', cat: 'boss', label: 'บอส: คำราม (Roar)', prop: 'none',
      make: () => {
        const roar = (b) => merge(legs(20, -35, { spread: 18 }), { UpperTorso: rot(20 + b, 0), Head: rot(35 + b, 0), RightUpperArm: rot(-30, 0, 75 + b), LeftUpperArm: rot(-30, 0, -75 - b), RightLowerArm: rot(20), LeftLowerArm: rot(20) });
        return anim('BossRoar', 'Action', false, 2.4, [
          kf(0, BOSS.idle(0)),
          kf(0.5, merge(legs(35, -65, { spread: 16 }), { UpperTorso: rot(-25), Head: rot(-10), RightUpperArm: rot(-20, 0, 20), LeftUpperArm: rot(-20, 0, -20), RightLowerArm: rot(60), LeftLowerArm: rot(60) }), 'Cubic', 'Out'),
          kf(0.9, roar(0), 'Linear'), kf(1.1, roar(2), 'Linear'), kf(1.3, roar(0), 'Linear'), kf(1.5, roar(2), 'Linear'), kf(1.9, roar(0), 'Cubic', 'InOut'),
          kf(2.4, BOSS.idle(0)),
        ], [{ time: 0.9, name: 'Roar', value: '' }]);
      },
    },
    {
      id: 'boss_slam', cat: 'boss', label: 'บอส: ทุบพื้นสองมือ (Double slam)', prop: 'none',
      make: () => {
        const up = (b) => merge(legs(10, -15, { spread: 16 }), { UpperTorso: rot(15 + b), Head: rot(-5), RightUpperArm: rot(170, 0, 10), LeftUpperArm: rot(170, 0, -10), RightLowerArm: rot(40), LeftLowerArm: rot(40) });
        const down = merge(legs(55, -100, { spread: 18, lean: -15 }), { UpperTorso: rot(-45), Head: rot(35), RightUpperArm: rot(70, 0, -5), LeftUpperArm: rot(70, 0, 5), RightLowerArm: rot(5), LeftLowerArm: rot(5) });
        return anim('BossDoubleSlam', 'Action', false, 2.0, [
          kf(0, BOSS.idle(0), 'Cubic', 'InOut'), kf(0.8, up(0), 'Linear'), kf(0.95, up(3), 'Cubic', 'In'),
          kf(1.05, down, 'Cubic', 'Out'), kf(1.5, down, 'Cubic', 'InOut'), kf(2.0, BOSS.idle(0)),
        ], [{ time: 0.15, name: 'Warn', value: 'Slam' }, { time: 1.03, name: 'Hit', value: 'Slam' }, { time: 1.05, name: 'Land', value: '' }]);
      },
    },
    {
      id: 'boss_swipe', cat: 'boss', label: 'บอส: ตบกวาด (Swipe)', prop: 'none',
      make: () => anim('BossSwipe', 'Action', false, 1.8, [
        kf(0, BOSS.idle(0), 'Cubic', 'InOut'),
        kf(0.6, merge(legs(30, -55, { spread: 16, twist: -20 }), turn(0, -60), { RightUpperArm: rot(40, 0, 85), RightLowerArm: rot(20), LeftUpperArm: rot(20, 0, -30), LeftLowerArm: rot(40) }), 'Cubic', 'In'),
        kf(0.8, merge(legs(35, -65, { spread: 16, twist: 20 }), turn(-10, 60), { RightUpperArm: rot(80, 0, -40), RightLowerArm: rot(10), LeftUpperArm: rot(10, 0, -40), LeftLowerArm: rot(30) }), 'Cubic', 'Out'),
        kf(1.1, merge(legs(35, -65, { spread: 16, twist: 22 }), turn(-10, 62), { RightUpperArm: rot(78, 0, -42), RightLowerArm: rot(12), LeftUpperArm: rot(10, 0, -40), LeftLowerArm: rot(30) }), 'Cubic', 'InOut'),
        kf(1.8, BOSS.idle(0)),
      ], [{ time: 0.1, name: 'Warn', value: 'Swipe' }, { time: 0.75, name: 'Hit', value: 'Swipe' }]),
    },
    {
      id: 'boss_rush', cat: 'boss', label: 'บอส: พุ่งชน (Charge rush)', prop: 'none',
      make: () => {
        const g = gait({ hip: 50, hipBias: 15, kneeBase: 20, knee: 80, arm: 0, armOut: 0, elbow: 0, elbowSwing: 0, twist: 8, lean: -25, chest: -15, bounce: 0.15 });
        const run = (ph) => merge(g(ph), { Head: rot(30), RightUpperArm: rot(-40, 0, 20), LeftUpperArm: rot(-40, 0, -20), RightLowerArm: rot(30), LeftLowerArm: rot(30) });
        const keys = [kf(0, BOSS.idle(0), 'Cubic', 'InOut'),
          kf(0.6, merge(legs(40, -75, { spread: 14, lean: -25 }), { UpperTorso: rot(-20), Head: rot(30), RightUpperArm: rot(-40, 0, 20), LeftUpperArm: rot(-40, 0, -20), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Cubic', 'In')];
        for (let i = 0; i < 6; i++) keys.push(kf(r(0.75 + i * 0.12), run((i % 4) * Math.PI / 2), 'Linear'));
        keys.push(kf(1.55, merge(legs(40, -75, { spread: 16 }), { UpperTorso: rot(5), Head: rot(0), RightUpperArm: rot(20, 0, 40), LeftUpperArm: rot(20, 0, -40), RightLowerArm: rot(20), LeftLowerArm: rot(20) }), 'Cubic', 'Out'));
        keys.push(kf(2.2, BOSS.idle(0)));
        return anim('BossRush', 'Action', false, 2.2, keys, [
          { time: 0.1, name: 'Warn', value: 'Rush' }, { time: 0.7, name: 'Move', value: 'forward 50 0.75' }, { time: 1.0, name: 'Hit', value: 'Rush' },
        ]);
      },
    },
    {
      id: 'boss_stomp', cat: 'boss', label: 'บอส: กระโดดกระทืบ (Jump stomp)', prop: 'none',
      make: () => {
        const air = (h) => ({ LowerTorso: pos(0, 0, 0, [0, h, 0]), RightUpperLeg: rot(60, 0, 10), LeftUpperLeg: rot(60, 0, -10), RightLowerLeg: rot(-90), LeftLowerLeg: rot(-90), RightFoot: rot(20), LeftFoot: rot(20), UpperTorso: rot(5), Head: rot(-10), RightUpperArm: rot(150, 0, 30), LeftUpperArm: rot(150, 0, -30), RightLowerArm: rot(30), LeftLowerArm: rot(30) });
        const land = merge(legs(60, -110, { spread: 18 }), { UpperTorso: rot(-20), Head: rot(15), RightUpperArm: rot(30, 0, 60), LeftUpperArm: rot(30, 0, -60), RightLowerArm: rot(20), LeftLowerArm: rot(20) });
        return anim('BossJumpStomp', 'Action', false, 2.2, [
          kf(0, BOSS.idle(0), 'Cubic', 'In'),
          kf(0.5, merge(legs(55, -100, { spread: 16 }), { UpperTorso: rot(-20), Head: rot(15), RightUpperArm: rot(-30, 0, 20), LeftUpperArm: rot(-30, 0, -20), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Cubic', 'In'),
          kf(0.58, merge(legs(20, -30, { spread: 14 }), { UpperTorso: rot(-5), Head: rot(5), RightUpperArm: rot(70, 0, 25), LeftUpperArm: rot(70, 0, -25), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Linear'),
          kf(0.7, air(2.0), 'Cubic', 'Out'), kf(1.0, air(2.2), 'Cubic', 'In'),
          kf(1.2, land, 'Cubic', 'Out'), kf(1.6, land, 'Cubic', 'InOut'), kf(2.2, BOSS.idle(0)),
        ], [{ time: 0.2, name: 'Warn', value: 'Stomp' }, { time: 0.55, name: 'Move', value: 'up 45 0.25' }, { time: 1.18, name: 'Hit', value: 'Stomp' }, { time: 1.2, name: 'Land', value: '' }]);
      },
    },
    {
      id: 'boss_spin', cat: 'boss', label: 'บอส: หมุนตัวฟาดรอบตัว (Spin)', prop: 'none',
      make: () => {
        const arms = { RightUpperArm: rot(10, 0, 85), LeftUpperArm: rot(10, 0, -85), RightLowerArm: rot(10), LeftLowerArm: rot(10), UpperTorso: rot(-10), Head: rot(5) };
        const k = (t, y) => kf(t, merge(arms, legs(25, -45, { spread: 16 }), { LowerTorso: pos(0, y, 0, [0, -0.15, 0]) }), 'Linear');
        const keys = [kf(0, BOSS.idle(0), 'Cubic', 'In'), kf(0.4, merge(legs(30, -55, { spread: 16 }), turn(-5, 40), { RightUpperArm: rot(10, 0, 85), LeftUpperArm: rot(10, 0, -85), RightLowerArm: rot(10), LeftLowerArm: rot(10) }), 'Cubic', 'In')];
        [-90, 180, 90, 0, -90, 180, 90, 0].forEach((y, i) => keys.push(k(r(0.5 + i * 0.075), y)));
        keys.push(kf(1.4, merge(legs(30, -55, { spread: 16 }), { UpperTorso: rot(-20, 0, 8), Head: rot(15, 0, -10), RightUpperArm: rot(20, 0, 40), LeftUpperArm: rot(20, 0, -40), RightLowerArm: rot(20), LeftLowerArm: rot(20) }), 'Cubic', 'Out'));
        keys.push(kf(2.0, BOSS.idle(0)));
        return anim('BossSpin', 'Action', false, 2.0, keys, [{ time: 0.1, name: 'Warn', value: 'Spin' }, { time: 0.8, name: 'Hit', value: '1' }, { time: 1.1, name: 'Hit', value: '2' }]);
      },
    },
    {
      id: 'boss_enrage', cat: 'boss', label: 'บอส: คลั่ง/เปลี่ยนเฟส (Enrage)', prop: 'none',
      make: () => {
        const kneel = (b) => merge(BOSS.kneel, { UpperTorso: rot(-35 - b), Head: rot(-20), RightUpperArm: rot(20, 0, 10 + b), LeftUpperArm: rot(20, 0, -10 - b), RightLowerArm: rot(100), LeftLowerArm: rot(100) });
        const rise = (b) => merge(legs(25, -45, { spread: 18 }), { UpperTorso: rot(15 + b), Head: rot(25 + b), RightUpperArm: rot(150, 0, 40 + b), LeftUpperArm: rot(150, 0, -40 - b), RightLowerArm: rot(40), LeftLowerArm: rot(40) });
        return anim('BossEnrage', 'Action', false, 3.0, [
          kf(0, BOSS.idle(0), 'Cubic', 'Out'), kf(0.4, kneel(0), 'Linear'), kf(0.8, kneel(3), 'Linear'), kf(1.2, kneel(0), 'Cubic', 'In'),
          kf(1.8, rise(0), 'Linear'), kf(2.0, rise(3), 'Linear'), kf(2.2, rise(0), 'Linear'), kf(2.5, rise(2), 'Cubic', 'InOut'),
          kf(3.0, BOSS.idle(0)),
        ], [{ time: 0.4, name: 'Charge', value: 'start' }, { time: 1.8, name: 'Phase', value: '2' }, { time: 1.85, name: 'Roar', value: '' }]);
      },
    },
    {
      id: 'boss_break', cat: 'boss', label: 'บอส: เสียหลักคุกเข่า (Break)', prop: 'none',
      make: () => {
        const down = (b) => merge(BOSS.kneel, { UpperTorso: rot(-30 + b, 0, 8), Head: rot(-15 + b, 10), RightUpperArm: rot(10, 0, 15), LeftUpperArm: rot(35, 0, -10), RightLowerArm: rot(20), LeftLowerArm: rot(30) });
        return anim('BossBreak', 'Action3', false, 2.6, [
          kf(0, BOSS.idle(0), 'Cubic', 'Out'),
          kf(0.12, merge(legs(25, -45, { spread: 16 }), { LowerTorso: pos(8, 0, 0, [0, 0, 0.3]), UpperTorso: rot(20), Head: rot(25), RightUpperArm: rot(30, 0, 40), LeftUpperArm: rot(30, 0, -40) }), 'Cubic', 'In'),
          kf(0.4, down(0), 'Bounce', 'Out'), kf(1.4, down(4), 'Linear'), kf(2.0, down(0), 'Cubic', 'InOut'),
          kf(2.6, BOSS.idle(0)),
        ], [{ time: 0.4, name: 'Break', value: '' }, { time: 0.4, name: 'Land', value: '' }]);
      },
    },
    {
      id: 'boss_death', cat: 'boss', label: 'บอส: ล้มตาย (Death)', prop: 'none',
      make: () => {
        const knees = { LowerTorso: pos(0, 0, 0, [0, -0.95, 0]), RightUpperLeg: rot(0, 0, 6), LeftUpperLeg: rot(0, 0, -6), RightLowerLeg: rot(-90), LeftLowerLeg: rot(-90), RightFoot: rot(0), LeftFoot: rot(0) };
        const prone = { LowerTorso: pos(-85, 0, 0, [0, -1.6, -0.6]), RightUpperLeg: rot(0, 0, 8), LeftUpperLeg: rot(0, 0, -8), RightLowerLeg: rot(-10), LeftLowerLeg: rot(-15), RightFoot: rot(20), LeftFoot: rot(20), UpperTorso: rot(0), Head: rot(5, 60), RightUpperArm: rot(160, 0, 25), LeftUpperArm: rot(40, 0, -20), RightLowerArm: rot(10), LeftLowerArm: rot(20) };
        return anim('BossDeath', 'Action4', false, 3.0, [
          kf(0, BOSS.idle(0), 'Cubic', 'Out'),
          kf(0.3, merge(legs(20, -35, { spread: 16 }), { LowerTorso: pos(6, 0, 0, [0, -0.1, 0.3]), UpperTorso: rot(15), Head: rot(25), RightUpperArm: rot(20, 0, 30), LeftUpperArm: rot(20, 0, -30) }), 'Cubic', 'In'),
          kf(0.9, merge(knees, { UpperTorso: rot(-10), Head: rot(-15), RightUpperArm: rot(5, 0, 10), LeftUpperArm: rot(5, 0, -10) }), 'Bounce', 'Out'),
          kf(1.6, merge(knees, { UpperTorso: rot(-15, 0, 5), Head: rot(-25, 10), RightUpperArm: rot(5, 0, 10), LeftUpperArm: rot(5, 0, -10) }), 'Cubic', 'In'),
          kf(1.95, merge(prone, { LowerTorso: pos(-45, 0, 0, [0, -1.3, -0.4]), RightUpperLeg: rot(40, 0, 8), LeftUpperLeg: rot(40, 0, -8), RightLowerLeg: rot(-60), LeftLowerLeg: rot(-60), RightUpperArm: rot(90, 0, 20), LeftUpperArm: rot(60, 0, -20) }), 'Cubic', 'In'),
          kf(2.2, prone, 'Bounce', 'Out'), kf(3.0, prone),
        ], [{ time: 0.9, name: 'Land', value: 'knees' }, { time: 2.2, name: 'Land', value: 'body' }]);
      },
    },
    {
      id: 'boss_summon', cat: 'boss', label: 'บอส: ร่ายเวทเรียกลูกน้อง (Summon)', prop: 'none',
      make: () => {
        const up = (b) => merge(legs(20, -35, { spread: 16 }), { UpperTorso: rot(15 + b), Head: rot(25 + b), RightUpperArm: rot(160, 0, 30), LeftUpperArm: rot(160, 0, -30), RightLowerArm: rot(20), LeftLowerArm: rot(20), RightHand: rot(30), LeftHand: rot(30) });
        return anim('BossSummon', 'Action', false, 2.4, [
          kf(0, BOSS.idle(0)),
          kf(0.5, merge(legs(35, -65, { spread: 16 }), { UpperTorso: rot(-25), Head: rot(-15), RightUpperArm: rot(40, 0, -35), LeftUpperArm: rot(40, 0, 35), RightLowerArm: rot(90), LeftLowerArm: rot(90) }), 'Cubic', 'In'),
          kf(1.2, up(0), 'Linear'), kf(1.5, up(3), 'Linear'), kf(1.8, up(0), 'Cubic', 'InOut'),
          kf(2.4, BOSS.idle(0)),
        ], [{ time: 0.5, name: 'Charge', value: 'start' }, { time: 1.2, name: 'Summon', value: '' }]);
      },
    },
    {
      id: 'boss_grab', cat: 'boss', label: 'บอส: คว้าแล้วขว้าง (Grab & throw)', prop: 'none',
      make: () => anim('BossGrabThrow', 'Action', false, 2.6, [
        kf(0, BOSS.idle(0), 'Cubic', 'In'),
        kf(0.5, merge(legs(40, -70, { spread: 16, lean: -15 }), { UpperTorso: rot(-25), Head: rot(25), RightUpperArm: rot(80, 0, -10), RightLowerArm: rot(10), RightHand: rot(0), LeftUpperArm: rot(10, 0, -30), LeftLowerArm: rot(30) }), 'Cubic', 'Out'),
        kf(0.8, merge(legs(30, -55, { spread: 16 }), { UpperTorso: rot(-10), Head: rot(10), RightUpperArm: rot(40, 0, -10), RightLowerArm: rot(110), LeftUpperArm: rot(10, 0, -30), LeftLowerArm: rot(30) }), 'Cubic', 'InOut'),
        kf(1.3, merge(legs(15, -25, { spread: 16 }), turn(15, -20), { RightUpperArm: rot(175, 0, 10), RightLowerArm: rot(30), LeftUpperArm: rot(30, 0, -30), LeftLowerArm: rot(30) }), 'Cubic', 'In'),
        kf(1.55, merge(legs(35, -65, { spread: 16, twist: 15 }), turn(-20, 25), { RightUpperArm: rot(60, 0, -20), RightLowerArm: rot(10), LeftUpperArm: rot(-20, 0, -30), LeftLowerArm: rot(30) }), 'Cubic', 'Out'),
        kf(1.9, merge(legs(35, -65, { spread: 16, twist: 15 }), turn(-18, 23), { RightUpperArm: rot(55, 0, -20), RightLowerArm: rot(12), LeftUpperArm: rot(-20, 0, -30), LeftLowerArm: rot(30) }), 'Cubic', 'InOut'),
        kf(2.6, BOSS.idle(0)),
      ], [{ time: 0.1, name: 'Warn', value: 'Grab' }, { time: 0.5, name: 'Grab', value: '' }, { time: 1.52, name: 'Throw', value: '' }]),
    },

    // ===== Small monster / minion (v0.11): quick, with short "Warn" telegraphs =====
    {
      id: 'mn_idle', cat: 'minion', label: 'ลูกน้อง: ยืนกระตุก (Idle)', prop: 'none',
      make: () => anim('MinionIdle', 'Idle', true, 1.2, [kf(0, MINION.idle(0)), kf(0.3, MINION.idle(0, 15)), kf(0.6, MINION.idle(1)), kf(0.9, MINION.idle(0, -15)), kf(1.2, MINION.idle(0))]),
    },
    {
      id: 'mn_walk', cat: 'minion', label: 'ลูกน้อง: เดินย่อง (Walk)', prop: 'none',
      make: () => cycle('MinionWalk', 'Movement', 0.8, 8, gait({ hip: 30, hipBias: 30, kneeBase: 45, knee: 30, arm: 20, armOut: 15, elbow: 40, elbowSwing: 10, twist: 10, lean: -20, chest: -20, bounce: 0.1, drop: 0.3, foot: 0.8 })),
    },
    {
      id: 'mn_run', cat: 'minion', label: 'ลูกน้อง: วิ่งพุ่ง (Run)', prop: 'none',
      make: () => {
        const g = gait({ hip: 45, hipBias: 30, kneeBase: 40, knee: 70, arm: 0, armOut: 0, elbow: 0, elbowSwing: 0, twist: 6, lean: -35, chest: -20, bounce: 0.15, drop: 0.3, foot: 0.8 });
        return cycle('MinionRun', 'Movement', 0.45, 8, (ph) => merge(g(ph), { RightUpperArm: rot(-50, 0, 20), LeftUpperArm: rot(-50, 0, -20), RightLowerArm: rot(20), LeftLowerArm: rot(20) }));
      },
    },
    {
      id: 'mn_bite', cat: 'minion', label: 'ลูกน้อง: พุ่งกัด (Lunge bite)', prop: 'none',
      make: () => {
        const lunge = merge(legs(30, -50, { spread: 10, lean: -25 }), { LowerTorso: pos(-25, 0, 0, [0, -0.3, -0.6]), UpperTorso: rot(-35), Head: rot(45), RightUpperArm: rot(70, 0, 15), LeftUpperArm: rot(70, 0, -15), RightLowerArm: rot(20), LeftLowerArm: rot(20) });
        return anim('MinionBite', 'Action', false, 0.8, [
          kf(0, MINION.idle(0)),
          kf(0.25, merge(legs(55, -100, { spread: 12 }), { UpperTorso: rot(-10), Head: rot(20), RightUpperArm: rot(-30, 0, 20), LeftUpperArm: rot(-30, 0, -20), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Cubic', 'In'),
          kf(0.38, lunge, 'Cubic', 'Out'), kf(0.55, lunge, 'Cubic', 'InOut'), kf(0.8, MINION.idle(0)),
        ], [{ time: 0.05, name: 'Warn', value: 'Bite' }, { time: 0.27, name: 'Move', value: 'forward 30 0.15' }, { time: 0.36, name: 'Hit', value: 'Bite' }]);
      },
    },
    {
      id: 'mn_scratch', cat: 'minion', label: 'ลูกน้อง: ข่วนสองครั้ง (Claw x2)', prop: 'none',
      make: () => {
        const base = MINION.idle(0);
        return anim('MinionClaw', 'Action', false, 0.9, [
          kf(0, base),
          kf(0.15, merge(base, turn(-20, -20), { RightUpperArm: rot(140, 0, 30), RightLowerArm: rot(40) }), 'Cubic', 'In'),
          kf(0.25, merge(base, turn(-35, 20), { RightUpperArm: rot(30, 0, -35), RightLowerArm: rot(20) }), 'Cubic', 'Out'),
          kf(0.35, merge(base, turn(-20, 20), { RightUpperArm: rot(30, 0, -35), RightLowerArm: rot(20), LeftUpperArm: rot(140, 0, -30), LeftLowerArm: rot(40) }), 'Cubic', 'In'),
          kf(0.45, merge(base, turn(-35, -20), { RightUpperArm: rot(30, 0, 10), LeftUpperArm: rot(30, 0, 35), LeftLowerArm: rot(20) }), 'Cubic', 'Out'),
          kf(0.9, base),
        ], [{ time: 0.0, name: 'Warn', value: 'Claw' }, { time: 0.24, name: 'Hit', value: '1' }, { time: 0.44, name: 'Hit', value: '2' }]);
      },
    },
    {
      id: 'mn_pounce', cat: 'minion', label: 'ลูกน้อง: กระโดดตะครุบ (Pounce)', prop: 'none',
      make: () => anim('MinionPounce', 'Action', false, 1.1, [
        kf(0, MINION.idle(0)),
        kf(0.3, merge(legs(70, -125, { spread: 12 }), { UpperTorso: rot(-40), Head: rot(45), RightUpperArm: rot(-40, 0, 20), LeftUpperArm: rot(-40, 0, -20), RightLowerArm: rot(30), LeftLowerArm: rot(30) }), 'Cubic', 'In'),
        kf(0.5, { LowerTorso: pos(-20, 0, 0, [0, 1.0, -0.5]), RightUpperLeg: rot(-15, 0, 6), LeftUpperLeg: rot(-5, 0, -6), RightLowerLeg: rot(-40), LeftLowerLeg: rot(-60), RightFoot: rot(30), LeftFoot: rot(30), UpperTorso: rot(-25), Head: rot(40), RightUpperArm: rot(100, 0, 20), LeftUpperArm: rot(100, 0, -20), RightLowerArm: rot(10), LeftLowerArm: rot(10), RightHand: rot(-30), LeftHand: rot(-30) }, 'Cubic', 'In'),
        kf(0.75, merge(legs(55, -100, { spread: 12 }), { UpperTorso: rot(-35), Head: rot(40), RightUpperArm: rot(60, 0, 20), LeftUpperArm: rot(60, 0, -20), RightLowerArm: rot(20), LeftLowerArm: rot(20) }), 'Cubic', 'Out'),
        kf(1.1, MINION.idle(0)),
      ], [
        { time: 0.05, name: 'Warn', value: 'Pounce' }, { time: 0.35, name: 'Move', value: 'forward 35 0.3' }, { time: 0.35, name: 'Move', value: 'up 25 0.15' },
        { time: 0.73, name: 'Hit', value: 'Pounce' }, { time: 0.75, name: 'Land', value: '' },
      ]),
    },
    {
      id: 'mn_headbutt', cat: 'minion', label: 'ลูกน้อง: พุ่งโขก (Headbutt)', prop: 'none',
      make: () => {
        const dash = merge(legs(35, -60, { spread: 10, lean: -30 }), { UpperTorso: rot(-40), Head: rot(-10), RightUpperArm: rot(-45, 0, 25), LeftUpperArm: rot(-45, 0, -25), RightLowerArm: rot(20), LeftLowerArm: rot(20) });
        return anim('MinionHeadbutt', 'Action', false, 1.0, [
          kf(0, MINION.idle(0)),
          kf(0.3, merge(MINION.idle(0), { UpperTorso: rot(5), Head: rot(10) }), 'Cubic', 'In'),
          kf(0.45, dash, 'Cubic', 'Out'),
          kf(0.6, merge(dash, { LowerTorso: pos(-15, 0, 0, [0, -0.3, 0.15]), UpperTorso: rot(-20), Head: rot(15) }), 'Cubic', 'InOut'),
          kf(1.0, MINION.idle(0)),
        ], [{ time: 0.05, name: 'Warn', value: 'Headbutt' }, { time: 0.32, name: 'Move', value: 'forward 40 0.2' }, { time: 0.45, name: 'Hit', value: 'Headbutt' }]);
      },
    },
    {
      id: 'mn_throw', cat: 'minion', label: 'ลูกน้อง: ขว้างของ (Throw)', prop: 'none',
      make: () => anim('MinionThrow', 'Action', false, 1.1, [
        kf(0, MINION.idle(0)),
        kf(0.4, merge(legs(35, -65, { spread: 12 }), turn(5, -30), { RightUpperArm: rot(150, 0, 20), RightLowerArm: rot(100), LeftUpperArm: rot(40, 0, -30), LeftLowerArm: rot(30) }), 'Cubic', 'In'),
        kf(0.55, merge(legs(40, -75, { spread: 12, twist: 10 }), turn(-20, 25), { RightUpperArm: rot(70, 0, -15), RightLowerArm: rot(10), LeftUpperArm: rot(-10, 0, -30), LeftLowerArm: rot(30) }), 'Cubic', 'Out'),
        kf(1.1, MINION.idle(0)),
      ], [{ time: 0.1, name: 'Warn', value: 'Throw' }, { time: 0.52, name: 'Throw', value: '' }]),
    },
    {
      id: 'mn_taunt', cat: 'minion', label: 'ลูกน้อง: กระโดดยั่ว (Taunt)', prop: 'none',
      make: () => {
        const low = merge(legs(40, -75, { spread: 12 }), { UpperTorso: rot(-10), Head: rot(15, 20), RightUpperArm: rot(160, 0, 30), LeftUpperArm: rot(160, 0, -30), RightLowerArm: rot(30), LeftLowerArm: rot(30) });
        const high = { LowerTorso: pos(0, 0, 0, [0, 0.4, 0]), RightUpperLeg: rot(10, 0, 8), LeftUpperLeg: rot(10, 0, -8), RightLowerLeg: rot(-20), LeftLowerLeg: rot(-20), RightFoot: rot(20), LeftFoot: rot(20), UpperTorso: rot(5), Head: rot(5, -20), RightUpperArm: rot(140, 0, 55), LeftUpperArm: rot(140, 0, -55), RightLowerArm: rot(20), LeftLowerArm: rot(20) };
        return anim('MinionTaunt', 'Action', true, 1.2, [kf(0, low, 'Cubic', 'Out'), kf(0.3, high, 'Cubic', 'In'), kf(0.6, low, 'Cubic', 'Out'), kf(0.9, high, 'Cubic', 'In'), kf(1.2, low)]);
      },
    },
    {
      id: 'mn_hit', cat: 'minion', label: 'ลูกน้อง: สะดุ้งโดนตี (Flinch)', prop: 'none',
      make: () => anim('MinionFlinch', 'Action2', false, 0.4, [
        kf(0, MINION.idle(0), 'Cubic', 'Out'),
        kf(0.06, merge(MINION.idle(0), { LowerTorso: pos(8, 0, 0, [0, -0.3, 0.2]), UpperTorso: rot(5, 0, 10), Head: rot(10, 0, -15), RightUpperArm: rot(50, 0, 40), LeftUpperArm: rot(50, 0, -40) }), 'Cubic', 'InOut'),
        kf(0.4, MINION.idle(0)),
      ]),
    },
    {
      id: 'mn_knockback', cat: 'minion', label: 'ลูกน้อง: กระเด็นลอย (Knockback)', prop: 'none',
      make: () => {
        const lying = { LowerTorso: pos(85, 0, 0, [0, -1.55, 0.9]), UpperTorso: rot(5), Head: rot(-10, 20, 0), RightUpperLeg: rot(20, 0, 10), LeftUpperLeg: rot(35, 0, -8), RightLowerLeg: rot(-30), LeftLowerLeg: rot(-50), RightFoot: rot(20), LeftFoot: rot(20), RightUpperArm: rot(0, 0, 60), LeftUpperArm: rot(10, 0, -55), RightLowerArm: rot(15), LeftLowerArm: rot(25) };
        return anim('MinionKnockback', 'Action3', false, 2.0, [
          kf(0, MINION.idle(0), 'Cubic', 'Out'),
          kf(0.08, merge(MINION.idle(0), { LowerTorso: pos(15, 0, 0, [0, -0.2, 0.3]), UpperTorso: rot(15), Head: rot(20), RightUpperArm: rot(40, 0, 40), LeftUpperArm: rot(40, 0, -40) }), 'Cubic', 'Out'),
          kf(0.25, { LowerTorso: pos(45, 0, 0, [0, 0.8, 0.8]), RightUpperLeg: rot(40, 0, 10), LeftUpperLeg: rot(20, 0, -10), RightLowerLeg: rot(-30), LeftLowerLeg: rot(-30), RightFoot: rot(10), LeftFoot: rot(10), UpperTorso: rot(10), Head: rot(15), RightUpperArm: rot(60, 0, 50), LeftUpperArm: rot(60, 0, -50), RightLowerArm: rot(20), LeftLowerArm: rot(20) }, 'Cubic', 'In'),
          kf(0.45, lying, 'Bounce', 'Out'), kf(0.9, lying, 'Cubic', 'InOut'),
          kf(1.3, { LowerTorso: pos(0, 0, 0, [0, -1.45, 0.3]), UpperTorso: rot(-15), Head: rot(5), RightUpperLeg: rot(85, 0, 8), LeftUpperLeg: rot(70, 0, -8), RightLowerLeg: rot(-15), LeftLowerLeg: rot(-60), RightFoot: rot(0), LeftFoot: rot(20), RightUpperArm: rot(-35, 0, 25), LeftUpperArm: rot(-35, 0, -25), RightLowerArm: rot(10), LeftLowerArm: rot(10) }, 'Cubic', 'InOut'),
          kf(1.6, merge(legs(80, -120, { spread: 10, lean: -15 }), { UpperTorso: rot(-25), Head: rot(30), RightUpperArm: rot(40, 0, 10), LeftUpperArm: rot(40, 0, -10), RightLowerArm: rot(40), LeftLowerArm: rot(40) }), 'Cubic', 'Out'),
          kf(2.0, MINION.idle(0)),
        ], [{ time: 0.06, name: 'Move', value: 'back 30 0.3' }, { time: 0.06, name: 'Move', value: 'up 20 0.15' }, { time: 0.45, name: 'Land', value: '' }]);
      },
    },
    {
      id: 'mn_death', cat: 'minion', label: 'ลูกน้อง: ล้มตาย (Death)', prop: 'none',
      make: () => {
        // Lying on the left side: the torso is 2 studs wide, so its centre sits ~1 stud up.
        const side = { LowerTorso: pos(0, 30, 85, [-0.9, -0.95, 0]), UpperTorso: rot(-20), Head: rot(-10, 0, 20), RightUpperLeg: rot(50, 0, 5), LeftUpperLeg: rot(40, 0, -5), RightLowerLeg: rot(-80), LeftLowerLeg: rot(-70), RightFoot: rot(10), LeftFoot: rot(10), RightUpperArm: rot(60, 0, -20), LeftUpperArm: rot(70, 0, 20), RightLowerArm: rot(90), LeftLowerArm: rot(80) };
        return anim('MinionDeath', 'Action4', false, 1.4, [
          kf(0, MINION.idle(0), 'Cubic', 'Out'),
          kf(0.1, merge(MINION.idle(0), { UpperTorso: rot(20), Head: rot(30), RightUpperArm: rot(60, 0, 50), LeftUpperArm: rot(60, 0, -50) }), 'Cubic', 'In'),
          kf(0.4, merge(legs(60, -110, { spread: 10 }), { LowerTorso: pos(10, 45, 30, [0, -0.6, 0]), UpperTorso: rot(-20), Head: rot(10), RightUpperArm: rot(40, 0, 30), LeftUpperArm: rot(40, 0, -30), RightLowerArm: rot(60), LeftLowerArm: rot(60) }), 'Cubic', 'In'),
          kf(0.7, side, 'Bounce', 'Out'), kf(1.4, side),
        ], [{ time: 0.7, name: 'Land', value: '' }]);
      },
    },
    {
      id: 'mn_spawn', cat: 'minion', label: 'ลูกน้อง: โผล่ออกมา (Spawn)', prop: 'none',
      make: () => {
        const curl = (h) => ({ LowerTorso: pos(0, 0, 0, [0, h, 0]), RightUpperLeg: rot(110, 0, 8), LeftUpperLeg: rot(110, 0, -8), RightLowerLeg: rot(-140), LeftLowerLeg: rot(-140), RightFoot: rot(30), LeftFoot: rot(30), UpperTorso: rot(-50), Head: rot(-30), RightUpperArm: rot(60, 0, -30), LeftUpperArm: rot(60, 0, 30), RightLowerArm: rot(120), LeftLowerArm: rot(120) });
        return anim('MinionSpawn', 'Action', false, 1.4, [
          kf(0, curl(-1.35), 'Linear'), kf(0.5, curl(-1.2), 'Cubic', 'In'),
          kf(0.75, { LowerTorso: pos(0, 0, 0, [0, 0.3, 0]), RightUpperLeg: rot(10, 0, 8), LeftUpperLeg: rot(10, 0, -8), RightLowerLeg: rot(-20), LeftLowerLeg: rot(-20), RightFoot: rot(10), LeftFoot: rot(10), UpperTorso: rot(10), Head: rot(30), RightUpperArm: rot(120, 0, 60), LeftUpperArm: rot(120, 0, -60), RightLowerArm: rot(20), LeftLowerArm: rot(20) }, 'Cubic', 'In'),
          kf(1.0, merge(MINION.idle(1)), 'Cubic', 'Out'), kf(1.4, MINION.idle(0)),
        ], [{ time: 0.0, name: 'Spawn', value: '' }, { time: 0.6, name: 'Roar', value: '' }]);
      },
    },
    {
      id: 'mn_cower', cat: 'minion', label: 'ลูกน้อง: หมอบกลัว (Cower)', prop: 'none',
      make: () => {
        const p = (b) => merge(legs(60, -110, { spread: 10 }), { UpperTorso: rot(-40 - b), Head: rot(-20, b * 3), RightUpperArm: rot(140, 0, -20 - b), LeftUpperArm: rot(140, 0, 20 + b), RightLowerArm: rot(120), LeftLowerArm: rot(120) });
        return anim('MinionCower', 'Action', true, 0.6, [kf(0, p(0), 'Linear'), kf(0.15, p(2), 'Linear'), kf(0.3, p(0), 'Linear'), kf(0.45, p(-2), 'Linear'), kf(0.6, p(0))]);
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
    ['combo', 'คอมโบยาว'],
    ['skill', 'สกิลพิเศษ (อัลติเมต)'],
    ['boss', 'บอส / มอนสเตอร์'],
    ['minion', 'มอนสเตอร์ตัวเล็ก / ลูกน้อง'],
  ];

  return {
    LIST,
    CATEGORIES,
    get: (id) => { const p = LIST.find((x) => x.id === id); return p ? p.make() : null; },
    info: (id) => LIST.find((x) => x.id === id) || null,
  };
});
