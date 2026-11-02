#!/usr/bin/env node
/*
 * NineAnimator command line — for scripts and AI coding agents.
 *
 *   node tools/nine.js validate anim.json
 *   node tools/nine.js rbxmx anim.json [out.rbxmx]
 *   node tools/nine.js convert anim.json R6 [out.json]
 *   node tools/nine.js mirror anim.json [out.json]          swap left/right
 *   node tools/nine.js retime anim.json 0.8 [out.json]      0.8 = faster, 1.25 = slower
 *   node tools/nine.js concat a.json b.json [gap] [out.json] play b after a
 *   node tools/nine.js info anim.json                        joints, markers, timing
 *   node tools/nine.js prompt [R15|R6] [description...]
 *   node tools/nine.js presets [--json]
 *   node tools/nine.js preset <id> [R15|R6]
 *   node tools/nine.js export-presets <dir>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../web/js/nine-core.js');
const P = require('../web/js/presets.js');
const AI = require('../web/js/ai-prompt.js');

const [, , cmd, ...args] = process.argv;

function load(file) {
  const res = C.validate(fs.readFileSync(file, 'utf8'));
  res.warnings.forEach((w) => console.error('warning: ' + w));
  if (!res.ok) {
    res.errors.forEach((e) => console.error('error: ' + e));
    process.exit(1);
  }
  return res.anim;
}
function out(text, file) {
  if (file) { fs.writeFileSync(file, text); console.error('wrote ' + file); } else process.stdout.write(text);
}

switch (cmd) {
  case 'validate': {
    const a = load(args[0]);
    console.log(`ok: ${a.name} (${a.rig}, ${a.keyframes.length} keyframes, ${a.length}s, ${a.markers.length} markers)`);
    break;
  }
  case 'rbxmx': {
    const a = load(args[0]);
    out(C.toRbxmx(a), args[1] || args[0].replace(/\.json$/i, '') + '.rbxmx');
    break;
  }
  case 'convert': {
    const target = String(args[1] || '').toUpperCase();
    if (!C.RIGS[target]) { console.error('target rig must be R15 or R6'); process.exit(1); }
    out(C.toJSON(C.convertRig(load(args[0]), target)), args[2]);
    break;
  }
  case 'mirror': {
    const a = load(args[0]);
    const rig = C.RIGS[a.rig];
    a.keyframes.forEach((k) => { k.poses = C.mirrorPoses(rig, k.poses); });
    a.name += 'Mirror';
    out(C.toJSON(a), args[1]);
    break;
  }
  case 'retime': {
    const f = Number(args[1]);
    if (!(f > 0)) { console.error('factor must be a positive number, e.g. 0.8 (faster) or 1.25 (slower)'); process.exit(1); }
    out(C.toJSON(C.retime(load(args[0]), f)), args[2]);
    break;
  }
  case 'concat': {
    const gapArg = args[2] !== undefined && !isNaN(Number(args[2]));
    const gap = gapArg ? Number(args[2]) : 0;
    out(C.toJSON(C.concat(load(args[0]), load(args[1]), gap)), gapArg ? args[3] : args[2]);
    break;
  }
  case 'info': {
    const a = load(args[0]);
    const joints = [...new Set(a.keyframes.flatMap((k) => Object.keys(k.poses)))];
    console.log(`${a.name}  rig ${a.rig}  ${a.length}s  ${a.loop ? 'loop' : 'once'}  priority ${a.priority}`);
    console.log(`keyframes (${a.keyframes.length}): ${a.keyframes.map((k) => k.time).join(', ')}`);
    console.log(`joints (${joints.length}): ${joints.join(', ')}`);
    console.log(`markers (${a.markers.length}): ${a.markers.map((m) => `${m.time}s ${m.name}${m.value ? '=' + m.value : ''}`).join(', ') || '-'}`);
    break;
  }
  case 'prompt': {
    let rig = 'R15', rest = args;
    if (args[0] && /^r(6|15)$/i.test(args[0])) { rig = args[0].toUpperCase(); rest = args.slice(1); }
    out(AI.buildPrompt(rig, rest.join(' ')) + '\n');
    break;
  }
  case 'presets':
    if (args[0] === '--json') {
      const cats = Object.fromEntries(P.CATEGORIES);
      out(JSON.stringify(P.LIST.map((p) => {
        const a = p.make();
        return { id: p.id, category: p.cat, categoryLabel: cats[p.cat], label: p.label, prop: p.prop, name: a.name, length: a.length, loop: a.loop, priority: a.priority, markers: [...new Set(a.markers.map((m) => m.name))] };
      }), null, 2) + '\n');
    } else {
      for (const [cat, label] of P.CATEGORIES) {
        console.log(`\n# ${label}`);
        P.LIST.filter((p) => p.cat === cat).forEach((p) => console.log(`${p.id.padEnd(14)} ${p.label}`));
      }
    }
    break;
  case 'preset': {
    const a = P.get(args[0]);
    if (!a) { console.error('unknown preset; run: node tools/nine.js presets'); process.exit(1); }
    out(C.toJSON(C.convertRig(a, (args[1] || 'R15').toUpperCase())));
    break;
  }
  case 'export-presets': {
    const dir = args[0] || 'examples';
    fs.mkdirSync(dir, { recursive: true });
    for (const p of P.LIST) {
      for (const rig of ['R15', 'R6']) {
        const a = C.validate(C.convertRig(p.make(), rig)).anim;
        fs.writeFileSync(path.join(dir, `${p.id}.${rig}.json`), C.toJSON(a));
      }
    }
    console.error(`wrote ${P.LIST.length * 2} files to ${dir}`);
    break;
  }
  default:
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 15).map((l) => l.replace(/^ \*\s?/, '')).join('\n'));
    process.exit(cmd ? 1 : 0);
}
