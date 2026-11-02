// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const C = require('../web/js/nine-core.js');
const P = require('../web/js/presets.js');

const close = (a, b, eps = 1e-3) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, `${a} vs ${b}`));

test('euler round trip matches CFrame.Angles convention', () => {
  for (const e of [[10, 20, 30], [-45, 80, 5], [90, 0, 0], [0, -30, 170], [120, 10, -60]]) {
    const m = C.eulerToM3(e);
    close(C.eulerToM3(C.m3ToEuler(m)), m, 1e-9);
  }
  // CFrame.Angles(0, 0, rad(90)) maps +X to +Y
  const m = C.eulerToM3([0, 0, 90]);
  close([m[0], m[3], m[6]], [0, 1, 0], 1e-9);
});

test('pose <-> Transform round trip on every R6 and R15 joint', () => {
  for (const rig of Object.values(C.RIGS)) {
    for (const jt of rig.joints) {
      const pose = { rot: [25, -40, 15], pos: [0.1, -0.2, 0.3] };
      const back = C.transformToPose(rig, jt.name, C.poseToTransform(rig, jt.name, pose));
      close(back.rot, pose.rot); close(back.pos, pose.pos);
    }
  }
});

test('arm x+ swings forward, z+ outward, on both rigs', () => {
  // Direction the arm points = the part's -Y axis in world space.
  const down = (w, n) => [-w[n].r[1], -w[n].r[4], -w[n].r[7]];
  for (const [id, arm] of [['R15', 'RightUpperArm'], ['R6', 'Right Arm']]) {
    const rig = C.RIGS[id];
    close(down(C.computeWorld(rig, {}), arm), [0, -1, 0]);
    close(down(C.computeWorld(rig, { [arm]: C.poseToM({ rot: [90, 0, 0] }) }), arm), [0, 0, -1]);
    close(down(C.computeWorld(rig, { [arm]: C.poseToM({ rot: [0, 0, 90] }) }), arm), [1, 0, 0]);
  }
});

test('rigs stand on the ground', () => {
  assert.ok(Math.abs(C.restHeight(C.RIGS.R6) - 3) < 1e-6);
  assert.ok(Math.abs(C.restHeight(C.RIGS.R15) - 3) < 0.02);
});

test('presets validate and export on both rigs', () => {
  for (const p of P.LIST) {
    for (const rigId of ['R15', 'R6']) {
      const a = C.convertRig(p.make(), rigId);
      const res = C.validate(a);
      assert.ok(res.ok, p.id + ' ' + rigId + ': ' + res.errors.join(','));
      assert.deepStrictEqual(res.warnings, [], p.id + ' ' + rigId);
      const xml = C.toRbxmx(res.anim);
      assert.match(xml, /<Item class="KeyframeSequence"/);
      assert.ok((xml.match(/<Item /g) || []).length === (xml.match(/<\/Item>/g) || []).length);
    }
  }
});

test('validate is forgiving with AI output', () => {
  const txt = 'Here you go:\n```json\n{ "name": "Test", // comment\n "rig": "r15", "keyframes": [ {"time": 0, "poses": {"right upper arm": {"rot": {"x": 10, "y": 0, "z": 0}}}}, ], }\n```';
  const res = C.validate(txt);
  assert.ok(res.ok, res.errors.join());
  assert.deepStrictEqual(res.anim.keyframes[0].poses.RightUpperArm.rot, [10, 0, 0]);
  const bad = C.validate({ rig: 'R15', keyframes: [{ time: -1 }] });
  assert.ok(!bad.ok);
});

test('mirror swaps sides', () => {
  const m = C.mirrorPoses(C.RIGS.R15, { RightUpperArm: { rot: [10, 20, 30] }, Head: { rot: [0, 15, 0] } });
  assert.deepStrictEqual(m.LeftUpperArm.rot, [10, -20, -30]);
  assert.deepStrictEqual(m.Head.rot, [0, -15, 0]);
});

test('rbxmx: only keyed joints get weight 1, ancestors weight 0', () => {
  const xml = C.toRbxmx({ rig: 'R15', name: 'A', keyframes: [{ time: 0, poses: { RightLowerArm: { rot: [90, 0, 0] } } }, { time: 0.5, poses: { RightLowerArm: { rot: [0, 0, 0] } } }], markers: [{ time: 0.25, name: 'Hit' }] });
  assert.strictEqual((xml.match(/<float name="Weight">1<\/float>/g) || []).length, 2);
  assert.strictEqual((xml.match(/<float name="Weight">0<\/float>/g) || []).length, 8); // HRP, LowerTorso, UpperTorso, RightUpperArm x2
  assert.match(xml, /KeyframeMarker[\s\S]*<string name="Name">Hit<\/string>/);
  assert.strictEqual((xml.match(/class="Keyframe"/g) || []).length, 3);
});
