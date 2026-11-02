/*
 * Preview effects: weapon/limb trails and marker-driven effects (hit sparks,
 * dust + camera shake on landing, boss warning discs, charge aura, muzzle
 * flash + projectiles, shockwaves, beams, arrow rain, spawn smoke).
 * Purely visual: nothing here is saved into the animation.
 * Depends on globals THREE and NineCore; attached to a NineViewer.
 */
(function (root) {
  'use strict';
  const C = root.NineCore;

  // Blade spans in the handle frame (blade along +Y): [base, tip] in studs.
  const BLADE_SPAN = {
    sword: [0.45, 3.4], shortsword: [0.4, 2.7], shortblade: [0.35, 2.2], longsword: [0.4, 4.6], greatsword: [0.55, 5.3],
  };
  const TRAIL_LIFE = 0.16; // seconds a trail sample stays visible
  const now = () => performance.now() / 1000;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  /** A point given in a part's local frame, in world space. */
  function at(cf, local) {
    const r = cf.r;
    return [
      cf.p[0] + r[0] * local[0] + r[1] * local[1] + r[2] * local[2],
      cf.p[1] + r[3] * local[0] + r[4] * local[1] + r[5] * local[2],
      cf.p[2] + r[6] * local[0] + r[7] * local[1] + r[8] * local[2],
    ];
  }
  const dirOf = (cf, local) => sub(at(cf, local), cf.p);

  function radialTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /** A ribbon that follows two moving points (blade base and tip). */
  class Trail {
    constructor(scene, color, width) {
      this.max = 28;
      this.samples = [];
      this.width = width || 1;
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(this.max * 2 * 3);
      this.col = new Float32Array(this.max * 2 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      const idx = [];
      for (let i = 0; i < this.max - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geo.setIndex(idx);
      this.color = new THREE.Color(color);
      this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      }));
      this.mesh.frustumCulled = false;
      this.mesh.raycast = () => {};
      this.mesh.renderOrder = 4;
      scene.add(this.mesh);
    }
    push(base, tip, t) {
      const last = this.samples[this.samples.length - 1];
      const speed = last && t > last.t ? len(sub(tip, last.tip)) / (t - last.t) : 0;
      this.samples.push({ base, tip, t, speed });
      if (this.samples.length > this.max) this.samples.shift();
    }
    clear() { this.samples.length = 0; this.mesh.visible = false; }
    /** Rebuild the ribbon; returns true while anything is still visible. */
    update(t) {
      while (this.samples.length && t - this.samples[0].t > TRAIL_LIFE) this.samples.shift();
      const n = this.samples.length;
      if (n < 2) { this.mesh.visible = false; return false; }
      this.mesh.visible = true;
      let visible = false;
      for (let i = 0; i < this.max; i++) {
        const s = this.samples[Math.min(i, n - 1)];
        const age = Math.min(1, (t - s.t) / TRAIL_LIFE);
        // Fade with age; only fast swings leave a strong trail.
        const k = i < n ? (1 - age) * Math.min(1, s.speed / 8) * 0.95 : 0;
        if (k > 0.02) visible = true;
        const base = this.width < 1 ? add(s.tip, scale(sub(s.base, s.tip), this.width)) : s.base;
        this.pos.set(base, i * 6);
        this.pos.set(s.tip, i * 6 + 3);
        this.col.set([this.color.r * k * 0.25, this.color.g * k * 0.25, this.color.b * k * 0.25], i * 6);
        this.col.set([this.color.r * k, this.color.g * k, this.color.b * k], i * 6 + 3);
      }
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.geometry.attributes.color.needsUpdate = true;
      return visible;
    }
  }

  class FX {
    constructor(viewer) {
      this.v = viewer;
      this.scene = viewer.scene;
      this.enabled = true;
      this.items = [];
      this.trails = {};
      this.shake = 0;
      this.charge = null;
      this.beam = null;
      this.running = false;
      this.texGlow = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
      this.texSmoke = radialTexture('rgba(200,200,200,0.9)', 'rgba(200,200,200,0)');
    }

    setEnabled(on) {
      this.enabled = !!on;
      if (!this.enabled) this.clear();
    }

    clear() {
      for (const t of Object.values(this.trails)) t.clear();
      for (const it of this.items) this.scene.remove(it.obj);
      this.items.length = 0;
      this.endCharge();
      this.endBeam();
      this.shake = 0;
      this.v.render();
    }

    // ---------------- trails ----------------
    trail(key, color, width) {
      if (!this.trails[key]) this.trails[key] = new Trail(this.scene, color, width);
      return this.trails[key];
    }
    /** Called by the viewer after every pose. Trails only follow live playback. */
    sample(playing) {
      if (!this.enabled || !playing || !this.v.world) {
        for (const t of Object.values(this.trails)) t.clear();
        return;
      }
      const w = this.v.world, rig = this.v.rig, t = now();
      const kit = this.v.kitGroups || {};
      let any = false;
      for (const [hand, joint] of [['right', 'Handle'], ['left', 'LeftHandle']]) {
        const g = kit[hand];
        const span = g && BLADE_SPAN[g.userData.model];
        if (!span) continue;
        any = true;
        this.trail('blade-' + hand, 0xbfe6ff).push(at(w[joint], [0, span[0], 0]), at(w[joint], [0, span[1], 0]), t);
      }
      if (!any && !kit.right && !kit.left) {
        // Unarmed: short streaks behind fists and feet.
        for (const limb of ['RightArm', 'LeftArm', 'RightLeg', 'LeftLeg']) {
          const end = C.limbEndWorld(rig, w, limb);
          const ch = C.limbChain(rig, limb);
          const back = at(w[ch.end], [0, ch.kind === 'Arm' ? 0.6 : 0.5, 0]);
          this.trail('limb-' + limb, 0xffd9a0, 0.9).push(back, end, t);
        }
      }
      this.loop();
    }

    // ---------------- marker effects ----------------
    /** Point where a marker's effect should appear. */
    spot(m) {
      const w = this.v.world, rig = this.v.rig, kit = this.v.kitGroups || {};
      const v = String(m.value || '');
      if (/foot|kick|sweep/i.test(v)) return C.limbEndWorld(rig, w, /left/i.test(v) ? 'LeftLeg' : 'RightLeg');
      if (kit.right && BLADE_SPAN[kit.right.userData.model]) return at(w.Handle, [0, BLADE_SPAN[kit.right.userData.model][1] * 0.8, 0]);
      if (/^L$|left/i.test(v)) return C.limbEndWorld(rig, w, 'LeftArm');
      return C.limbEndWorld(rig, w, 'RightArm');
    }
    groundSpot() {
      const p = this.v.world[this.v.rig.rootJoint].p;
      return [p[0], 0.05, p[2]];
    }
    muzzle() {
      const w = this.v.world, kit = this.v.kitGroups || {};
      if (kit.right && kit.right.userData.model === 'heavygun') return { p: at(w.Handle, [0, 0.7, -4.5]), d: dirOf(w.Handle, [0, 0, -1]) };
      if (kit.left && kit.left.userData.model === 'bow') {
        const hand = C.limbEndWorld(this.v.rig, w, 'LeftArm');
        const fwd = sub(hand, C.limbEndWorld(this.v.rig, w, 'RightArm'));
        return { p: hand, d: scale(fwd, 1 / (len(fwd) || 1)) };
      }
      const hand = C.limbEndWorld(this.v.rig, w, 'RightArm');
      const torso = w[this.v.rig.rootJoint];
      return { p: hand, d: dirOf(torso, [0, 0, -1]) };
    }

    trigger(m) {
      if (!this.enabled || !this.v.world) return;
      const name = m.name, value = String(m.value || '');
      const heavy = /slam|quake|pound|stomp|barrier|finish/i.test(value);
      if (name === 'Hit') {
        if (heavy && !/finish/i.test(value)) { this.dust(this.groundSpot(), 7, 0xffd28a); this.shake = Math.max(this.shake, 0.45); }
        this.burst(this.spot(m), heavy ? 1.6 : 1, 0xfff1b8);
        this.shake = Math.max(this.shake, heavy ? 0.35 : 0.12);
        if (this.charge) this.endCharge();
      } else if (name === 'Land') {
        this.dust(this.groundSpot(), 4.5, 0xd9c3a0);
        this.shake = Math.max(this.shake, 0.3);
      } else if (name === 'Warn') {
        this.warnDisc(this.groundSpot(), /stomp|slam|spin/i.test(value) ? 7 : 4.5);
      } else if (name === 'Charge') {
        if (value === 'full') { this.flash(this.v.world.UpperTorso ? this.v.world.UpperTorso.p : this.groundSpot(), 0xffe37a, 2.2); this.startCharge(0xffd04d, 1.4); }
        else this.startCharge(0x7fc8ff, 1);
      } else if (name === 'Fire' || name === 'Shoot') {
        if (value === 'beam-start') { this.startBeam(); return; }
        if (value === 'beam-end') { this.endBeam(); return; }
        const mz = this.muzzle();
        if (value === 'Up') mz.d = [mz.d[0] * 0.5, 0.85, mz.d[2] * 0.5];
        this.flash(mz.p, name === 'Fire' ? 0xffb347 : 0xd9f2ff, value === 'blast' || value === 'Power' ? 2.4 : 1.2);
        this.projectile(mz.p, mz.d, name === 'Fire' ? 0xffa64d : 0xcfeeff, value === 'blast' ? 2 : 1);
        if (name === 'Fire') this.shake = Math.max(this.shake, value === 'blast' ? 0.4 : 0.15);
      } else if (name === 'Roar' || name === 'Phase') {
        this.shockwave(add(this.groundSpot(), [0, 2.5, 0]), name === 'Phase' ? 0xff5a5a : 0xffffff);
        this.shake = Math.max(this.shake, 0.4);
      } else if (name === 'Rain') {
        this.rain(this.groundSpot());
      } else if (name === 'Spawn') {
        for (let i = 0; i < 6; i++) this.smoke(add(this.groundSpot(), [(Math.random() - 0.5) * 2.5, 0.4, (Math.random() - 0.5) * 2.5]));
      } else if (name === 'Throw') {
        const mz = this.muzzle();
        this.projectile(mz.p, add(mz.d, [0, 0.25, 0]), 0xdddddd, 1);
      }
      this.loop();
    }

    // ---------------- effect builders ----------------
    sprite(color, size, opacity) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texGlow, color, transparent: true, opacity: opacity === undefined ? 1 : opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.set(size, size, size);
      s.renderOrder = 7;
      s.raycast = () => {};
      return s;
    }
    addItem(obj, life, update) {
      this.scene.add(obj);
      this.items.push({ obj, life, age: 0, update });
    }
    burst(p, power, color) {
      const core = this.sprite(color, 1.2 * power);
      core.position.set(...p);
      this.addItem(core, 0.22, (o, k) => { const s = (1.2 + k * 2.2) * power; o.scale.set(s, s, s); o.material.opacity = 1 - k; });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.set(...p);
      ring.lookAt(this.v.camera.position);
      this.addItem(ring, 0.28, (o, k) => { const s = 1 + k * 3 * power; o.scale.set(s, s, s); o.material.opacity = 1 - k; });
      for (let i = 0; i < 10; i++) {
        const d = [Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5];
        const sp = this.sprite(color, 0.25 * power);
        sp.position.set(...p);
        const v = scale(d, (6 + Math.random() * 6) * power);
        this.addItem(sp, 0.3, (o, k, dt) => { o.position.x += v[0] * dt; o.position.y += v[1] * dt; o.position.z += v[2] * dt; v[1] -= 20 * dt; o.material.opacity = 1 - k; });
      }
    }
    flash(p, color, size) {
      const s = this.sprite(color, size);
      s.position.set(...p);
      this.addItem(s, 0.12, (o, k) => { o.material.opacity = 1 - k; });
    }
    dust(p, radius, color) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p[0], 0.06, p[2]);
      this.addItem(ring, 0.5, (o, k) => { const s = 0.5 + k * radius; o.scale.set(s, s, s); o.material.opacity = 0.8 * (1 - k); });
      for (let i = 0; i < 8; i++) this.smoke(add(p, [Math.cos(i) * 1.2, 0.3, Math.sin(i) * 1.2]), 0.6);
    }
    smoke(p, life) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texSmoke, transparent: true, opacity: 0.55, depthWrite: false }));
      s.position.set(...p);
      s.scale.set(1, 1, 1);
      s.raycast = () => {};
      const drift = [(Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2];
      this.addItem(s, life || 0.9, (o, k, dt) => { o.position.x += drift[0] * dt; o.position.y += drift[1] * dt; o.position.z += drift[2] * dt; const sc = 1 + k * 2; o.scale.set(sc, sc, sc); o.material.opacity = 0.55 * (1 - k); });
    }
    warnDisc(p, radius) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.35, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p[0], 0.04, p[2]);
      const edge = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(p[0], 0.05, p[2]);
      edge.scale.set(radius, radius, radius);
      this.addItem(edge, 0.9, (o, k) => { o.material.opacity = k < 0.85 ? 1 : (1 - k) / 0.15; });
      this.addItem(disc, 0.9, (o, k) => { const s = radius * Math.min(1, k * 1.2); o.scale.set(s, s, s); o.material.opacity = (k < 0.85 ? 0.35 : 0.35 * (1 - k) / 0.15) * (0.75 + 0.25 * Math.sin(k * 40)); });
    }
    shockwave(p, color) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(...p);
      this.addItem(ring, 0.6, (o, k) => { const s = 1 + k * 9; o.scale.set(s, s, s); o.material.opacity = 1 - k; });
    }
    projectile(p, d, color, size) {
      const dir = scale(d, 1 / (len(d) || 1));
      const head = this.sprite(color, 0.6 * size);
      head.position.set(...p);
      const v = scale(dir, 45);
      this.addItem(head, 0.45, (o, k, dt) => { o.position.x += v[0] * dt; o.position.y += v[1] * dt; o.position.z += v[2] * dt; o.material.opacity = 1 - k * 0.6; });
    }
    rain(p) {
      for (let i = 0; i < 24; i++) {
        const s = this.sprite(0xcfeeff, 0.35);
        const x = p[0] + (Math.random() - 0.5) * 8, z = p[2] - 4 - Math.random() * 6;
        const delay = Math.random() * 0.5;
        s.position.set(x, 14, z);
        s.visible = false;
        this.addItem(s, 0.9 + delay, (o, k, dt, age) => {
          if (age < delay) return;
          o.visible = true;
          o.position.y -= 30 * dt;
          if (o.position.y < 0.2) { o.position.y = 0.2; o.material.opacity *= 0.8; }
        });
      }
    }
    startCharge(color, power) {
      this.endCharge();
      const aura = this.sprite(color, 5 * power, 0.35);
      aura.renderOrder = 3;
      this.scene.add(aura);
      this.charge = { obj: aura, power, t0: now() };
      this.loop();
    }
    endCharge() {
      if (this.charge) { this.scene.remove(this.charge.obj); this.charge = null; }
    }
    startBeam() {
      this.endBeam();
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.raycast = () => {};
      this.scene.add(beam);
      this.beam = { obj: beam };
      this.loop();
    }
    endBeam() {
      if (this.beam) { this.scene.remove(this.beam.obj); this.beam = null; }
    }

    // ---------------- animation loop ----------------
    loop() {
      if (this.running) return;
      this.running = true;
      let last = now();
      const step = () => {
        const t = now(), dt = Math.min(0.05, t - last);
        last = t;
        let alive = false;
        for (const tr of Object.values(this.trails)) if (tr.update(t)) alive = true;
        for (let i = this.items.length - 1; i >= 0; i--) {
          const it = this.items[i];
          it.age += dt;
          const k = Math.min(1, it.age / it.life);
          if (it.update) it.update(it.obj, k, dt, it.age);
          if (k >= 1) { this.scene.remove(it.obj); this.items.splice(i, 1); }
        }
        if (this.items.length) alive = true;
        const w = this.v.world;
        if (this.charge && w) {
          const p = w.UpperTorso ? w.UpperTorso.p : w[this.v.rig.rootJoint].p;
          this.charge.obj.position.set(p[0], p[1] - 0.3, p[2]);
          const pulse = 1 + 0.12 * Math.sin((t - this.charge.t0) * 18);
          const s = 5 * this.charge.power * pulse;
          this.charge.obj.scale.set(s, s, s);
          alive = true;
        }
        if (this.beam && w) {
          const mz = this.muzzle();
          const d = scale(mz.d, 1 / (len(mz.d) || 1)), L = 30;
          const mid = add(mz.p, scale(d, L / 2));
          this.beam.obj.position.set(...mid);
          this.beam.obj.scale.set(1 + 0.15 * Math.sin(t * 50), L, 1 + 0.15 * Math.sin(t * 50));
          this.beam.obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
          this.shake = Math.max(this.shake, 0.06);
          alive = true;
        }
        if (this.shake > 0.001) {
          this.v.shakeOffset = [(Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake];
          this.shake *= Math.pow(0.02, dt);
          alive = true;
        } else {
          this.shake = 0;
          this.v.shakeOffset = null;
        }
        this.v.renderNow();
        if (alive) requestAnimationFrame(step); else this.running = false;
      };
      requestAnimationFrame(step);
    }
  }

  root.NineFX = FX;
})(typeof self !== 'undefined' ? self : this);
