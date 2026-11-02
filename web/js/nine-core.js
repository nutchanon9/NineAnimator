/*
 * NineAnimator core
 * -----------------
 * Everything that is not UI: rotation math, R6/R15 rig data, the animation
 * JSON format (validate / normalise), interpolation, R15 <-> R6 conversion
 * and export to a Roblox .rbxmx KeyframeSequence.
 *
 * Works in the browser (global `NineCore`) and in Node (`require`).
 * No dependencies.
 *
 * Coordinate conventions (same as Roblox): Y is up, the character faces -Z,
 * the character's right side is +X. Rotations in the JSON format are in
 * degrees, applied like CFrame.Angles(x, y, z) and expressed in the PARENT
 * part's axes at the joint, so they mean the same thing on R6 and R15.
 * See docs/FORMAT.md.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NineCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMAT = 'nineanimator/1';
  const DEG = Math.PI / 180;
  const EPS_TIME = 1e-4;

  // ------------------------------------------------------------------
  // 3x3 rotation matrices (row-major, like Roblox R00..R22) and CFrames
  // ------------------------------------------------------------------
  const I3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function m3mul(a, b) {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
      }
    }
    return r;
  }
  const m3T = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
  const m3v = (a, v) => [
    a[0] * v[0] + a[1] * v[1] + a[2] * v[2],
    a[3] * v[0] + a[4] * v[1] + a[5] * v[2],
    a[6] * v[0] + a[7] * v[1] + a[8] * v[2],
  ];
  function rotX(t) { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotY(t) { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rotZ(t) { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; }

  /** Degrees [x,y,z] -> matrix, identical to CFrame.Angles(rad(x), rad(y), rad(z)). */
  function eulerToM3(deg) {
    return m3mul(m3mul(rotX(deg[0] * DEG), rotY(deg[1] * DEG)), rotZ(deg[2] * DEG));
  }
  /** Matrix -> degrees [x,y,z], identical to CFrame:ToEulerAnglesXYZ(). */
  function m3ToEuler(m) {
    const sy = clamp(m[2], -1, 1);
    const y = Math.asin(sy);
    let x, z;
    if (Math.abs(sy) < 0.9999999) {
      x = Math.atan2(-m[5], m[8]);
      z = Math.atan2(-m[1], m[0]);
    } else {
      x = Math.atan2(m[7], m[4]);
      z = 0;
    }
    return [x / DEG, y / DEG, z / DEG];
  }

  const cf = (p, r) => ({ p: p ? p.slice() : [0, 0, 0], r: r ? r.slice() : I3.slice() });
  function cfMul(a, b) {
    const bp = m3v(a.r, b.p);
    return { r: m3mul(a.r, b.r), p: [bp[0] + a.p[0], bp[1] + a.p[1], bp[2] + a.p[2]] };
  }
  function cfInv(a) {
    const rt = m3T(a.r);
    const p = m3v(rt, a.p);
    return { r: rt, p: [-p[0], -p[1], -p[2]] };
  }

  // Quaternions [x,y,z,w] for smooth rotation interpolation (like CFrame:Lerp).
  function quatFromM3(m) {
    const tr = m[0] + m[4] + m[8];
    let x, y, z, w;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      w = 0.25 * s; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s;
    } else if (m[0] > m[4] && m[0] > m[8]) {
      const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
      w = (m[7] - m[5]) / s; x = 0.25 * s; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s;
    } else if (m[4] > m[8]) {
      const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
      w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = 0.25 * s; z = (m[5] + m[7]) / s;
    } else {
      const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
      w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = 0.25 * s;
    }
    return [x, y, z, w];
  }
  function quatToM3(q) {
    const [x, y, z, w] = q;
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
    ];
  }
  function quatSlerp(a, b, t) {
    let [bx, by, bz, bw] = b;
    let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0, s1;
    if (d > 0.9995) { s0 = 1 - t; s1 = t; } else {
      const th = Math.acos(d), sn = Math.sin(th);
      s0 = Math.sin((1 - t) * th) / sn; s1 = Math.sin(t * th) / sn;
    }
    const q = [s0 * a[0] + s1 * bx, s0 * a[1] + s1 * by, s0 * a[2] + s1 * bz, s0 * a[3] + s1 * bw];
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }

  // ------------------------------------------------------------------
  // Rigs. Joint = the Motor6D that moves `name` (its Part1) relative to
  // `parent` (its Part0). c0/c1 match Roblox's default block rigs.
  // `size` is only used for drawing the preview.
  // ------------------------------------------------------------------
  // R6 Motor6Ds carry rotations in C0/C1; R15 ones don't.
  const R6_ROOT = [-1, 0, 0, 0, 0, 1, 0, 1, 0];
  const R6_RIGHT = [0, 0, 1, 0, 1, 0, -1, 0, 0];
  const R6_LEFT = [0, 0, -1, 0, 1, 0, 1, 0, 0];
  // Rotation of the right-hand grip (R6 RightGrip.C0 / R15 RightGripAttachment): -90° about X.
  const GRIP_ROT = [1, 0, 0, 0, 0, 1, 0, -1, 0];
  // Weapon joints: Motor6Ds from the hands to the weapon parts. "Handle" replaces
  // the tool's RightGrip weld (same C0/C1); "LeftHandle" is a second part held in
  // the left hand (off-hand blade, shield, bow). Grip C0 rotation is the same on
  // both hands. Their picking/ghost box runs along the blade (+Y of the handle).
  const handleJoint = (name, parent, c0p, label) => j(name, parent, name + 'Motor', c0p, [0, 0, 0], [0.4, 3.6, 0.5], label, {
    group: 'weapon', c0r: GRIP_ROT, optional: true, allowPos: true, meshOffset: [0, 1.5, 0],
  });

  function j(name, parent, motor, c0p, c1p, size, label, extra) {
    return Object.assign({
      name, parent, motor,
      c0: { p: c0p, r: I3.slice() }, c1: { p: c1p, r: I3.slice() },
      size, label,
    }, extra || {});
  }

  const RIGS = {
    R15: {
      id: 'R15',
      rootPart: 'HumanoidRootPart',
      rootSize: [2, 2, 1],
      rootJoint: 'LowerTorso',
      joints: [
        j('LowerTorso', 'HumanoidRootPart', 'Root', [0, -1, 0], [0, -0.2, 0], [2, 0.4, 1], 'ลำตัวล่าง (ราก)', { group: 'body' }),
        j('UpperTorso', 'LowerTorso', 'Waist', [0, 0.2, 0], [0, -0.8, 0], [2, 1.6, 1], 'ลำตัวบน', { group: 'body' }),
        j('Head', 'UpperTorso', 'Neck', [0, 0.8, 0], [0, -0.6, 0], [1.2, 1.2, 1.2], 'หัว', { group: 'body' }),
        j('RightUpperArm', 'UpperTorso', 'RightShoulder', [1, 0.563, 0], [-0.5, 0.392, 0], [1, 1.169, 1], 'ต้นแขนขวา', { group: 'right-arm' }),
        j('RightLowerArm', 'RightUpperArm', 'RightElbow', [0, -0.334, 0], [0, 0.259, 0], [0.92, 1.052, 0.92], 'แขนล่างขวา (ศอก)', { group: 'right-arm' }),
        j('RightHand', 'RightLowerArm', 'RightWrist', [0, -0.501, 0], [0, 0.125, 0], [0.96, 0.3, 0.96], 'มือขวา', { group: 'right-arm' }),
        j('LeftUpperArm', 'UpperTorso', 'LeftShoulder', [-1, 0.563, 0], [0.5, 0.392, 0], [1, 1.169, 1], 'ต้นแขนซ้าย', { group: 'left-arm' }),
        j('LeftLowerArm', 'LeftUpperArm', 'LeftElbow', [0, -0.334, 0], [0, 0.259, 0], [0.92, 1.052, 0.92], 'แขนล่างซ้าย (ศอก)', { group: 'left-arm' }),
        j('LeftHand', 'LeftLowerArm', 'LeftWrist', [0, -0.501, 0], [0, 0.125, 0], [0.96, 0.3, 0.96], 'มือซ้าย', { group: 'left-arm' }),
        j('RightUpperLeg', 'LowerTorso', 'RightHip', [0.5, -0.2, 0], [0, 0.421, 0], [1, 1.217, 1], 'ต้นขาขวา', { group: 'right-leg' }),
        j('RightLowerLeg', 'RightUpperLeg', 'RightKnee', [0, -0.401, 0], [0, 0.375, 0], [0.92, 1.193, 0.92], 'หน้าแข้งขวา (เข่า)', { group: 'right-leg' }),
        j('RightFoot', 'RightLowerLeg', 'RightAnkle', [0, -0.547, 0], [0, 0.1, 0], [0.96, 0.3, 1.1], 'เท้าขวา', { group: 'right-leg' }),
        j('LeftUpperLeg', 'LowerTorso', 'LeftHip', [-0.5, -0.2, 0], [0, 0.421, 0], [1, 1.217, 1], 'ต้นขาซ้าย', { group: 'left-leg' }),
        j('LeftLowerLeg', 'LeftUpperLeg', 'LeftKnee', [0, -0.401, 0], [0, 0.375, 0], [0.92, 1.193, 0.92], 'หน้าแข้งซ้าย (เข่า)', { group: 'left-leg' }),
        j('LeftFoot', 'LeftLowerLeg', 'LeftAnkle', [0, -0.547, 0], [0, 0.1, 0], [0.96, 0.3, 1.1], 'เท้าซ้าย', { group: 'left-leg' }),
        handleJoint('Handle', 'RightHand', [0, -0.15, 0], 'อาวุธมือขวา (Handle)'),
        handleJoint('LeftHandle', 'LeftHand', [0, -0.15, 0], 'อาวุธมือซ้าย (LeftHandle)'),
      ],
      handPart: 'RightHand',
      leftHandPart: 'LeftHand',
    },
    R6: {
      id: 'R6',
      rootPart: 'HumanoidRootPart',
      rootSize: [2, 2, 1],
      rootJoint: 'Torso',
      joints: [
        j('Torso', 'HumanoidRootPart', 'RootJoint', [0, 0, 0], [0, 0, 0], [2, 2, 1], 'ลำตัว (ราก)', { group: 'body', c0r: R6_ROOT, c1r: R6_ROOT }),
        j('Head', 'Torso', 'Neck', [0, 1, 0], [0, -0.5, 0], [2, 1, 1], 'หัว', { group: 'body', c0r: R6_ROOT, c1r: R6_ROOT }),
        j('Right Arm', 'Torso', 'Right Shoulder', [1, 0.5, 0], [-0.5, 0.5, 0], [1, 2, 1], 'แขนขวา', { group: 'right-arm', c0r: R6_RIGHT, c1r: R6_RIGHT }),
        j('Left Arm', 'Torso', 'Left Shoulder', [-1, 0.5, 0], [0.5, 0.5, 0], [1, 2, 1], 'แขนซ้าย', { group: 'left-arm', c0r: R6_LEFT, c1r: R6_LEFT }),
        j('Right Leg', 'Torso', 'Right Hip', [1, -1, 0], [0.5, 1, 0], [1, 2, 1], 'ขาขวา', { group: 'right-leg', c0r: R6_RIGHT, c1r: R6_RIGHT }),
        j('Left Leg', 'Torso', 'Left Hip', [-1, -1, 0], [-0.5, 1, 0], [1, 2, 1], 'ขาซ้าย', { group: 'left-leg', c0r: R6_LEFT, c1r: R6_LEFT }),
        handleJoint('Handle', 'Right Arm', [0, -1, 0], 'อาวุธมือขวา (Handle)'),
        handleJoint('LeftHandle', 'Left Arm', [0, -1, 0], 'อาวุธมือซ้าย (LeftHandle)'),
      ],
      handPart: 'Right Arm',
      leftHandPart: 'Left Arm',
    },
  };
  // Move the optional c0r/c1r rotations into place and build lookups.
  for (const rig of Object.values(RIGS)) {
    rig.byName = {};
    for (const jt of rig.joints) {
      if (jt.c0r) { jt.c0.r = jt.c0r.slice(); delete jt.c0r; }
      if (jt.c1r) { jt.c1.r = jt.c1r.slice(); delete jt.c1r; }
      jt.mirror = jt.name === 'Handle' ? 'LeftHandle' : jt.name === 'LeftHandle' ? 'Handle'
        : jt.name.includes('Right') ? jt.name.replace('Right', 'Left')
          : jt.name.includes('Left') ? jt.name.replace('Left', 'Right') : jt.name;
      rig.byName[jt.name] = jt;
    }
  }

  // ------------------------------------------------------------------
  // Pose <-> Roblox Pose.CFrame (Motor6D.Transform)
  //
  // Roblox: Part1 = Part0 * C0 * Transform * C1:Inverse()
  // We store M = CFrame.new(pos) * CFrame.Angles(rot) in Part0's axes at
  // the joint, so Transform = C0rot^-1 * M * C0rot.
  // ------------------------------------------------------------------
  function poseToM(pose) {
    return { r: eulerToM3(pose.rot || [0, 0, 0]), p: (pose.pos || [0, 0, 0]).slice() };
  }
  function mToPose(m) {
    const rot = m3ToEuler(m.r).map(roundAngle);
    const pos = m.p.map(round4);
    const out = { rot };
    if (pos.some((v) => v !== 0)) out.pos = pos;
    return out;
  }
  function c0Rot(rig, name) {
    const jt = rig.byName[name];
    return jt ? jt.c0.r : I3;
  }
  function mToTransform(rig, name, m) {
    const c0r = { r: c0Rot(rig, name), p: [0, 0, 0] };
    return cfMul(cfMul(cfInv(c0r), m), c0r);
  }
  function transformToM(rig, name, t) {
    const c0r = { r: c0Rot(rig, name), p: [0, 0, 0] };
    return cfMul(cfMul(c0r, t), cfInv(c0r));
  }
  const poseToTransform = (rig, name, pose) => mToTransform(rig, name, poseToM(pose));
  const transformToPose = (rig, name, t) => mToPose(transformToM(rig, name, t));

  /**
   * World CFrames of every part for a set of joint transforms M (by joint name).
   * Missing joints are at rest. The root part is placed so the rest pose
   * stands on y = 0.
   */
  function computeWorld(rig, ms) {
    const world = {};
    world[rig.rootPart] = cf([0, restHeight(rig), 0]);
    for (const jt of rig.joints) {
      const parent = world[jt.parent];
      const c0 = { p: jt.c0.p, r: jt.c0.r };
      const c1 = { p: jt.c1.p, r: jt.c1.r };
      const m = ms && ms[jt.name] ? ms[jt.name] : null;
      const t = m ? mToTransform(rig, jt.name, m) : cf();
      world[jt.name] = cfMul(cfMul(cfMul(parent, c0), t), cfInv(c1));
    }
    return world;
  }
  /**
   * Recompute only `names` (in parent-before-child order) on top of an
   * already computed `base` world. Much faster than computeWorld inside IK.
   */
  function computeChain(rig, ms, base, names) {
    const world = Object.create(base);
    for (const n of names) {
      const jt = rig.byName[n];
      if (!jt) continue;
      const m = ms[n];
      const t = m ? mToTransform(rig, n, m) : cf();
      world[n] = cfMul(cfMul(cfMul(world[jt.parent], jt.c0), t), cfInv(jt.c1));
    }
    return world;
  }
  function restHeight(rig) {
    if (rig._restHeight !== undefined) return rig._restHeight;
    rig._restHeight = 0;
    const w = computeWorld(rig, null);
    let minY = Infinity;
    for (const jt of rig.joints) if (!jt.optional) minY = Math.min(minY, w[jt.name].p[1] - jt.size[1] / 2);
    rig._restHeight = round4(-minY);
    return rig._restHeight;
  }

  // ------------------------------------------------------------------
  // Easing (Roblox PoseEasingStyle / PoseEasingDirection)
  // ------------------------------------------------------------------
  const EASING_STYLES = ['Linear', 'Constant', 'Cubic', 'Elastic', 'Bounce'];
  const EASING_DIRECTIONS = ['In', 'Out', 'InOut'];
  function bounceOut(t) {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  }
  const IN = {
    Cubic: (t) => t * t * t,
    Elastic: (t) => (t === 0 || t === 1 ? t : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI / 3))),
    Bounce: (t) => 1 - bounceOut(1 - t),
  };
  function ease(style, dir, t) {
    if (style === 'Constant') return t >= 1 ? 1 : 0;
    const f = IN[style];
    if (!f) return t; // Linear
    if (dir === 'In') return f(t);
    if (dir === 'InOut') return t < 0.5 ? f(2 * t) / 2 : 1 - f(2 - 2 * t) / 2;
    return 1 - f(1 - t); // Out
  }

  // ------------------------------------------------------------------
  // The animation format
  // ------------------------------------------------------------------
  const PRIORITIES = ['Idle', 'Movement', 'Action', 'Action2', 'Action3', 'Action4', 'Core'];

  function newAnimation(rigId) {
    return {
      format: FORMAT,
      name: 'NewAnimation',
      rig: rigId || 'R15',
      loop: false,
      priority: 'Action',
      length: 1,
      keyframes: [{ time: 0, easing: 'Cubic', direction: 'InOut', poses: {} }],
      markers: [],
    };
  }

  /** Strip ``` fences, // and /* comments and trailing commas, then JSON.parse. */
  function parseLoose(text) {
    if (typeof text !== 'string') return text;
    let s = text.trim();
    try { return JSON.parse(s); } catch (e) { /* fall through */ }
    const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1];
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    let out = '', inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i], n = s[i + 1];
      if (inStr) {
        out += c;
        if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; out += '\n'; continue; }
      if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue; }
      out += c;
    }
    out = out.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(out);
  }

  function canonJointName(rig, raw) {
    if (rig.byName[raw]) return raw;
    const key = String(raw).replace(/[\s_-]/g, '').toLowerCase();
    for (const jt of rig.joints) if (jt.name.replace(/\s/g, '').toLowerCase() === key) return jt.name;
    return null;
  }
  function vec3(v, name, errors, where) {
    if (v === undefined || v === null) return undefined;
    let arr = v;
    if (!Array.isArray(v) && typeof v === 'object') arr = [v.x ?? v.X ?? 0, v.y ?? v.Y ?? 0, v.z ?? v.Z ?? 0];
    if (!Array.isArray(arr) || arr.length !== 3 || arr.some((n) => typeof n !== 'number' || !isFinite(n))) {
      errors.push(`${where}: "${name}" ต้องเป็นตัวเลข 3 ค่า เช่น [0, 45, 0]`);
      return undefined;
    }
    return arr.slice();
  }
  function pick(list, value, fallback) {
    if (value === undefined || value === null) return fallback;
    const v = String(value).replace(/^Enum\.\w+\./, '');
    if (v === 'CubicV2') return 'Cubic';
    return list.find((x) => x.toLowerCase() === v.toLowerCase()) || null;
  }

  /**
   * Validate and normalise anything that looks like an animation.
   * Returns { ok, errors: [], warnings: [], anim }. Messages are in Thai
   * because they are shown to the user.
   */
  function validate(input) {
    const errors = [], warnings = [];
    let data = input;
    if (typeof input === 'string') {
      try { data = parseLoose(input); } catch (e) {
        return { ok: false, errors: ['อ่าน JSON ไม่ได้: ' + e.message], warnings, anim: null };
      }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, errors: ['ข้อมูลต้องเป็น JSON object { ... }'], warnings, anim: null };
    }
    if (data.animation && typeof data.animation === 'object') data = data.animation;

    const kfsIn = Array.isArray(data.keyframes) ? data.keyframes : null;
    if (!kfsIn || kfsIn.length === 0) errors.push('ต้องมี "keyframes" อย่างน้อย 1 อัน');

    // Rig: explicit, or guessed from joint names.
    let rigId = data.rig ? String(data.rig).toUpperCase() : null;
    if (rigId && !RIGS[rigId]) { errors.push(`rig "${data.rig}" ไม่รู้จัก ใช้ได้แค่ "R15" หรือ "R6"`); rigId = null; }
    if (!rigId) {
      const names = new Set();
      (kfsIn || []).forEach((k) => k && k.poses && Object.keys(k.poses).forEach((n) => names.add(n)));
      const r6hits = [...names].filter((n) => canonJointName(RIGS.R6, n) && !canonJointName(RIGS.R15, n)).length;
      rigId = r6hits > 0 ? 'R6' : 'R15';
      if (!data.rig) warnings.push(`ไม่ได้ระบุ "rig" เดาว่าเป็น ${rigId}`);
    }
    const rig = RIGS[rigId];

    const priority = pick(PRIORITIES, data.priority, 'Action');
    if (priority === null) errors.push(`priority "${data.priority}" ไม่ถูกต้อง ใช้: ${PRIORITIES.join(', ')}`);

    const rawRot = new WeakMap(); // pose -> rotation as written (before wrapping to ±180)
    const anim = {
      format: FORMAT,
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Animation',
      rig: rigId,
      loop: data.loop === true || data.looped === true,
      priority: priority || 'Action',
      keyframes: [],
      markers: [],
    };

    (kfsIn || []).forEach((k, i) => {
      const where = `keyframes[${i}]`;
      if (!k || typeof k !== 'object') { errors.push(`${where} ต้องเป็น object`); return; }
      const time = Number(k.time ?? k.t);
      if (!isFinite(time) || time < 0) { errors.push(`${where}: "time" ต้องเป็นตัวเลข >= 0 (วินาที)`); return; }
      const easing = pick(EASING_STYLES, k.easing ?? k.easingStyle, 'Linear');
      if (easing === null) errors.push(`${where}: easing "${k.easing}" ไม่ถูกต้อง ใช้: ${EASING_STYLES.join(', ')}`);
      const direction = pick(EASING_DIRECTIONS, k.direction ?? k.easingDirection, 'InOut');
      if (direction === null) errors.push(`${where}: direction "${k.direction}" ไม่ถูกต้อง ใช้: In, Out, InOut`);
      const poses = {};
      const pin = k.poses && typeof k.poses === 'object' ? k.poses : {};
      for (const raw of Object.keys(pin)) {
        const name = canonJointName(rig, raw);
        if (!name) {
          const other = rigId === 'R15' ? 'R6' : 'R15';
          const hint = canonJointName(RIGS[other], raw) ? ` (ชื่อนี้เป็นของ ${other})` : '';
          warnings.push(`${where}: ข้อต่อ "${raw}" ไม่มีใน ${rigId}${hint} ข้ามไป`);
          continue;
        }
        const p = pin[raw] || {};
        const rot = vec3(p.rot ?? p.rotation ?? p.r, 'rot', errors, `${where}.${raw}`);
        const pos = vec3(p.pos ?? p.position ?? p.p, 'pos', errors, `${where}.${raw}`);
        const pose = { rot: (rot || [0, 0, 0]).map(roundAngle) };
        rawRot.set(pose, rot || [0, 0, 0]);
        if (pos && pos.some((v) => v !== 0)) pose.pos = pos.map(round4);
        poses[name] = pose;
      }
      anim.keyframes.push({ time: round4(time), easing: easing || 'Linear', direction: direction || 'InOut', poses });
    });
    anim.keyframes.sort((a, b) => a.time - b.time);
    for (let i = 1; i < anim.keyframes.length; i++) {
      if (Math.abs(anim.keyframes[i].time - anim.keyframes[i - 1].time) < EPS_TIME) {
        warnings.push(`มีคีย์เฟรมเวลาซ้ำกันที่ ${anim.keyframes[i].time}s รวมเป็นอันเดียว`);
        Object.assign(anim.keyframes[i - 1].poses, anim.keyframes[i].poses);
        anim.keyframes.splice(i, 1); i--;
      }
    }

    // Rotations are interpolated the short way round, so a turn of 180° or
    // more between two keys of one joint would play in the wrong direction.
    const seen = new Set(anim.keyframes.flatMap((k) => Object.keys(k.poses)));
    for (const name of seen) {
      const keys = anim.keyframes.filter((k) => k.poses[name]);
      for (let i = 1; i < keys.length; i++) {
        const pa = keys[i - 1].poses[name], pb = keys[i].poses[name];
        const ra = rawRot.get(pa) || pa.rot, rb = rawRot.get(pb) || pb.rot;
        // Values beyond ±180 show the author meant to keep turning; compare them as written.
        const wrapped = [...ra, ...rb].some((v) => Math.abs(v) > 180);
        const rawStep = wrapped ? Math.max(...[0, 1, 2].map((ax) => Math.abs(rb[ax] - ra[ax]))) : 0;
        const d = Math.max(rotationAngle(pa.rot, pb.rot), rawStep);
        if (d > 170) warnings.push(`${name} หมุน ${Math.round(d)}° ระหว่าง ${keys[i - 1].time}s กับ ${keys[i].time}s เกิน 180° จะหมุนผิดทาง ให้เพิ่มคีย์ตรงกลาง`);
      }
    }

    (Array.isArray(data.markers) ? data.markers : []).forEach((m, i) => {
      const time = Number(m && m.time);
      if (!m || !isFinite(time) || time < 0 || !m.name) { warnings.push(`markers[${i}] ต้องมี "time" และ "name" ข้ามไป`); return; }
      anim.markers.push({ time: round4(time), name: String(m.name), value: m.value === undefined ? '' : String(m.value) });
    });
    anim.markers.sort((a, b) => a.time - b.time);

    const last = anim.keyframes.length ? anim.keyframes[anim.keyframes.length - 1].time : 0;
    const lastMarker = anim.markers.length ? anim.markers[anim.markers.length - 1].time : 0;
    let length = Number(data.length);
    if (!isFinite(length) || length <= 0) length = Math.max(last, lastMarker) || 1;
    if (length < last) { warnings.push(`length (${length}) สั้นกว่าคีย์เฟรมสุดท้าย ปรับเป็น ${last}`); length = last; }
    anim.length = round4(length);

    return { ok: errors.length === 0, errors, warnings, anim };
  }

  // ------------------------------------------------------------------
  // Sampling
  // ------------------------------------------------------------------
  function jointKeys(anim, name) {
    const keys = [];
    for (const k of anim.keyframes) if (k.poses[name]) keys.push(k);
    return keys;
  }
  /** Transform M (body axes) of one joint at time t, or null if never keyed. */
  function sampleJointM(anim, name, t) {
    const keys = jointKeys(anim, name);
    if (keys.length === 0) return null;
    if (t <= keys[0].time) return poseToM(keys[0].poses[name]);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t < b.time) {
        const span = b.time - a.time;
        const alpha = ease(a.easing, a.direction, span > 0 ? (t - a.time) / span : 1);
        const ma = poseToM(a.poses[name]), mb = poseToM(b.poses[name]);
        const q = quatSlerp(quatFromM3(ma.r), quatFromM3(mb.r), alpha);
        return {
          r: quatToM3(q),
          p: [0, 1, 2].map((i2) => ma.p[i2] + (mb.p[i2] - ma.p[i2]) * alpha),
        };
      }
    }
    return poseToM(keys[keys.length - 1].poses[name]);
  }
  /** { jointName: M } for every animated joint at time t. */
  function sampleAll(anim, t) {
    const rig = RIGS[anim.rig];
    const out = {};
    for (const jt of rig.joints) {
      const m = sampleJointM(anim, jt.name, t);
      if (m) out[jt.name] = m;
    }
    return out;
  }
  /** Same as sampleAll but as editable { rot, pos } poses. */
  function samplePoses(anim, t) {
    const ms = sampleAll(anim, t);
    const out = {};
    for (const n of Object.keys(ms)) out[n] = mToPose(ms[n]);
    return out;
  }
  /** Interpolated pose of one joint, or the rest pose if never keyed. */
  function sampleJointPose(anim, name, t) {
    const m = sampleJointM(anim, name, t);
    return m ? mToPose(m) : { rot: [0, 0, 0] };
  }

  // ------------------------------------------------------------------
  // Editing helpers
  // ------------------------------------------------------------------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function findKeyframe(anim, t) {
    return anim.keyframes.find((k) => Math.abs(k.time - t) < EPS_TIME) || null;
  }
  function sortKeyframes(anim) { anim.keyframes.sort((a, b) => a.time - b.time); }
  /** Get the keyframe at t, creating one (with the previous key's easing) if needed. */
  function ensureKeyframe(anim, t) {
    t = round4(t);
    let k = findKeyframe(anim, t);
    if (k) return k;
    const prev = [...anim.keyframes].reverse().find((x) => x.time < t);
    k = { time: t, easing: prev ? prev.easing : 'Cubic', direction: prev ? prev.direction : 'InOut', poses: {} };
    anim.keyframes.push(k);
    sortKeyframes(anim);
    if (t > anim.length) anim.length = t;
    return k;
  }
  function mirrorPose(pose) {
    const out = { rot: [pose.rot[0], -pose.rot[1], -pose.rot[2]].map(roundAngle) };
    if (pose.pos) out.pos = [-pose.pos[0], pose.pos[1], pose.pos[2]].map(round4);
    return out;
  }
  /** Swap left/right of a poses map (mirror across the character's centre). */
  function mirrorPoses(rig, poses) {
    const out = {};
    for (const name of Object.keys(poses)) {
      const jt = rig.byName[name];
      if (!jt) continue;
      out[jt.mirror] = mirrorPose(poses[name]);
    }
    return out;
  }

  /**
   * Scale all keyframe/marker times (and the length) by `factor`.
   * factor < 1 makes the animation faster. Times snap to 0.01 s; keyframes
   * that would land on the same time are pushed 0.01 s apart.
   */
  function retime(animIn, factor) {
    const anim = clone(animIn);
    const snapT = (t) => Math.round(t * factor * 100) / 100;
    let prev = -1;
    for (const k of anim.keyframes) {
      let t = snapT(k.time);
      if (t <= prev) t = Math.round((prev + 0.01) * 100) / 100;
      k.time = t; prev = t;
    }
    for (const m of anim.markers) m.time = snapT(m.time);
    const last = anim.keyframes.length ? anim.keyframes[anim.keyframes.length - 1].time : 0;
    anim.length = Math.max(last, Math.round(anim.length * factor * 100) / 100, 0.01);
    return anim;
  }

  // ------------------------------------------------------------------
  // Key editing (dope sheet). An item is { time, joint } where joint is a
  // joint name (one pose) or null (the whole keyframe).
  // ------------------------------------------------------------------
  const sameT = (a, b) => Math.abs(a - b) < EPS_TIME;
  function takeItems(anim, items) {
    const taken = [];
    const ordered = items.slice().sort((a, b) => (a.joint === null ? -1 : 0) - (b.joint === null ? -1 : 0));
    for (const it of ordered) {
      const k = anim.keyframes.find((x) => sameT(x.time, it.time));
      if (!k) continue;
      if (it.joint === null) {
        taken.push({ time: k.time, poses: k.poses, easing: k.easing, direction: k.direction, whole: true });
        k.poses = {};
        k._gone = true;
      } else if (k.poses[it.joint]) {
        taken.push({ time: k.time, poses: { [it.joint]: k.poses[it.joint] }, easing: k.easing, direction: k.direction });
        delete k.poses[it.joint];
      }
    }
    anim.keyframes = anim.keyframes.filter((k) => !k._gone && Object.keys(k.poses).length > 0);
    return taken;
  }
  function putItems(anim, taken, dt) {
    for (const it of taken) {
      const t = Math.max(0, Math.round((it.time + dt) * 100) / 100);
      const existed = !!findKeyframe(anim, t);
      const k = ensureKeyframe(anim, t);
      if (it.whole || !existed) { k.easing = it.easing; k.direction = it.direction; }
      Object.assign(k.poses, clone(it.poses));
    }
    sortKeyframes(anim);
    const last = anim.keyframes.length ? anim.keyframes[anim.keyframes.length - 1].time : 0;
    if (last > anim.length) anim.length = last;
  }
  /** Move the selected keys by dt seconds (snapped to 0.01 s). Returns a new animation. */
  function moveKeys(animIn, items, dt) {
    const anim = clone(animIn);
    const taken = takeItems(anim, items);
    putItems(anim, taken, dt);
    if (!anim.keyframes.length) anim.keyframes.push({ time: 0, easing: 'Linear', direction: 'InOut', poses: {} });
    return anim;
  }
  /** Delete the selected keys. Keeps at least one keyframe. Returns a new animation. */
  function deleteKeys(animIn, items) {
    const anim = clone(animIn);
    takeItems(anim, items);
    if (!anim.keyframes.length) anim.keyframes.push({ time: 0, easing: 'Linear', direction: 'InOut', poses: {} });
    return anim;
  }
  /** Copy the selected keys into a clip with times relative to the earliest one. */
  function copyKeys(anim, items) {
    const taken = takeItems(clone(anim), items);
    const t0 = Math.min(...taken.map((x) => x.time));
    return taken.map((x) => Object.assign({}, x, { time: Math.round((x.time - t0) * 100) / 100 }));
  }
  /** Paste a clip from copyKeys at time t. Returns a new animation. */
  function pasteKeys(animIn, clip, t) {
    const anim = clone(animIn);
    putItems(anim, clip, t);
    return anim;
  }

  /**
   * Play `b` after `a` (b converted to a's rig), `gap` seconds apart.
   * Markers move with their animation. Returns a new animation.
   */
  function concat(aIn, bIn, gap) {
    const a = validate(aIn).anim, b = convertRig(validate(bIn).anim, a.rig);
    const shift = a.length + (gap || 0);
    const out = clone(a);
    out.name = a.name + '_' + b.name;
    out.loop = false;
    putItems(out, b.keyframes.map((k) => ({ time: k.time, poses: k.poses, easing: k.easing, direction: k.direction, whole: true })), shift);
    out.markers = out.markers.concat(b.markers.map((m) => Object.assign({}, m, { time: Math.round((m.time + shift) * 10000) / 10000 })));
    out.length = Math.round((shift + b.length) * 10000) / 10000;
    return out;
  }

  // ------------------------------------------------------------------
  // Arm IK: move one arm so its grip point reaches a world-space target.
  // Used for two-handed weapons (left hand on the hilt or barrel).
  // ------------------------------------------------------------------
  const GRIP_POINT = { R15: [0, -0.15, 0], R6: [0, -1, 0] };
  function armChain(rig, side) {
    return rig.id === 'R15'
      ? { upper: side + 'UpperArm', lower: side + 'LowerArm', end: side + 'Hand' }
      : { upper: side + ' Arm', lower: null, end: side + ' Arm' };
  }
  /** Joints that move when an arm is solved (plus its weapon joint). */
  function chainNames(rig, side) {
    const ch = armChain(rig, side);
    const w = side === 'Left' ? 'LeftHandle' : 'Handle';
    return rig.id === 'R15' ? [ch.upper, ch.lower, ch.end, w] : [ch.upper, w];
  }
  /** World position of a hand's grip point for the given joint transforms. */
  function gripWorld(rig, ms, side) {
    const w = computeWorld(rig, ms);
    const end = w[armChain(rig, side).end];
    const g = m3v(end.r, GRIP_POINT[rig.id]);
    return [end.p[0] + g[0], end.p[1] + g[1], end.p[2] + g[2]];
  }
  /** A point given in a part's local frame, in world space. */
  function pointOn(rig, ms, part, local) {
    const w = computeWorld(rig, ms)[part];
    const g = m3v(w.r, local);
    return [w.p[0] + g[0], w.p[1] + g[1], w.p[2] + g[2]];
  }
  /** Coordinate descent with shrinking steps; p0/lo/hi in degrees. Returns { p, cost }. */
  function minimize(p0, lo, hi, cost, steps) {
    const n = p0.length;
    const p = p0.map((v, i) => clamp(v, lo[i], hi[i]));
    let c = cost(p);
    for (const step of steps || [30, 12, 5, 2, 0.8, 0.3, 0.1]) {
      let improved = true, guard = 0;
      while (improved && guard++ < 60) {
        improved = false;
        for (let i = 0; i < n; i++) {
          for (const dir of [1, -1]) {
            const q = p.slice();
            q[i] = clamp(q[i] + dir * step, lo[i], hi[i]);
            const cq = cost(q);
            if (cq < c - 1e-12) { p.splice(0, n, ...q); c = cq; improved = true; }
          }
        }
      }
    }
    return { p, cost: c };
  }

  /**
   * Rotate the hand on `side` (R15 wrist) so the weapon's local `axis`
   * (default +Y, the blade) points along `dirWorld`; optionally keep its local
   * `upAxis` close to `upWorld`. Returns the hand pose { rot }.
   */
  function aimWeapon(rig, ms, side, dirWorld, opts) {
    const o = opts || {};
    const axis = o.axis || [0, 1, 0];
    const joint = side === 'Left' ? 'LeftHandle' : 'Handle';
    const hand = armChain(rig, side).end;
    const work = Object.assign({}, ms);
    const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const d = norm(dirWorld), up = o.upWorld ? norm(o.upWorld) : null;
    const base = computeWorld(rig, ms);
    const names = rig.id === 'R15' ? [hand, joint] : [joint];
    const cost = (p) => {
      work[hand] = { r: eulerToM3(p), p: [0, 0, 0] };
      const w = computeChain(rig, work, base, names)[joint];
      const a = m3v(w.r, axis);
      let c = 1 - (a[0] * d[0] + a[1] * d[1] + a[2] * d[2]);
      if (up) { const u = m3v(w.r, o.upAxis || [0, 0, 1]); c += 0.3 * (1 - (u[0] * up[0] + u[1] * up[1] + u[2] * up[2])); }
      return c + 1e-7 * (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
    };
    let best = null;
    for (const seed of [[0, 0, 0], [-60, 0, 0], [60, 0, 0], [0, 60, 0], [0, -60, 0]]) {
      const r = minimize(seed, [-180, -90, -180], [180, 90, 180], cost);
      if (!best || r.cost < best.cost) best = r;
    }
    return { rot: best.p.map(roundAngle) };
  }

  /**
   * Solve arm and wrist together so the weapon on `side` sits at `target`
   * (grip point, world) pointing along `dirWorld` (weapon local `axis`, default
   * +Y = blade). Bending the wrist costs a little, so the arm does most of the
   * work. R15 only (R6 has no wrist). Returns { poses, error, angle }.
   */
  function solveWeaponIK(rig, ms, side, target, dirWorld, opts) {
    const o = opts || {};
    const ch = armChain(rig, side);
    const joint = side === 'Left' ? 'LeftHandle' : 'Handle';
    const axis = o.axis || [0, 1, 0];
    const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const d = norm(dirWorld), up = o.upWorld ? norm(o.upWorld) : null;
    const work = Object.assign({}, ms);
    const keepPos = ms[ch.upper] ? ms[ch.upper].p : [0, 0, 0];
    const apply = (p) => {
      work[ch.upper] = { r: eulerToM3([p[0], p[1], p[2]]), p: keepPos };
      work[ch.lower] = { r: eulerToM3([p[3], 0, 0]), p: [0, 0, 0] };
      work[ch.end] = { r: eulerToM3([p[4], p[5], p[6]]), p: [0, 0, 0] };
    };
    const base = computeWorld(rig, ms);
    const names = chainNames(rig, side);
    const evalPose = (p) => {
      apply(p);
      const w = computeChain(rig, work, base, names);
      const end = w[ch.end], g = m3v(end.r, GRIP_POINT[rig.id]);
      const gp = [end.p[0] + g[0], end.p[1] + g[1], end.p[2] + g[2]];
      const a = m3v(w[joint].r, axis);
      const dot = a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
      let upDot = 1;
      if (up) { const u = m3v(w[joint].r, o.upAxis || [0, 0, 1]); upDot = u[0] * up[0] + u[1] * up[1] + u[2] * up[2]; }
      return { gp, dot, upDot };
    };
    const cur = (n, i) => (ms[n] ? m3ToEuler(ms[n].r)[i] : 0);
    // When the arm already has a pose (e.g. the previous key), prefer the
    // nearest solution so neighbouring keys don't jump between solutions.
    const prefer = ms[ch.upper] ? [0, 1, 2].map((i) => cur(ch.upper, i)).concat([cur(ch.lower, 0)], [0, 1, 2].map((i) => cur(ch.end, i))) : null;
    const cost = (p) => {
      const e = evalPose(p);
      const d2 = (e.gp[0] - target[0]) ** 2 + (e.gp[1] - target[1]) ** 2 + (e.gp[2] - target[2]) ** 2;
      const wrist = (p[4] * p[4] + p[5] * p[5] + p[6] * p[6]) / 8100;
      let reg = 1e-6 * p[1] * p[1];
      if (prefer) for (let i = 0; i < p.length; i++) reg += 2e-7 * (p[i] - prefer[i]) ** 2;
      return d2 + 0.8 * (1 - e.dot) + 0.3 * (1 - e.upDot) + 0.02 * wrist + reg;
    };
    const lo = [-180, -90, -180, 0, -100, -80, -90], hi = [180, 90, 180, 150, 100, 80, 90];
    const seeds = [
      [cur(ch.upper, 0), cur(ch.upper, 1), cur(ch.upper, 2), ms[ch.lower] ? cur(ch.lower, 0) : 30, 0, 0, 0],
      [60, 0, 0, 60, 0, 0, 0], [150, 0, 0, 30, 0, 0, 0], [30, 0, side === 'Left' ? 40 : -40, 90, -40, 0, 0], [90, 30, -60, 20, 0, 0, 0],
    ];
    let best = null;
    for (const seed of seeds) {
      const r = minimize(seed, lo, hi, cost);
      if (!best || r.cost < best.cost) best = r;
    }
    const p = best.p;
    const e = evalPose(p);
    const poses = {
      [ch.upper]: { rot: [p[0], p[1], p[2]].map(roundAngle) },
      [ch.lower]: { rot: [roundAngle(p[3]), 0, 0] },
      [ch.end]: { rot: [p[4], p[5], p[6]].map(roundAngle) },
    };
    if (keepPos.some((v) => v !== 0)) poses[ch.upper].pos = keepPos.map(round4);
    return {
      poses,
      error: Math.hypot(e.gp[0] - target[0], e.gp[1] - target[1], e.gp[2] - target[2]),
      angle: Math.acos(clamp(e.dot, -1, 1)) / DEG,
    };
  }

  /**
   * Solve the arm on `side` ('Left' | 'Right') so its grip reaches `target`.
   * ms: { joint: M } for the whole body (from sampleAll / poseToM).
   * Returns { poses: { joint: {rot} }, error } (error in studs). Upper arm
   * gets x/y/z, the R15 elbow only bends (x 0..150). Pure coordinate
   * descent: small, dependency-free and fast enough for a 4-angle chain.
   */
  // Limbs for IK: arms end at the grip point, legs at the sole of the foot.
  const LIMB_END = { R15: { Arm: [0, -0.15, 0], Leg: [0, -0.15, 0] }, R6: { Arm: [0, -1, 0], Leg: [0, -1, 0] } };
  function limbChain(rig, limb) {
    const side = limb.startsWith('Left') ? 'Left' : 'Right';
    const kind = limb.endsWith('Leg') ? 'Leg' : 'Arm';
    const ch = rig.id === 'R15'
      ? { upper: side + 'Upper' + kind, lower: side + 'Lower' + kind, end: side + (kind === 'Arm' ? 'Hand' : 'Foot') }
      : { upper: side + ' ' + kind, lower: null, end: side + ' ' + kind };
    ch.side = side; ch.kind = kind; ch.endPoint = LIMB_END[rig.id][kind];
    // Elbows bend with x+, knees with x-.
    ch.bend = kind === 'Arm' ? [0, 150] : [-150, 0];
    ch.names = [ch.upper, ch.lower, ch.lower ? ch.end : null].filter(Boolean);
    if (kind === 'Arm') ch.names.push(side === 'Left' ? 'LeftHandle' : 'Handle');
    return ch;
  }
  /** Which limb a part belongs to (for dragging a hand or foot), or null. */
  function limbOfPart(rig, part) {
    for (const limb of ['RightArm', 'LeftArm', 'RightLeg', 'LeftLeg']) {
      const ch = limbChain(rig, limb);
      if (part === ch.end) return limb;
    }
    return null;
  }
  /** World position of a limb's end point (grip / sole) in an already computed world. */
  function limbEndWorld(rig, world, limb) {
    const ch = limbChain(rig, limb);
    const end = world[ch.end], g = m3v(end.r, ch.endPoint);
    return [end.p[0] + g[0], end.p[1] + g[1], end.p[2] + g[2]];
  }

  /**
   * Solve a limb ('RightArm' | 'LeftArm' | 'RightLeg' | 'LeftLeg') so its end
   * reaches `target` (world). ms: { joint: M } for the whole body. The upper
   * joint gets x/y/z, the R15 elbow/knee only bends. opts.fast: start only
   * from the current pose (smooth and quick, for dragging in the editor).
   * Returns { poses, error } (error in studs).
   */
  function solveLimbIK(rig, ms, limb, target, opts) {
    const o = opts || {};
    const ch = limbChain(rig, limb);
    const cur = ms[ch.upper] ? m3ToEuler(ms[ch.upper].r) : [0, 0, 0];
    const curBend = ch.lower && ms[ch.lower] ? m3ToEuler(ms[ch.lower].r)[0] : (ch.kind === 'Arm' ? 20 : -20);
    const work = Object.assign({}, ms);
    const keepPos = ms[ch.upper] ? ms[ch.upper].p : [0, 0, 0];
    const apply = (p) => {
      work[ch.upper] = { r: eulerToM3([p[0], p[1], p[2]]), p: keepPos };
      if (ch.lower) work[ch.lower] = { r: eulerToM3([p[3], 0, 0]), p: ms[ch.lower] ? ms[ch.lower].p : [0, 0, 0] };
    };
    const base = computeWorld(rig, ms);
    const endOf = () => {
      const end = computeChain(rig, work, base, ch.names)[ch.end];
      const g = m3v(end.r, ch.endPoint);
      return [end.p[0] + g[0], end.p[1] + g[1], end.p[2] + g[2]];
    };
    // If the limb already has a pose, prefer the solution closest to it, so
    // consecutive keys (or drag steps) don't flip the elbow/knee side.
    const prefer = ms[ch.upper] ? [...cur, curBend] : null;
    const cost = (p) => {
      apply(p);
      const g = endOf();
      const d2 = (g[0] - target[0]) ** 2 + (g[1] - target[1]) ** 2 + (g[2] - target[2]) ** 2;
      let reg = 1e-6 * (p[1] * p[1]); // tiny pull toward small twist keeps solutions natural
      if (prefer) for (let i = 0; i < p.length; i++) reg += 2e-7 * (p[i] - prefer[i]) ** 2;
      return d2 + reg;
    };
    const n = ch.lower ? 4 : 3;
    const lo = [-180, -90, -180, ch.bend[0]], hi = [180, 90, 180, ch.bend[1]];
    const out = ch.side === 'Left' ? -1 : 1;
    const seeds = o.fast ? [[...cur, curBend]]
      : ch.kind === 'Arm'
        ? [[...cur, curBend], [60, 0, 0, 60], [90, 0, -30 * out, 30], [30, 0, 0, 100]]
        : [[...cur, curBend], [30, 0, 5 * out, -30], [70, 0, 10 * out, -90], [-20, 0, 0, -20]];
    let best = null, bestC = Infinity;
    for (const seed of seeds) {
      const r = minimize(seed.slice(0, n), lo.slice(0, n), hi.slice(0, n), cost, o.fast ? [8, 3, 1, 0.3] : undefined);
      if (r.cost < bestC) { bestC = r.cost; best = r.p; }
    }
    const poses = { [ch.upper]: { rot: best.slice(0, 3).map(roundAngle) } };
    if (keepPos.some((v) => v !== 0)) poses[ch.upper].pos = keepPos.map(round4);
    if (ch.lower) poses[ch.lower] = { rot: [roundAngle(best[3]), 0, 0] };
    apply(best);
    const g = endOf();
    return { poses, error: Math.hypot(g[0] - target[0], g[1] - target[1], g[2] - target[2]) };
  }
  /** Arm-only wrapper kept for presets and the editor's two-hand button. */
  function solveArmIK(rig, ms, side, target, opts) {
    return solveLimbIK(rig, ms, side + 'Arm', target, opts);
  }


  // ------------------------------------------------------------------
  // R15 <-> R6
  // ------------------------------------------------------------------
  const R15_TO_R6 = {
    'Head': 'Head', 'Handle': 'Handle', 'LeftHandle': 'LeftHandle',
    'RightUpperArm': 'Right Arm', 'LeftUpperArm': 'Left Arm',
    'RightUpperLeg': 'Right Leg', 'LeftUpperLeg': 'Left Leg',
  };
  function convertRig(anim, targetId) {
    if (anim.rig === targetId) return clone(anim);
    const out = clone(anim);
    out.rig = targetId;
    if (anim.rig === 'R15' && targetId === 'R6') {
      out.keyframes = anim.keyframes.map((k) => {
        const poses = {};
        const ms = sampleAll(anim, k.time);
        if (k.poses.LowerTorso || k.poses.UpperTorso) {
          const lower = ms.LowerTorso || cf();
          const upper = ms.UpperTorso || cf();
          poses.Torso = mToPose({ r: m3mul(lower.r, upper.r), p: lower.p });
        }
        for (const [from, to] of Object.entries(R15_TO_R6)) if (k.poses[from]) poses[to] = clone(k.poses[from]);
        return { time: k.time, easing: k.easing, direction: k.direction, poses };
      });
    } else {
      out.keyframes = anim.keyframes.map((k) => {
        const poses = {};
        if (k.poses.Torso) poses.LowerTorso = clone(k.poses.Torso);
        for (const [to, from] of Object.entries(R15_TO_R6)) if (k.poses[from]) poses[to] = clone(k.poses[from]);
        return { time: k.time, easing: k.easing, direction: k.direction, poses };
      });
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Export: Roblox XML model (.rbxmx) containing a KeyframeSequence
  // ------------------------------------------------------------------
  const PRIORITY_TOKEN = { Idle: 0, Movement: 1, Action: 2, Action2: 3, Action3: 4, Action4: 5, Core: 1000 };
  // Enum.PoseEasingStyle: Linear 0, Constant 1, Elastic 2, Cubic 3, Bounce 4, CubicV2 5
  const STYLE_TOKEN = { Linear: 0, Constant: 1, Elastic: 2, Cubic: 5, Bounce: 4 };
  const DIR_TOKEN = { In: 0, Out: 1, InOut: 2 };
  // The legacy Elastic/Bounce pose styles run In/Out the opposite way to
  // TweenService. Cubic is exported as CubicV2, which runs the normal way.
  // Flip so Studio plays what the preview shows. Studio plugin does the same.
  const FLIP_LEGACY_DIRECTION = true;
  function exportDirection(style, dir) {
    if (FLIP_LEGACY_DIRECTION && (style === 'Elastic' || style === 'Bounce')) {
      if (dir === 'In') return DIR_TOKEN.Out;
      if (dir === 'Out') return DIR_TOKEN.In;
    }
    return DIR_TOKEN[dir] ?? 2;
  }

  const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function num(v) {
    const r = Math.round(v * 1e6) / 1e6;
    return Object.is(r, -0) || r === 0 ? '0' : String(r);
  }

  function toRbxmx(animIn) {
    const res = validate(animIn);
    if (!res.ok) throw new Error(res.errors.join('\n'));
    const anim = res.anim;
    const rig = RIGS[anim.rig];
    let ref = 0;
    const nextRef = () => 'RBX' + (ref++).toString(16).toUpperCase().padStart(8, '0');
    const lines = [];
    const w = (depth, s) => lines.push('  '.repeat(depth) + s);

    w(0, '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">');
    w(1, `<Item class="KeyframeSequence" referent="${nextRef()}">`);
    w(2, '<Properties>');
    w(3, `<bool name="Loop">${anim.loop ? 'true' : 'false'}</bool>`);
    w(3, `<string name="Name">${xmlEsc(anim.name)}</string>`);
    w(3, `<token name="Priority">${PRIORITY_TOKEN[anim.priority]}</token>`);
    w(2, '</Properties>');

    // Merge marker times into the keyframe list, and pad to `length`.
    const frames = anim.keyframes.map((k) => ({ time: k.time, k, markers: [] }));
    const frameAt = (t) => {
      let f = frames.find((x) => Math.abs(x.time - t) < EPS_TIME);
      if (!f) { f = { time: t, k: null, markers: [] }; frames.push(f); }
      return f;
    };
    anim.markers.forEach((m) => frameAt(m.time).markers.push(m));
    frameAt(anim.length);
    frames.sort((a, b) => a.time - b.time);

    for (const f of frames) {
      w(2, `<Item class="Keyframe" referent="${nextRef()}">`);
      w(3, '<Properties>');
      w(4, '<string name="Name">Keyframe</string>');
      w(4, `<float name="Time">${num(f.time)}</float>`);
      w(3, '</Properties>');
      if (f.k) writePoseTree(f.k, 3);
      for (const m of f.markers) {
        w(3, `<Item class="KeyframeMarker" referent="${nextRef()}">`);
        w(4, '<Properties>');
        w(5, `<string name="Name">${xmlEsc(m.name)}</string>`);
        w(5, `<string name="Value">${xmlEsc(m.value)}</string>`);
        w(4, '</Properties>');
        w(3, '</Item>');
      }
      w(2, '</Item>');
    }
    w(1, '</Item>');
    w(0, '</roblox>');
    return lines.join('\n') + '\n';

    function writePoseTree(k, depth) {
      // Which parts need a Pose: keyed joints and all their ancestors.
      const need = new Set();
      for (const name of Object.keys(k.poses)) {
        let n = name;
        while (n && !need.has(n)) { need.add(n); n = n === rig.rootPart ? null : (rig.byName[n] ? rig.byName[n].parent : null); }
      }
      if (need.size === 0) return;
      const children = (parent) => rig.joints.filter((jt) => jt.parent === parent && need.has(jt.name)).map((jt) => jt.name);
      const writePose = (name, d) => {
        const pose = k.poses[name];
        const t = pose ? poseToTransform(rig, name, pose) : cf();
        const r = t.r;
        w(d, `<Item class="Pose" referent="${nextRef()}">`);
        w(d + 1, '<Properties>');
        w(d + 2, '<CoordinateFrame name="CFrame">');
        w(d + 3, `<X>${num(t.p[0])}</X><Y>${num(t.p[1])}</Y><Z>${num(t.p[2])}</Z>`);
        w(d + 3, `<R00>${num(r[0])}</R00><R01>${num(r[1])}</R01><R02>${num(r[2])}</R02>`);
        w(d + 3, `<R10>${num(r[3])}</R10><R11>${num(r[4])}</R11><R12>${num(r[5])}</R12>`);
        w(d + 3, `<R20>${num(r[6])}</R20><R21>${num(r[7])}</R21><R22>${num(r[8])}</R22>`);
        w(d + 2, '</CoordinateFrame>');
        w(d + 2, `<token name="EasingDirection">${exportDirection(k.easing, k.direction)}</token>`);
        w(d + 2, `<token name="EasingStyle">${STYLE_TOKEN[k.easing] ?? 0}</token>`);
        w(d + 2, `<string name="Name">${xmlEsc(name)}</string>`);
        // Structural parent poses that are not animated get weight 0.
        w(d + 2, `<float name="Weight">${pose ? 1 : 0}</float>`);
        w(d + 1, '</Properties>');
        for (const c of children(name)) writePose(c, d + 1);
        w(d, '</Item>');
      };
      writePose(rig.rootPart, depth);
    }
  }

  /**
   * Read a KeyframeSequence back from .rbxmx text. Needs an XML DOM parser
   * (pass `new DOMParser()` in the browser). Pose CFrames are converted back
   * into body-axis rotations using the rig's default C0 rotations.
   */
  function fromRbxmx(xmlText, domParser) {
    const doc = domParser.parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('ไฟล์ .rbxmx เสียหรือไม่ใช่ XML');
    const items = [...doc.getElementsByTagName('Item')];
    const kfsItem = items.find((it) => it.getAttribute('class') === 'KeyframeSequence');
    if (!kfsItem) throw new Error('ไม่พบ KeyframeSequence ในไฟล์ (รองรับเฉพาะ .rbxmx แบบ XML)');
    const props = (it) => [...it.children].find((c) => c.tagName === 'Properties');
    const prop = (it, tag, name) => {
      const p = props(it);
      if (!p) return null;
      return [...p.children].find((c) => c.tagName === tag && c.getAttribute('name') === name) || null;
    };
    const text = (el) => (el ? el.textContent.trim() : null);
    const kids = (it, cls) => [...it.children].filter((c) => c.tagName === 'Item' && c.getAttribute('class') === cls);

    const name = text(prop(kfsItem, 'string', 'Name')) || 'Imported';
    const loop = text(prop(kfsItem, 'bool', 'Loop')) === 'true';
    const prTok = Number(text(prop(kfsItem, 'token', 'Priority')));
    const priority = Object.keys(PRIORITY_TOKEN).find((k) => PRIORITY_TOKEN[k] === prTok) || 'Action';
    const styleName = (tok) => ({ 0: 'Linear', 1: 'Constant', 2: 'Elastic', 3: 'Cubic', 4: 'Bounce', 5: 'Cubic' })[tok] || 'Linear';

    const poseNames = new Set();
    const rawFrames = kids(kfsItem, 'Keyframe').map((kf) => {
      const time = Number(text(prop(kf, 'float', 'Time')) || 0);
      const poses = [];
      const walk = (poseItem) => {
        const pn = text(prop(poseItem, 'string', 'Name'));
        const weight = Number(text(prop(poseItem, 'float', 'Weight')) ?? 1);
        const cfe = prop(poseItem, 'CoordinateFrame', 'CFrame');
        const g = (t) => { const e = cfe && [...cfe.children].find((c) => c.tagName === t); return e ? Number(e.textContent) : 0; };
        const t = { p: [g('X'), g('Y'), g('Z')], r: ['R00', 'R01', 'R02', 'R10', 'R11', 'R12', 'R20', 'R21', 'R22'].map(g) };
        if (!cfe) t.r = I3.slice();
        const style = Number(text(prop(poseItem, 'token', 'EasingStyle')) || 0);
        const dir = Number(text(prop(poseItem, 'token', 'EasingDirection')) || 0);
        poseNames.add(pn);
        poses.push({ name: pn, weight, t, style, dir });
        kids(poseItem, 'Pose').forEach(walk);
      };
      kids(kf, 'Pose').forEach(walk);
      const markers = kids(kf, 'KeyframeMarker').map((m) => ({
        time, name: text(prop(m, 'string', 'Name')) || 'Marker', value: text(prop(m, 'string', 'Value')) || '',
      }));
      return { time, poses, markers };
    });
    const rigId = poseNames.has('UpperTorso') || poseNames.has('LowerTorso') ? 'R15' : poseNames.has('Torso') ? 'R6' : 'R15';
    const rig = RIGS[rigId];
    const anim = { format: FORMAT, name, rig: rigId, loop, priority, keyframes: [], markers: [] };
    for (const f of rawFrames) {
      const k = { time: f.time, easing: 'Linear', direction: 'InOut', poses: {} };
      for (const p of f.poses) {
        if (!rig.byName[p.name] || p.weight === 0) continue;
        k.poses[p.name] = transformToPose(rig, p.name, p.t);
        k.easing = styleName(p.style);
        let dir = ['In', 'Out', 'InOut'][p.dir] || 'InOut';
        if (FLIP_LEGACY_DIRECTION && (k.easing === 'Elastic' || k.easing === 'Bounce') && dir !== 'InOut') dir = dir === 'In' ? 'Out' : 'In';
        k.direction = dir;
      }
      anim.keyframes.push(k);
      anim.markers.push(...f.markers);
    }
    const res = validate(anim);
    if (!res.ok) throw new Error(res.errors.join('\n'));
    // Drop keyframes that have no poses and no markers (padding frames),
    // but keep the length they implied.
    const len = res.anim.length;
    res.anim.keyframes = res.anim.keyframes.filter((k, i) => i === 0 || Object.keys(k.poses).length > 0);
    res.anim.length = len;
    return res.anim;
  }

  /** Pretty JSON with short number arrays kept on one line (easy to read and diff). */
  function toJSON(anim) {
    const s = JSON.stringify(anim, null, 2);
    return s.replace(/\[\s+(-?[\d.e+-]+),\s+(-?[\d.e+-]+),\s+(-?[\d.e+-]+)\s+\]/g, '[$1, $2, $3]') + '\n';
  }

  /** Angle in degrees between two Euler rotations. */
  function rotationAngle(ra, rb) {
    const a = eulerToM3(ra), b = eulerToM3(rb);
    let tr = 0;
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) tr += a[k * 3 + i] * b[k * 3 + i];
    return Math.acos(clamp((tr - 1) / 2, -1, 1)) / DEG;
  }

  function round4(v) { const r = Math.round(v * 1e4) / 1e4; return Object.is(r, -0) ? 0 : r; }
  function roundAngle(v) {
    let r = Math.round(v * 100) / 100;
    if (r > 180) r -= 360; if (r <= -180) r += 360;
    return Object.is(r, -0) ? 0 : r;
  }

  return {
    FORMAT, RIGS, PRIORITIES, EASING_STYLES, EASING_DIRECTIONS,
    // math
    I3, eulerToM3, m3ToEuler, m3mul, cf, cfMul, cfInv, quatFromM3, quatToM3, quatSlerp,
    // rig
    computeWorld, restHeight, poseToM, mToPose, poseToTransform, transformToPose,
    // format
    newAnimation, parseLoose, validate, toJSON, clone,
    // sampling & editing
    ease, sampleJointM, sampleAll, samplePoses, sampleJointPose,
    findKeyframe, ensureKeyframe, sortKeyframes, mirrorPose, mirrorPoses, convertRig, retime,
    moveKeys, deleteKeys, copyKeys, pasteKeys, concat,
    // io
    toRbxmx, fromRbxmx,
    // ik
    solveArmIK, solveLimbIK, limbChain, limbOfPart, limbEndWorld, solveWeaponIK, aimWeapon, gripWorld, pointOn, GRIP_POINT,
    round4, roundAngle, rotationAngle,
  };
});
