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
    });
    const themeChanged = () => viewer.applyTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
    new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function drawPose() {
    viewer.setPose(C.sampleAll(state.anim, state.time));
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
    if (was) setTimeout(() => { renderInspector(); renderPlayhead(); drawGhosts(); });
    $('#btn-play').dataset.playing = 'false';
    $('#btn-play').setAttribute('aria-label', 'เล่น');
  }
  function tick(ts) {
    if (!state.playing) return;
    const dt = Math.min(0.1, (ts - lastTs) / 1000) * state.speed;
    lastTs = ts;
    const prev = state.time;
    state.time += dt;
    const L = state.anim.length;
    for (const m of state.anim.markers) if (m.time > prev && m.time <= state.time) flashMarker(m);
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
  // Timeline
  // ---------------------------------------------------------------
  const tl = { pxPerSec: 400, left: 14 };
  function timelineWidth() { return $('#tl-scroll').clientWidth; }
  function layoutTimeline() {
    const L = Math.max(0.1, state.anim.length);
    const avail = Math.max(200, timelineWidth() - tl.left * 2);
    tl.pxPerSec = avail / L;
    $('#tl-tracks').style.width = (avail + tl.left * 2) + 'px';
  }
  const tx = (t) => tl.left + t * tl.pxPerSec;
  function renderTimeline() {
    layoutTimeline();
    const a = state.anim;
    // Ruler
    const ruler = $('#tl-ruler');
    ruler.innerHTML = '';
    const stepOpts = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];
    const step = stepOpts.find((s) => s * tl.pxPerSec >= 56) || 5;
    for (let t = 0; t <= a.length + 1e-6; t += step) {
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.style.left = tx(t) + 'px';
      tick.textContent = (Math.round(t * 100) / 100) + 's';
      ruler.appendChild(tick);
    }
    // Rows
    const rowAll = $('#tl-row-all'), rowJoint = $('#tl-row-joint'), rowMarkers = $('#tl-row-markers');
    [rowAll, rowJoint, rowMarkers].forEach((r) => $$('.key, .flag', r).forEach((e) => e.remove()));
    const cur = currentKeyframe();
    a.keyframes.forEach((k) => {
      rowAll.appendChild(makeKey(k, cur === k, false));
      if (state.selected && k.poses[state.selected]) rowJoint.appendChild(makeKey(k, cur === k, true));
    });
    $('#tl-joint-label').textContent = state.selected ? shortLabel() : 'ข้อต่อที่เลือก';
    a.markers.forEach((m) => {
      const f = document.createElement('button');
      f.type = 'button';
      f.className = 'flag';
      f.style.left = tx(m.time) + 'px';
      f.textContent = m.name;
      f.title = `${m.name} @ ${fmt(m.time)}s — ลากเพื่อย้ายเวลา`;
      dragTime(f, m.time, (t) => { m.time = t; }, () => { a.markers.sort((x, y) => x.time - y.time); renderMarkers(); });
      rowMarkers.appendChild(f);
    });
    $('#tl-end').style.left = tx(a.length) + 'px';
    renderPlayhead();
  }
  function shortLabel() {
    const jt = C.RIGS[state.anim.rig].byName[state.selected];
    return jt ? jt.label : state.selected;
  }
  function makeKey(k, active, jointRow) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'key' + (active ? ' active' : '') + (jointRow ? ' joint' : '');
    d.style.left = tx(k.time) + 'px';
    d.dataset.easing = k.easing;
    d.title = `${fmt(k.time)}s · ${k.easing}${k.easing === 'Linear' || k.easing === 'Constant' ? '' : ' ' + k.direction} · ${Object.keys(k.poses).length} ข้อต่อ — ลากเพื่อย้ายเวลา`;
    d.setAttribute('aria-label', `คีย์เฟรม ${fmt(k.time)} วินาที`);
    dragTime(d, k.time, (t) => {
      const clash = state.anim.keyframes.find((o) => o !== k && Math.abs(o.time - t) < 1e-4);
      if (!clash) k.time = t;
    }, () => C.sortKeyframes(state.anim));
    return d;
  }
  /** Click = seek; drag = move the item in time. */
  function dragTime(el, t0, setT, done) {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      pause();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ }
      const x0 = e.clientX;
      let moved = false;
      const move = (ev) => {
        const dx = ev.clientX - x0;
        if (!moved && Math.abs(dx) < 4) return;
        if (!moved) { moved = true; pushUndo(); }
        const t = snap(Math.max(0, t0 + dx / tl.pxPerSec));
        setT(t);
        if (t > state.anim.length) state.anim.length = t;
        el.style.left = tx(t) + 'px';
        state.time = t;
        drawPose(); renderPlayhead();
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (moved) { done && done(); save(); renderAll(); } else seek(t0);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }
  function renderPlayhead() {
    $('#tl-playhead').style.left = tx(state.time) + 'px';
    $('#time-now').textContent = fmt(state.time);
    $('#time-len').textContent = fmt(state.anim.length);
    const k = currentKeyframe();
    $$('#tl-row-all .key').forEach((el, i) => el.classList.toggle('active', state.anim.keyframes[i] === k));
    if (!state.playing) { renderKeyframePanel(); renderInspectorValues(); }
  }
  function bindTimeline() {
    const scrub = (e) => {
      const r = $('#tl-tracks').getBoundingClientRect();
      seek(snap((e.clientX - r.left - tl.left) / tl.pxPerSec));
      renderJointList();
    };
    const area = $('#tl-tracks');
    area.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.key, .flag')) return;
      try { area.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ }
      scrub(e);
      const move = (ev) => scrub(ev);
      const up = () => { area.removeEventListener('pointermove', move); area.removeEventListener('pointerup', up); };
      area.addEventListener('pointermove', move);
      area.addEventListener('pointerup', up);
    });
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
    afterLoad(true);
    if (msg) toast(msg + (res.warnings.length ? ` (มีคำเตือน ${res.warnings.length} ข้อ)` : ''));
    return res;
  }
  function afterLoad(resetTime) {
    if (resetTime) state.time = 0;
    state.time = Math.min(state.time, state.anim.length);
    viewer.setRig(state.anim.rig);
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
        await hostDownloads.save({ filename: name, data: text });
        toast(`บันทึก ${name} แล้ว`);
      } catch (e) {
        if (e && e.code !== 'declined') toast('บันทึกไฟล์ไม่ได้ในหน้านี้ ใช้ปุ่ม "คัดลอก JSON" แทน', 'error');
      }
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
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
    $('#btn-del-key').addEventListener('click', deleteKeyframe);
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
    $('#preset').addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id) return;
      const a = P.get(id);
      if (a) loadAnim(C.convertRig(a, state.anim.rig), `โหลดท่า "${a.name}" แล้ว`);
      const info = P.info(id);
      if (info && info.prop) setProp(info.prop);
      e.target.value = '';
      play();
    });
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
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || $('#ai-dialog').open) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'c') { copyPose(); }
      else if (mod && e.key.toLowerCase() === 'v') { pastePose(false); }
      else if (e.key === ' ') { e.preventDefault(); state.playing ? pause() : play(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(snap(state.time - STEP)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(snap(state.time + STEP)); }
      else if (e.key.toLowerCase() === 'k') addKeyframe();
      else if (e.key.toLowerCase() === 'm') pastePose(true);
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteKeyframe();
      else if (e.key === 'Escape') select(null);
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
  function stepKey(dir) {
    const t = snap(state.time);
    const ks = state.anim.keyframes;
    const k = dir > 0 ? ks.find((x) => x.time > t + 1e-4) : [...ks].reverse().find((x) => x.time < t - 1e-4);
    seek(k ? k.time : dir > 0 ? state.anim.length : 0);
  }

  function boot() {
    const sel = $('#preset');
    for (const [cat, label] of P.CATEGORIES) {
      const group = document.createElement('optgroup');
      group.label = label;
      for (const p of P.LIST.filter((x) => x.cat === cat)) {
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.label;
        group.appendChild(o);
      }
      sel.appendChild(group);
    }
    initViewer();
    window.NineApp = { state, get viewer() { return viewer; } }; // handy for debugging in the console
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
