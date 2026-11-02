/*
 * NineAnimator editor UI. Owns the animation state, undo history,
 * inspector, timeline, AI dialog and import/export.
 */
(function () {
  'use strict';
  const C = window.NineCore, P = window.NinePresets, AI = window.NineAI;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const STORE_KEY = 'nineanimator.current.v1';
  const SNAP = 0.01, STEP = 0.05;

  const state = {
    anim: null,
    time: 0,
    playing: false,
    speed: 1,
    loopPreview: true,
    onion: false,
    selected: null,
    clipboard: null,
    keySel: new Set(), // dope-sheet selection: "time|joint" ("*" = whole keyframe)
    keyClip: null,
    lastCopy: null, // 'pose' | 'keys'
    layer: null, // { id, anim, time } played underneath for preview
    fx: true, // preview effects (trails, sparks, shake) and hit-stop
    cinematic: false, // camera slowly orbits while playing
    hitStop: 0,
    recording: null,
    undo: [], redo: [],
    editing: false,
  };
  const snap = (t) => Math.max(0, Math.round(t / SNAP) * SNAP);
  const fmt = (t) => t.toFixed(2);

  // ---------------------------------------------------------------
  // History
  // ---------------------------------------------------------------
  function snapshot() { return JSON.stringify(state.anim); }
  function pushUndo() {
    state.undo.push(snapshot());
    if (state.undo.length > 200) state.undo.shift();
    state.redo.length = 0;
  }
  function beginEdit() { if (!state.editing) { pushUndo(); state.editing = true; } }
  function endEdit() { state.editing = false; save(); }
  function undo() {
    if (!state.undo.length) return toast('ไม่มีอะไรให้ย้อนแล้ว');
    state.redo.push(snapshot());
    state.anim = JSON.parse(state.undo.pop());
    afterLoad(false);
  }
  function redo() {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    state.anim = JSON.parse(state.redo.pop());
    afterLoad(false);
  }
  // Small per-browser UI preferences (prop, onion skin).
  const prefs = {
    get(k, d) { try { const v = localStorage.getItem('nineanimator.pref.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('nineanimator.pref.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  function save() {
    try { localStorage.setItem(STORE_KEY, snapshot()); } catch (e) { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------
  let toastTimer = 0;
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.dataset.kind = kind || 'info';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ---------------------------------------------------------------
  // Viewer
  // ---------------------------------------------------------------
  let viewer;
  function initViewer() {
    viewer = new window.NineViewer($('#viewport'), {
      onPick: (name) => select(name),
      onPoseDragStart: () => { pause(); beginEdit(); },
      onPoseDrag: (name, fn) => {
        const cur = C.sampleJointPose(state.anim, name, state.time);
        setJointPose(name, fn(cur), true);
      },
      onPoseDragEnd: () => { endEdit(); renderAll(); },
      onIKDragStart: () => { pause(); beginEdit(); },
      onIKDrag: (limb, target) => {
        const t = snap(state.time);
        state.time = t;
        const res = C.solveLimbIK(C.RIGS[state.anim.rig], C.sampleAll(state.anim, t), limb, target, { fast: true });
        const k = C.ensureKeyframe(state.anim, t);
        Object.assign(k.poses, res.poses);
        drawPose(); renderInspectorValues(); renderTimeline();
      },
      onIKDragEnd: () => { endEdit(); renderAll(); },
    });
    const themeChanged = () => viewer.applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
    new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function drawPose() {
    const ms = C.sampleAll(state.anim, state.time);
    // Layer preview: joints this animation doesn't touch come from the layer (like Roblox priorities).
    viewer.setPose(state.layer ? Object.assign(C.sampleAll(state.layer.anim, state.layer.time), ms) : ms, { playing: state.playing });
    drawGhosts();
  }
  /** Onion skin: neighbouring keyframes as translucent copies (paused only). */
  function drawGhosts() {
    if (!state.onion || state.playing) { viewer.setGhosts(null); return; }
    const t = snap(state.time);
    const ks = state.anim.keyframes;
    const prev = [...ks].reverse().find((k) => k.time < t - 1e-4);
    const next = ks.find((k) => k.time > t + 1e-4);
    viewer.setGhosts([prev ? C.sampleAll(state.anim, prev.time) : null, next ? C.sampleAll(state.anim, next.time) : null]);
  }

  // ---------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------
  function currentKeyframe() { return C.findKeyframe(state.anim, snap(state.time)); }

  function setJointPose(name, pose, live) {
    if (!live) beginEdit();
    const t = snap(state.time);
    state.time = t;
    const k = C.ensureKeyframe(state.anim, t);
    k.poses[name] = pose;
    drawPose();
    if (live) { renderInspectorValues(); renderTimeline(); } else { endEdit(); renderAll(); }
  }

  function addKeyframe() {
    pause();
    pushUndo();
    const t = snap(state.time);
    const poses = C.samplePoses(state.anim, t);
    const k = C.ensureKeyframe(state.anim, t);
    for (const [n, p] of Object.entries(poses)) if (!k.poses[n]) k.poses[n] = p;
    save(); renderAll();
    toast(`เพิ่มคีย์เฟรมที่ ${fmt(t)} วินาที`);
  }
  function deleteKeyframe() {
    const k = currentKeyframe();
    if (!k) return toast('เลื่อนเส้นเวลาไปที่คีย์เฟรมก่อน แล้วค่อยลบ');
    if (state.anim.keyframes.length === 1) return toast('ต้องเหลือคีย์เฟรมอย่างน้อย 1 อัน');
    pushUndo();
    state.anim.keyframes = state.anim.keyframes.filter((x) => x !== k);
    save(); renderAll(); drawPose();
  }
  function clearJointKey() {
    const k = currentKeyframe();
    if (!state.selected || !k || !k.poses[state.selected]) return;
    pushUndo();
    delete k.poses[state.selected];
    save(); renderAll(); drawPose();
  }
  function resetJoint() {
    if (!state.selected) return;
    setJointPose(state.selected, { rot: [0, 0, 0] });
  }
  function posesAtTime() { return C.samplePoses(state.anim, snap(state.time)); }
  function copyPose() {
    state.clipboard = posesAtTime();
    state.lastCopy = 'pose';
    toast('คัดลอกท่าทั้งตัวแล้ว เลื่อนเวลาไปที่อื่นแล้วกด "วางท่า"');
    renderInspector();
  }
  function pastePose(mirror) {
    const src = mirror ? C.mirrorPoses(C.RIGS[state.anim.rig], posesAtTime()) : state.clipboard;
    if (!src) return;
    pause(); pushUndo();
    const k = C.ensureKeyframe(state.anim, snap(state.time));
    Object.assign(k.poses, C.clone(src));
    save(); renderAll(); drawPose();
    toast(mirror ? 'สลับท่าซ้าย↔ขวาแล้ว' : 'วางท่าแล้ว');
  }
  function resetBody() {
    pause(); pushUndo();
    const k = C.ensureKeyframe(state.anim, snap(state.time));
    for (const jt of C.RIGS[state.anim.rig].joints) k.poses[jt.name] = { rot: [0, 0, 0] };
    save(); renderAll(); drawPose();
  }

  // ---------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------
  let lastTs = 0;
  function play() {
    if (state.playing) return;
    if (state.time >= state.anim.length - 1e-6) state.time = 0;
    state.playing = true; lastTs = performance.now();
    $('#btn-play').dataset.playing = 'true';
    $('#btn-play').setAttribute('aria-label', 'หยุด');
    requestAnimationFrame(tick);
  }
  function pause() {
    const was = state.playing;
    state.playing = false;
    if (was && viewer && viewer.fx) viewer.fx.clear();
    if (was && state.recording) finishRecording();
    if (was) setTimeout(() => { renderInspector(); renderPlayhead(); drawGhosts(); });
    $('#btn-play').dataset.playing = 'false';
    $('#btn-play').setAttribute('aria-label', 'เล่น');
  }
  function tick(ts) {
    if (!state.playing) return;
    const realDt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    if (state.cinematic) { viewer.orbit.yaw -= realDt * 0.35; }
    // Hit-stop: freeze for a few frames on impact, like action games do.
    if (state.hitStop > 0) {
      state.hitStop -= realDt;
      viewer.render();
      requestAnimationFrame(tick);
      return;
    }
    const dt = realDt * state.speed;
    const prev = state.time;
    state.time += dt;
    if (state.layer) state.layer.time = (state.layer.time + dt) % Math.max(0.01, state.layer.anim.length);
    const L = state.anim.length;
    for (const m of state.anim.markers) {
      if (m.time > prev && m.time <= state.time) {
        flashMarker(m);
        if (state.fx && viewer.fx) {
          state.time = Math.min(state.time, L);
          drawPose();
          viewer.fx.trigger(m);
          if (m.name === 'Hit') state.hitStop = /slam|quake|pound|stomp|finish/i.test(m.value) ? 0.12 : 0.06;
        }
      }
    }
    if (state.time >= L) {
      if (state.loopPreview) state.time = L > 0 ? state.time % L : 0;
      else { state.time = L; pause(); }
    }
    drawPose(); renderPlayhead();
    requestAnimationFrame(tick);
  }
  function seek(t, keepPlaying) {
    if (!keepPlaying) pause();
    state.time = Math.max(0, Math.min(state.anim.length, t));
    drawPose(); renderPlayhead(); renderInspector();
  }
  function flashMarker(m) {
    const el = $('#marker-flash');
    el.textContent = '⚑ ' + m.name;
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(flashMarker.t);
    flashMarker.t = setTimeout(() => { el.hidden = true; }, 500);
  }

  // ---------------------------------------------------------------
  // Selection & inspector
  // ---------------------------------------------------------------
  const GROUPS = [
    ['body', 'ลำตัว'], ['right-arm', 'แขนขวา'], ['left-arm', 'แขนซ้าย'], ['right-leg', 'ขาขวา'], ['left-leg', 'ขาซ้าย'], ['weapon', 'อาวุธ'],
  ];
  function select(name) {
    state.selected = name || null;
    // The weapon joint is only visible with the sword prop.
    if (name && viewer.weaponJoints && C.RIGS[state.anim.rig].byName[name].group === 'weapon' && !viewer.weaponJoints().includes(name)) {
      setProp(name === 'Handle' ? 'sword' : 'dual');
    }
    viewer.setSelected(state.selected);
    renderInspector(); renderTimeline();
  }
  function axisLabels(jt) {
    if (jt.group === 'weapon') return ['กระดกใบ ขึ้น / ลง', 'ปัดใบ ซ้าย / ขวา', 'หมุนรอบใบ'];
    if (jt.group === 'body') return ['ก้ม / เงย', 'หัน ซ้าย / ขวา', 'เอียงข้าง'];
    if (/LowerArm/.test(jt.name)) return ['งอศอก', 'บิด', 'ปัดข้าง'];
    if (/LowerLeg/.test(jt.name)) return ['งอเข่า (ค่าลบ)', 'บิด', 'ปัดข้าง'];
    if (/Hand|Foot/.test(jt.name)) return ['กระดก', 'บิด', 'เอียง'];
    return ['แกว่ง หน้า / หลัง', 'บิด', 'กาง / หุบ'];
  }

  function renderJointList() {
    const rig = C.RIGS[state.anim.rig];
    const k = currentKeyframe();
    const animated = new Set();
    state.anim.keyframes.forEach((kf) => Object.keys(kf.poses).forEach((n) => animated.add(n)));
    const wrap = $('#joint-list');
    wrap.innerHTML = '';
    for (const [g, label] of GROUPS) {
      const joints = rig.joints.filter((jt) => jt.group === g);
      if (!joints.length) continue;
      const row = document.createElement('div');
      row.className = 'joint-group';
      row.innerHTML = `<span class="joint-group-label">${label}</span>`;
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const jt of joints) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.joint = jt.name;
        b.setAttribute('aria-pressed', String(state.selected === jt.name));
        const keyed = k && k.poses[jt.name];
        b.innerHTML = `<span class="dot" data-state="${keyed ? 'key' : animated.has(jt.name) ? 'anim' : 'none'}"></span>${shortName(jt)}`;
        b.title = `${jt.label} (${jt.name})`;
        b.addEventListener('click', () => select(state.selected === jt.name ? null : jt.name));
        chips.appendChild(b);
      }
      row.appendChild(chips);
      wrap.appendChild(row);
    }
  }
  function shortName(jt) {
    if (jt.group === 'weapon') return jt.name === 'LeftHandle' ? 'มือซ้าย' : 'มือขวา';
    return jt.label.replace(/ขวา|ซ้าย/g, '').replace(/\s*\(.*\)/, '').trim() || jt.label;
  }

  function renderInspector() {
    renderJointList();
    const rig = C.RIGS[state.anim.rig];
    const jt = state.selected ? rig.byName[state.selected] : null;
    const box = $('#joint-editor');
    $('#joint-empty').hidden = !!jt;
    box.hidden = !jt;
    if (jt) {
      $('#joint-title').textContent = jt.label;
      $('#joint-code').textContent = jt.name;
      const labels = axisLabels(jt);
      $$('.axis-row[data-kind="rot"]').forEach((row, i) => { $('.axis-name', row).textContent = labels[i]; });
      $('#pos-rows').hidden = !(jt.name === rig.rootJoint || jt.allowPos);
      $('#pos-label').textContent = jt.group === 'weapon' ? 'เลื่อนอาวุธในมือ (stud, ตามแกนของมือ)' : 'ตำแหน่งลำตัว (stud)';
      const posNames = jt.group === 'weapon'
        ? ['ซ้าย / ขวา ของมือ', 'ตามแนวแขน (+ เข้าหาศอก)', 'หน้า (−) / หลัง (+) ของมือ']
        : ['ซ้าย / ขวา', 'ขึ้น / ย่อ', 'หน้า (−) / หลัง (+)'];
      $$('.axis-row[data-kind="pos"]').forEach((row, i) => { $('.axis-name', row).textContent = posNames[i]; });
      const k = currentKeyframe();
      $('#btn-clear-joint').disabled = !(k && k.poses[jt.name]);
    }
    renderInspectorValues();
    renderKeyframePanel();
    $('#btn-paste').disabled = !state.clipboard;
  }
  function renderInspectorValues() {
    if (!state.selected) return;
    const pose = C.sampleJointPose(state.anim, state.selected, snap(state.time));
    const k = currentKeyframe();
    const keyed = !!(k && k.poses[state.selected]);
    $('#joint-editor').dataset.keyed = String(keyed);
    $('#key-state').textContent = keyed ? `มีคีย์ที่ ${fmt(k.time)} วิ` : 'ยังไม่มีคีย์ตรงนี้ (แก้แล้วจะสร้างให้เอง)';
    $$('.axis-row').forEach((row) => {
      const kind = row.dataset.kind, i = Number(row.dataset.axis);
      const v = kind === 'rot' ? pose.rot[i] : (pose.pos ? pose.pos[i] : 0);
      const range = $('input[type=range]', row), numIn = $('input[type=number]', row);
      if (document.activeElement !== range) range.value = v;
      if (document.activeElement !== numIn) numIn.value = kind === 'rot' ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
    });
  }
  function bindAxisRows() {
    $$('.axis-row').forEach((row) => {
      const kind = row.dataset.kind, i = Number(row.dataset.axis);
      const range = $('input[type=range]', row), numIn = $('input[type=number]', row);
      const apply = (v, live) => {
        if (!state.selected || !isFinite(v)) return;
        pause();
        if (live) beginEdit();
        const cur = C.sampleJointPose(state.anim, state.selected, snap(state.time));
        const pose = { rot: cur.rot.slice() };
        if (cur.pos) pose.pos = cur.pos.slice();
        if (kind === 'rot') pose.rot[i] = C.roundAngle(v);
        else { pose.pos = pose.pos || [0, 0, 0]; pose.pos[i] = C.round4(v); if (pose.pos.every((x) => x === 0)) delete pose.pos; }
        setJointPose(state.selected, pose, live);
      };
      range.addEventListener('input', () => { apply(Number(range.value), true); numIn.value = range.value; });
      range.addEventListener('change', () => { endEdit(); renderAll(); });
      numIn.addEventListener('change', () => apply(Number(numIn.value), false));
    });
  }

  function renderKeyframePanel() {
    const k = currentKeyframe();
    $('#kf-none').hidden = !!k;
    $('#kf-fields').hidden = !k;
    if (k) {
      $('#kf-time').textContent = fmt(k.time);
      $('#kf-easing').value = k.easing;
      $('#kf-direction').value = k.direction;
      $('#kf-direction').disabled = k.easing === 'Linear' || k.easing === 'Constant';
    }
  }
  function renderAnimSettings() {
    const a = state.anim;
    $('#anim-name').value = a.name;
    $('#anim-length').value = a.length;
    $('#anim-loop').checked = a.loop;
    $('#anim-priority').value = a.priority;
    $$('#rig-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rig === a.rig)));
    renderMarkers();
  }
  function renderMarkers() {
    const list = $('#marker-list');
    list.innerHTML = '';
    state.anim.markers.forEach((m, idx) => {
      const row = document.createElement('div');
      row.className = 'marker-row';
      row.innerHTML = `
        <button type="button" class="marker-time" title="ไปที่เวลานี้">${fmt(m.time)}s</button>
        <input type="text" id="marker-name-${idx}" aria-label="ชื่อ marker" value="">
        <input type="text" id="marker-value-${idx}" aria-label="ค่า (value)" placeholder="value" value="">
        <button type="button" class="icon-btn danger" aria-label="ลบ marker">×</button>`;
      $('#marker-name-' + idx, row).value = m.name;
      $('#marker-value-' + idx, row).value = m.value;
      $('.marker-time', row).addEventListener('click', () => seek(m.time));
      $('#marker-name-' + idx, row).addEventListener('change', (e) => { pushUndo(); m.name = e.target.value.trim() || 'Marker'; save(); renderTimeline(); });
      $('#marker-value-' + idx, row).addEventListener('change', (e) => { pushUndo(); m.value = e.target.value; save(); });
      $('.danger', row).addEventListener('click', () => { pushUndo(); state.anim.markers.splice(idx, 1); save(); renderMarkers(); renderTimeline(); });
      list.appendChild(row);
    });
    $('#marker-empty').hidden = state.anim.markers.length > 0;
  }
  function addMarker() {
    pushUndo();
    const name = ($('#marker-new-name').value || 'Hit').trim();
    state.anim.markers.push({ time: snap(state.time), name, value: '' });
    state.anim.markers.sort((a, b) => a.time - b.time);
    save(); renderMarkers(); renderTimeline();
    toast(`เพิ่ม marker "${name}" ที่ ${fmt(snap(state.time))} วิ`);
  }

  // ---------------------------------------------------------------
  // Timeline / dope sheet: a summary row (whole keyframes), one row per
  // animated joint, and markers. Keys can be multi-selected (Shift/Ctrl),
  // dragged together, copied, pasted and deleted.
  // ---------------------------------------------------------------
  const tl = { pxPerSec: 400, left: 14, zoom: 1, labelW: 120 };
  const itemKey = (time, joint) => `${C.round4(time)}|${joint || '*'}`;
  const parseItem = (key) => { const [t, j] = key.split('|'); return { time: Number(t), joint: j === '*' ? null : j }; };
  function selectedItems() { return [...state.keySel].map(parseItem); }
  function layoutTimeline() {
    tl.labelW = parseFloat(getComputedStyle($('#tl-scroll')).getPropertyValue('--tl-label-w')) || 120;
    const L = Math.max(0.1, state.anim.length);
    const fitW = Math.max(200, $('#tl-scroll').clientWidth - tl.labelW - tl.left * 2 - 16);
    tl.pxPerSec = (fitW / L) * tl.zoom;
    const trackW = L * tl.pxPerSec + tl.left * 2;
    $('#tl-tracks').style.width = (tl.labelW + trackW) + 'px';
    tl.trackW = trackW;
  }
  const tx = (t) => tl.left + t * tl.pxPerSec; // inside a row
  const ax = (t) => tl.labelW + tx(t); // inside #tl-tracks
  function rowLabelText(jt) { return jt.label.replace(/\s*\(.*\)/, ''); }
  function timelineJoints() {
    const rig = C.RIGS[state.anim.rig];
    const used = new Set(state.anim.keyframes.flatMap((k) => Object.keys(k.poses)));
    return rig.joints.filter((jt) => used.has(jt.name) || jt.name === state.selected);
  }
  function renderTimeline() {
    layoutTimeline();
    const a = state.anim;
    // Ruler
    const ruler = $('#tl-ruler');
    ruler.innerHTML = '';
    ruler.style.width = tl.trackW + 'px';
    const stepOpts = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];
    const step = stepOpts.find((v) => v * tl.pxPerSec >= 56) || 5;
    for (let i = 0, t = 0; t <= a.length + 1e-6; i++, t = i * step) {
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.style.left = tx(t) + 'px';
      tick.textContent = (Math.round(t * 100) / 100) + 's';
      ruler.appendChild(tick);
    }
    // Rows
    const rows = $('#tl-rows');
    rows.innerHTML = '';
    const cur = currentKeyframe();
    const line = (label, cls, joint) => {
      const l = document.createElement('div');
      l.className = 'tl-line' + (cls ? ' ' + cls : '');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tl-label'; b.textContent = label; b.title = label;
      if (joint) b.addEventListener('click', () => select(joint));
      const r = document.createElement('div');
      r.className = 'tl-row'; r.style.width = tl.trackW + 'px';
      l.append(b, r);
      rows.appendChild(l);
      return r;
    };
    const summary = line('ทั้งตัว', 'summary', null);
    a.keyframes.forEach((k) => summary.appendChild(makeKey(k, null, cur === k)));
    for (const jt of timelineJoints()) {
      const r = line(rowLabelText(jt), jt.name === state.selected ? 'selected' : '', jt.name);
      a.keyframes.forEach((k) => { if (k.poses[jt.name]) r.appendChild(makeKey(k, jt.name, cur === k)); });
    }
    const markers = line('Markers', 'markers', null);
    a.markers.forEach((m) => {
      const f = document.createElement('button');
      f.type = 'button';
      f.className = 'flag';
      f.style.left = tx(m.time) + 'px';
      f.textContent = m.name;
      f.title = `${m.name}${m.value ? ' = ' + m.value : ''} @ ${fmt(m.time)}s — ลากเพื่อย้ายเวลา`;
      dragFlag(f, m);
      markers.appendChild(f);
    });
    $('#tl-end').style.left = ax(a.length) + 'px';
    renderPlayhead();
  }
  function shortLabel() {
    const jt = C.RIGS[state.anim.rig].byName[state.selected];
    return jt ? jt.label : state.selected;
  }
  function makeKey(k, joint, active) {
    const d = document.createElement('button');
    d.type = 'button';
    const key = itemKey(k.time, joint);
    d.className = 'key' + (joint ? ' joint' : '') + (active ? ' active' : '') + (state.keySel.has(key) ? ' sel' : '');
    d.style.left = tx(k.time) + 'px';
    d.dataset.easing = k.easing;
    d.dataset.time = k.time;
    d.dataset.key = key;
    const what = joint ? rowLabelText(C.RIGS[state.anim.rig].byName[joint]) : `${Object.keys(k.poses).length} ข้อต่อ`;
    d.title = `${fmt(k.time)}s · ${what} · ${k.easing}${k.easing === 'Linear' || k.easing === 'Constant' ? '' : ' ' + k.direction} — Shift/Ctrl+คลิก เลือกหลายอัน, ลากเพื่อย้าย`;
    d.setAttribute('aria-label', `คีย์ ${what} ${fmt(k.time)} วินาที`);
    d.addEventListener('pointerdown', (e) => keyPointerDown(e, d, k.time, joint));
    return d;
  }
  /** Click = select (and seek); Shift/Ctrl+click = add/remove; drag = move every selected key. */
  function keyPointerDown(e, el, t0, joint) {
    e.stopPropagation();
    pause();
    const key = itemKey(t0, joint);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (additive) {
      if (state.keySel.has(key)) state.keySel.delete(key); else state.keySel.add(key);
    } else if (!state.keySel.has(key)) {
      state.keySel = new Set([key]);
    }
    $$('#tl-rows .key').forEach((k) => k.classList.toggle('sel', state.keySel.has(k.dataset.key)));
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ }
    const x0 = e.clientX;
    let moved = false, base = null, items = null, dt = 0;
    const move = (ev) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 4) return;
      if (!moved) { moved = true; pushUndo(); base = C.clone(state.anim); items = selectedItems(); }
      dt = Math.round((dx / tl.pxPerSec) / SNAP) * SNAP;
      const minT = Math.min(...items.map((i) => i.time));
      if (minT + dt < 0) dt = -minT;
      state.anim = C.moveKeys(base, items, dt);
      $$('#tl-rows .key.sel').forEach((k) => { k.style.left = tx(Number(k.dataset.time) + dt) + 'px'; });
      state.time = snap(t0 + dt);
      drawPose(); renderPlayhead();
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (moved) {
        state.keySel = new Set(items.map((i) => itemKey(Math.max(0, Math.round((i.time + dt) * 100) / 100), i.joint)));
        save(); renderAll();
      } else {
        if (joint && state.selected !== joint) select(joint);
        seek(t0);
        renderTimeline();
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  function dragFlag(el, m) {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      pause();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ }
      const x0 = e.clientX, t0 = m.time;
      let moved = false;
      const move = (ev) => {
        const dx = ev.clientX - x0;
        if (!moved && Math.abs(dx) < 4) return;
        if (!moved) { moved = true; pushUndo(); }
        m.time = snap(Math.max(0, t0 + dx / tl.pxPerSec));
        if (m.time > state.anim.length) state.anim.length = m.time;
        el.style.left = tx(m.time) + 'px';
        state.time = m.time;
        drawPose(); renderPlayhead();
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (moved) { state.anim.markers.sort((x, y) => x.time - y.time); save(); renderMarkers(); renderAll(); } else seek(t0);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }
  function renderPlayhead() {
    $('#tl-playhead').style.left = ax(state.time) + 'px';
    // Keep the playhead in view while playing a zoomed-in timeline.
    const sc = $('#tl-scroll');
    if (state.playing && tl.zoom > 1) {
      const x = ax(state.time), viewL = sc.scrollLeft + tl.labelW, viewR = sc.scrollLeft + sc.clientWidth - 24;
      if (x < viewL || x > viewR) sc.scrollLeft = Math.max(0, x - tl.labelW - 24);
    }
    $('#time-now').textContent = fmt(state.time);
    $('#time-len').textContent = fmt(state.anim.length);
    const k = currentKeyframe();
    $$('#tl-rows .key').forEach((el) => el.classList.toggle('active', !!k && Math.abs(Number(el.dataset.time) - k.time) < 1e-4));
    if (!state.playing) { renderKeyframePanel(); renderInspectorValues(); }
  }
  function setZoom(z, anchorClientX) {
    const sc = $('#tl-scroll');
    const r = sc.getBoundingClientRect();
    const ax0 = (anchorClientX === undefined ? r.left + tl.labelW + (r.width - tl.labelW) / 2 : anchorClientX) - r.left;
    const tAt = (sc.scrollLeft + ax0 - tl.labelW - tl.left) / tl.pxPerSec;
    tl.zoom = Math.max(1, Math.min(16, z));
    renderTimeline();
    sc.scrollLeft = Math.max(0, tl.labelW + tl.left + tAt * tl.pxPerSec - ax0);
  }
  function deleteSelectedKeys() {
    if (!state.keySel.size) return deleteKeyframe();
    pushUndo();
    state.anim = C.deleteKeys(state.anim, selectedItems());
    const n = state.keySel.size;
    state.keySel.clear();
    save(); renderAll(); drawPose();
    toast(`ลบ ${n} คีย์แล้ว`);
  }
  function copySelectedKeys() {
    state.keyClip = C.copyKeys(state.anim, selectedItems());
    state.lastCopy = 'keys';
    toast(`คัดลอก ${state.keySel.size} คีย์แล้ว เลื่อนเส้นเวลาไปที่อื่นแล้วกด Ctrl+V`);
  }
  function pasteKeysAtPlayhead() {
    if (!state.keyClip) return;
    pause(); pushUndo();
    const t = snap(state.time);
    state.anim = C.pasteKeys(state.anim, state.keyClip, t);
    state.keySel = new Set(state.keyClip.map((c) => itemKey(Math.round((c.time + t) * 100) / 100, c.whole ? null : Object.keys(c.poses)[0])));
    save(); renderAll(); drawPose();
    toast(`วางคีย์ที่ ${fmt(t)} วิ`);
  }
  function selectAllKeys() {
    state.keySel = new Set(state.anim.keyframes.map((k) => itemKey(k.time, null)));
    renderTimeline();
  }
  function bindTimeline() {
    const scrub = (e) => {
      const r = $('#tl-tracks').getBoundingClientRect();
      seek(snap((e.clientX - r.left - tl.labelW - tl.left) / tl.pxPerSec));
      renderJointList();
    };
    const area = $('#tl-tracks');
    area.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.key, .flag, .tl-label')) return;
      if (!e.shiftKey && state.keySel.size) { state.keySel.clear(); $$('#tl-rows .key.sel').forEach((k) => k.classList.remove('sel')); }
      try { area.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ }
      scrub(e);
      const move = (ev) => scrub(ev);
      const up = () => { area.removeEventListener('pointermove', move); area.removeEventListener('pointerup', up); };
      area.addEventListener('pointermove', move);
      area.addEventListener('pointerup', up);
    });
    $('#tl-scroll').addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom(tl.zoom * Math.exp(-e.deltaY * 0.002), e.clientX);
    }, { passive: false });
    $('#tl-zoom-in').addEventListener('click', () => setZoom(tl.zoom * 1.5));
    $('#tl-zoom-out').addEventListener('click', () => setZoom(tl.zoom / 1.5));
    new ResizeObserver(() => renderTimeline()).observe($('#tl-scroll'));
  }

  // ---------------------------------------------------------------
  // Load / save / export
  // ---------------------------------------------------------------
  function loadAnim(anim, msg) {
    const res = C.validate(anim);
    if (!res.ok) { toast(res.errors[0], 'error'); return res; }
    pushUndo();
    state.anim = res.anim;
    state.time = 0;
    state.keySel.clear();
    afterLoad(true);
    if (msg) toast(msg + (res.warnings.length ? ` (มีคำเตือน ${res.warnings.length} ข้อ)` : ''));
    return res;
  }
  function afterLoad(resetTime) {
    if (viewer.fx) viewer.fx.clear(); // effects of the previous animation (beams, auras) must not linger
    if (resetTime) state.time = 0;
    state.time = Math.min(state.time, state.anim.length);
    viewer.setRig(state.anim.rig);
    if (state.layer && state.layer.anim.rig !== state.anim.rig) setLayer(state.layer.id);
    if (state.selected && !C.RIGS[state.anim.rig].byName[state.selected]) state.selected = null;
    viewer.setSelected(state.selected);
    save();
    renderAll();
    drawPose();
  }
  function renderAll() {
    renderAnimSettings();
    renderInspector();
    renderTimeline();
  }
  function fileName(ext) { return (state.anim.name || 'Animation').replace(/[^\w\-ก-๙]+/g, '_') + ext; }
  // Inside the claude.ai artifact viewer, files must go through its
  // `downloads` capability (it allows .json but not .rbxmx).
  let hostDownloads = null;
  if (window.claude && typeof window.claude.use === 'function') {
    const rb = document.getElementById('btn-rbxmx');
    if (rb) rb.hidden = true;
    window.claude.use('downloads').then((d) => { hostDownloads = d; }).catch(() => {});
  }
  async function download(text, name, type) {
    if (hostDownloads) {
      try {
        await hostDownloads.save({ filename: name, data: text instanceof Blob ? text : String(text) });
        toast(`บันทึก ${name} แล้ว`);
      } catch (e) {
        if (e && e.code !== 'declined') toast('บันทึกไฟล์ไม่ได้ในหน้านี้ ใช้ปุ่ม "คัดลอก JSON" แทน', 'error');
      }
      return;
    }
    try {
      const url = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`ดาวน์โหลด ${name} แล้ว ถ้าไฟล์ไม่มา ให้ใช้ปุ่ม "คัดลอก JSON" แทน`);
    } catch (e) {
      toast('ดาวน์โหลดไม่ได้ในหน้านี้ ใช้ปุ่ม "คัดลอก JSON" แล้ววางใน Plugin แทน', 'error');
    }
  }
  async function copyText(text, okMsg, fallbackEl) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg);
      return true;
    } catch (e) {
      if (fallbackEl) { fallbackEl.value = text; fallbackEl.hidden = false; fallbackEl.focus(); fallbackEl.select(); }
      toast('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความแล้วกด Ctrl+C เอง', 'error');
      return false;
    }
  }
  function openFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      try {
        if (/\.rbxmx$/i.test(file.name) || text.trimStart().startsWith('<roblox')) {
          loadAnim(C.fromRbxmx(text, new DOMParser()), `เปิด ${file.name} แล้ว`);
        } else if (/\.rbxm$/i.test(file.name)) {
          toast('ไฟล์ .rbxm เป็นแบบ binary ให้ Save เป็น .rbxmx แทน หรือใช้ Plugin "Export JSON"', 'error');
        } else {
          loadAnim(text, `เปิด ${file.name} แล้ว`);
        }
      } catch (e) { toast(e.message, 'error'); }
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------
  // AI dialog
  // ---------------------------------------------------------------
  function buildPromptText() {
    const includeCurrent = $('#ai-include').checked;
    return AI.buildPrompt(state.anim.rig, $('#ai-desc').value, includeCurrent ? state.anim : null);
  }
  function bindAI() {
    const dlg = $('#ai-dialog');
    $('#btn-ai').addEventListener('click', () => {
      $('#ai-result').hidden = true;
      $('#ai-prompt').value = buildPromptText();
      $('#ai-rig').textContent = state.anim.rig;
      dlg.showModal();
    });
    $('#ai-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    ['input', 'change'].forEach((ev) => {
      $('#ai-desc').addEventListener(ev, () => { $('#ai-prompt').value = buildPromptText(); });
      $('#ai-include').addEventListener(ev, () => { $('#ai-prompt').value = buildPromptText(); });
    });
    $$('.idea').forEach((b) => b.addEventListener('click', () => {
      $('#ai-desc').value = b.dataset.idea;
      $('#ai-prompt').value = buildPromptText();
    }));
    $('#ai-copy').addEventListener('click', () => copyText(buildPromptText(), 'คัดลอก prompt แล้ว ไปวางในแชท AI ได้เลย', $('#ai-prompt')));
    $('#ai-import').addEventListener('click', () => {
      const text = $('#ai-paste').value;
      const out = $('#ai-result');
      out.hidden = false;
      if (!text.trim()) { out.dataset.kind = 'error'; out.textContent = 'วาง JSON ที่ AI ตอบกลับมาในช่องด้านบนก่อน'; return; }
      const res = C.validate(text);
      if (!res.ok) {
        out.dataset.kind = 'error';
        out.textContent = 'นำเข้าไม่ได้:\n• ' + res.errors.join('\n• ') + '\n\nลองส่งข้อความนี้กลับไปให้ AI แก้';
        return;
      }
      loadAnim(res.anim, `นำเข้า "${res.anim.name}" จาก AI แล้ว`);
      out.dataset.kind = res.warnings.length ? 'warn' : 'ok';
      out.textContent = res.warnings.length ? 'นำเข้าแล้ว มีคำเตือน:\n• ' + res.warnings.join('\n• ') : `นำเข้าแล้ว: ${res.anim.keyframes.length} คีย์เฟรม ยาว ${res.anim.length} วิ`;
      if (!res.warnings.length) setTimeout(() => dlg.close(), 700);
      play();
    });
  }

  // ---------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------
  function bindControls() {
    $('#btn-play').addEventListener('click', () => (state.playing ? pause() : play()));
    $('#btn-start').addEventListener('click', () => seek(0));
    $('#btn-prev').addEventListener('click', () => stepKey(-1));
    $('#btn-next').addEventListener('click', () => stepKey(1));
    $('#speed').addEventListener('change', (e) => { state.speed = Number(e.target.value); });
    $('#loop-preview').addEventListener('change', (e) => { state.loopPreview = e.target.checked; });
    $('#btn-add-key').addEventListener('click', addKeyframe);
    $('#btn-del-key').addEventListener('click', deleteSelectedKeys);
    $('#btn-add-marker').addEventListener('click', addMarker);
    $('#btn-reset-joint').addEventListener('click', resetJoint);
    $('#btn-clear-joint').addEventListener('click', clearJointKey);
    $('#btn-mirror').addEventListener('click', () => pastePose(true));
    $('#btn-copy').addEventListener('click', copyPose);
    $('#btn-paste').addEventListener('click', () => pastePose(false));
    $('#btn-reset-body').addEventListener('click', resetBody);
    $('#btn-two-hand').addEventListener('click', leftHandToWeapon);
    $('#btn-undo').addEventListener('click', undo);
    $('#btn-redo').addEventListener('click', redo);
    $('#kf-easing').addEventListener('change', (e) => { const k = currentKeyframe(); if (!k) return; pushUndo(); k.easing = e.target.value; save(); renderAll(); });
    $('#kf-direction').addEventListener('change', (e) => { const k = currentKeyframe(); if (!k) return; pushUndo(); k.direction = e.target.value; save(); renderTimeline(); });
    $('#anim-name').addEventListener('change', (e) => { pushUndo(); state.anim.name = e.target.value.trim() || 'Animation'; save(); });
    $('#anim-length').addEventListener('change', (e) => {
      const last = state.anim.keyframes[state.anim.keyframes.length - 1].time;
      let v = Number(e.target.value);
      if (!isFinite(v) || v <= 0) v = state.anim.length;
      if (v < last) { v = last; toast(`ความยาวต้องไม่น้อยกว่าคีย์เฟรมสุดท้าย (${fmt(last)} วิ)`); }
      pushUndo(); state.anim.length = C.round4(v); save(); renderAll();
    });
    $('#anim-loop').addEventListener('change', (e) => { pushUndo(); state.anim.loop = e.target.checked; save(); });
    $('#anim-priority').addEventListener('change', (e) => { pushUndo(); state.anim.priority = e.target.value; save(); });
    $$('#rig-switch button').forEach((b) => b.addEventListener('click', () => {
      const target = b.dataset.rig;
      if (target === state.anim.rig) return;
      const from = state.anim.rig;
      loadAnim(C.convertRig(state.anim, target), `แปลง ${from} → ${target} แล้ว${target === 'R6' ? ' (R6 ไม่มีศอก/เข่า ส่วนนั้นจะหายไป)' : ''} กด ย้อนกลับ ได้`);
    }));
    $('#ik-mode').addEventListener('change', (e) => { viewer.setIKMode(e.target.checked); prefs.set('ik', e.target.checked); });
    $('#fx').addEventListener('change', (e) => { state.fx = e.target.checked; if (viewer.fx) viewer.fx.setEnabled(state.fx); prefs.set('fx', state.fx); });
    $('#cine').addEventListener('change', (e) => { state.cinematic = e.target.checked; prefs.set('cine', state.cinematic); });
    $('#btn-record').addEventListener('click', recordVideo);
    $('#layer').addEventListener('change', (e) => setLayer(e.target.value));
    $('#btn-new').addEventListener('click', () => { loadAnim(C.newAnimation(state.anim.rig), 'เริ่มแอนิเมชันใหม่ (กด ย้อนกลับ ถ้าเผลอกด)'); });
    $('#btn-open').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
    $('#btn-copy-json').addEventListener('click', () => copyText(C.toJSON(state.anim), 'คัดลอก JSON แล้ว ไปวางใน NineAnimator Plugin ใน Studio ได้เลย', $('#copy-fallback')));
    $('#btn-save-json').addEventListener('click', () => download(C.toJSON(state.anim), fileName('.json'), 'application/json'));
    $('#btn-rbxmx').addEventListener('click', () => {
      try { download(C.toRbxmx(state.anim), fileName('.rbxmx'), 'application/xml'); } catch (e) { toast(e.message, 'error'); }
    });
    $('#prop').addEventListener('change', (e) => setProp(e.target.value));
    $('#onion').addEventListener('change', (e) => { state.onion = e.target.checked; prefs.set('onion', state.onion); drawGhosts(); });
    $('#btn-faster').addEventListener('click', () => retime(0.8));
    $('#btn-slower').addEventListener('click', () => retime(1.25));
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => viewer.setView(b.dataset.view)));
    $('#copy-fallback').addEventListener('blur', (e) => { e.target.hidden = true; });

    // Drag & drop files onto the page
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

    window.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || $('#ai-dialog').open || $('#preset-dialog').open) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'c') { if (state.keySel.size) copySelectedKeys(); else { copyPose(); state.lastCopy = 'pose'; } }
      else if (mod && e.key.toLowerCase() === 'v') { if (state.lastCopy === 'keys') pasteKeysAtPlayhead(); else pastePose(false); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAllKeys(); }
      else if (e.key === ' ') { e.preventDefault(); state.playing ? pause() : play(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(snap(state.time - STEP)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(snap(state.time + STEP)); }
      else if (e.key.toLowerCase() === 'k') addKeyframe();
      else if (e.key.toLowerCase() === 'm') pastePose(true);
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelectedKeys();
      else if (e.key === 'Escape') { if (state.keySel.size) { state.keySel.clear(); renderTimeline(); } else select(null); }
    });
  }
  function setProp(name) {
    if (name === 'shield') name = 'swordshield'; // older saved preference
    viewer.setProp(name);
    $('#prop').value = viewer.prop;
    prefs.set('prop', viewer.prop);
    renderJointList();
  }
  // Where the left hand grabs each two-handed weapon, in the Handle's frame.
  const TWO_HAND_POINT = {
    longsword: [0, -0.6, 0], greatsword: [0, -0.7, 0], heavygun: [0, 0.3, -0.6], sword: [0, -0.45, 0],
  };
  /** Solve the left arm so the left hand holds the right-hand weapon, at this keyframe. */
  function leftHandToWeapon() {
    const rig = C.RIGS[state.anim.rig];
    const point = TWO_HAND_POINT[viewer.prop] || [0, -0.5, 0];
    pause();
    const t = snap(state.time);
    const ms = C.sampleAll(state.anim, t);
    const target = C.pointOn(rig, ms, 'Handle', point);
    const res = C.solveArmIK(rig, ms, 'Left', target);
    pushUndo();
    const k = C.ensureKeyframe(state.anim, t);
    Object.assign(k.poses, res.poses);
    save(); renderAll(); drawPose();
    toast(res.error < 0.15 ? 'มือซ้ายจับอาวุธแล้ว' : `มือซ้ายเอื้อมไม่ถึง (ห่าง ${res.error.toFixed(2)} stud) ลองขยับมือขวาเข้าหาลำตัว`, res.error < 0.15 ? 'info' : 'error');
  }
  function retime(factor) {
    pause();
    loadAnim(C.retime(state.anim, factor), factor < 1 ? `เร็วขึ้นแล้ว ยาว ${fmt(state.anim.length * factor)} วิ` : `ช้าลงแล้ว ยาว ${fmt(state.anim.length * factor)} วิ`);
  }
  // ---------------------------------------------------------------
  // Record the animation (with effects) to a .webm video
  // ---------------------------------------------------------------
  function recordVideo() {
    const canvas = viewer.renderer.domElement;
    if (!window.MediaRecorder || !canvas.captureStream) {
      toast('เบราว์เซอร์นี้อัดวิดีโอไม่ได้ ลองใช้ Chrome หรือ Edge', 'error');
      return;
    }
    if (state.recording) return;
    pause();
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    let rec;
    try { rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : undefined); } catch (e) {
      toast('เริ่มอัดวิดีโอไม่ได้: ' + e.message, 'error');
      return;
    }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      $('#btn-record').textContent = 'อัดวิดีโอ';
      $('#btn-record').disabled = false;
      if (blob.size) download(blob, fileName('.webm'), 'video/webm');
      else toast('อัดไม่ได้ ลองใหม่อีกครั้ง', 'error');
    };
    state.recording = { rec, loop: state.loopPreview };
    state.loopPreview = false;
    $('#btn-record').textContent = '● กำลังอัด…';
    $('#btn-record').disabled = true;
    state.time = 0;
    drawPose();
    rec.start();
    setTimeout(play, 250); // a short still at the start
  }
  function finishRecording() {
    const r = state.recording;
    state.recording = null;
    state.loopPreview = r.loop;
    // Let the last effects finish before stopping.
    setTimeout(() => { try { r.rec.stop(); } catch (e) { /* already stopped */ } }, 600);
  }

  function stepKey(dir) {
    const t = snap(state.time);
    const ks = state.anim.keyframes;
    const k = dir > 0 ? ks.find((x) => x.time > t + 1e-4) : [...ks].reverse().find((x) => x.time < t - 1e-4);
    seek(k ? k.time : dir > 0 ? state.anim.length : 0);
  }

  // ---------------------------------------------------------------
  // Presets: cached builds, layer preview and the browser with thumbnails
  // ---------------------------------------------------------------
  const presetCache = new Map();
  function presetAnim(id) {
    if (!presetCache.has(id)) presetCache.set(id, P.get(id));
    return presetCache.get(id);
  }
  function loadPreset(id) {
    const a = presetAnim(id);
    if (!a) return;
    loadAnim(C.convertRig(a, state.anim.rig), `โหลดท่า "${a.name}" แล้ว`);
    const info = P.info(id);
    if (info && info.prop) setProp(info.prop);
    play();
  }
  function setLayer(id) {
    $('#layer').value = id || '';
    if (!id) { state.layer = null; drawPose(); return; }
    const a = presetAnim(id);
    state.layer = { id, anim: C.validate(C.convertRig(a, state.anim.rig)).anim, time: state.layer ? state.layer.time : 0 };
    drawPose();
    toast('ซ้อนท่า: ข้อต่อที่ท่านี้ไม่ได้ขยับ จะเล่นตามท่าที่ซ้อนไว้ (ดูอย่างเดียว ไม่ถูกบันทึก)');
  }

  let thumbViewer = null;
  const thumbCache = new Map();
  const thumbQueue = [];
  let thumbBusy = false;
  /** Representative time for a thumbnail: the first hit/shot, else the middle. */
  function thumbTime(a) {
    const m = a.markers.find((x) => ['Hit', 'Fire', 'Shoot', 'Throw', 'Cast'].includes(x.name));
    return m ? m.time : a.length * 0.4;
  }
  function pumpThumbs() {
    if (thumbBusy || !thumbQueue.length) return;
    thumbBusy = true;
    setTimeout(() => {
      const { id, img } = thumbQueue.shift();
      const rigId = state.anim.rig;
      const cacheKey = id + '|' + rigId;
      try {
        if (!thumbCache.has(cacheKey)) {
          if (!thumbViewer) {
            thumbViewer = new window.NineViewer($('#thumb-host'), {});
            thumbViewer.orbit.dist = 11.5;
          }
          const a = C.validate(C.convertRig(presetAnim(id), rigId)).anim;
          thumbViewer.setRig(rigId);
          thumbViewer.setProp((P.info(id) || {}).prop || 'none');
          thumbViewer.setPose(C.sampleAll(a, thumbTime(a)));
          thumbCache.set(cacheKey, thumbViewer.snapshot());
        }
        img.src = thumbCache.get(cacheKey);
      } catch (e) { /* leave the placeholder */ }
      thumbBusy = false;
      pumpThumbs();
    }, 0);
  }
  function bindPresetBrowser() {
    const dlg = $('#preset-dialog');
    const grid = $('#preset-grid');
    const cats = $('#preset-cats');
    let cat = 'all';
    const catLabel = Object.fromEntries(P.CATEGORIES);
    const observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        observer.unobserve(en.target);
        thumbQueue.push({ id: en.target.dataset.id, img: en.target.querySelector('img') });
      }
      pumpThumbs();
    }, { root: grid, rootMargin: '120px' });
    const render = () => {
      const q = $('#preset-search').value.trim().toLowerCase();
      grid.innerHTML = '';
      thumbQueue.length = 0;
      const list = P.LIST.filter((p) => (cat === 'all' || p.cat === cat)
        && (!q || (p.label + ' ' + p.id + ' ' + catLabel[p.cat]).toLowerCase().includes(q)));
      if (!list.length) { grid.innerHTML = '<p class="preset-empty">ไม่พบท่าที่ค้นหา ลองคำอื่น เช่น ดาบ, กระโดด, boss</p>'; return; }
      for (const p of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'preset-card';
        b.dataset.id = p.id;
        b.innerHTML = '<img class="preset-thumb" alt="" width="180" height="180"><span></span><span class="preset-meta"></span>';
        b.children[1].textContent = p.label;
        b.children[2].textContent = catLabel[p.cat];
        const cached = thumbCache.get(p.id + '|' + state.anim.rig);
        if (cached) b.querySelector('img').src = cached; else observer.observe(b);
        b.addEventListener('click', () => { dlg.close(); loadPreset(p.id); });
        grid.appendChild(b);
      }
    };
    const renderCats = () => {
      cats.innerHTML = '';
      for (const [id, label] of [['all', 'ทั้งหมด']].concat(P.CATEGORIES)) {
        const c = document.createElement('button');
        c.type = 'button'; c.className = 'chip';
        c.textContent = label + (id === 'all' ? ` (${P.LIST.length})` : '');
        c.setAttribute('aria-pressed', String(cat === id));
        c.addEventListener('click', () => { cat = id; renderCats(); render(); });
        cats.appendChild(c);
      }
    };
    $('#btn-presets').textContent = `ท่าสำเร็จรูป (${P.LIST.length})`;
    $('#btn-presets').addEventListener('click', () => { renderCats(); render(); dlg.showModal(); $('#preset-search').focus(); });
    $('#preset-search').addEventListener('input', render);
    $('#preset-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  function boot() {
    const layerSel = $('#layer');
    for (const p of P.LIST.filter((x) => x.cat === 'move' || ['stance', 'mn_walk', 'mn_run', 'boss_idle'].includes(x.id))) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = 'ซ้อน: ' + p.label;
      layerSel.appendChild(o);
    }
    initViewer();
    window.NineApp = { state, get viewer() { return viewer; }, loadPreset }; // handy for debugging and scripts
    bindPresetBrowser();
    bindAxisRows();
    bindTimeline();
    bindControls();
    bindAI();
    let restored = null;
    try { restored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { restored = null; }
    const res = restored ? C.validate(restored) : null;
    state.anim = res && res.ok ? res.anim : P.get('slash');
    viewer.setRig(state.anim.rig);
    setProp(prefs.get('prop', 'sword'));
    state.onion = prefs.get('onion', false) === true;
    $('#onion').checked = state.onion;
    $('#ik-mode').checked = prefs.get('ik', true) !== false;
    state.fx = prefs.get('fx', true) !== false;
    $('#fx').checked = state.fx;
    if (viewer.fx) viewer.fx.setEnabled(state.fx);
    state.cinematic = prefs.get('cine', false) === true;
    $('#cine').checked = state.cinematic;
    viewer.setIKMode($('#ik-mode').checked);
    state.selected = state.anim.rig === 'R15' ? 'RightUpperArm' : 'Right Arm';
    viewer.setSelected(state.selected);
    renderAll();
    drawPose();
    if (!res || !res.ok) play();
  }

  if (!window.THREE) {
    document.addEventListener('DOMContentLoaded', () => {
      $('#viewport').innerHTML = '<p class="load-error">โหลด three.js ไม่ได้ ต้องต่ออินเทอร์เน็ตครั้งแรกที่เปิด</p>';
    });
    return;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
