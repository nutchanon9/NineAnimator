/*
 * 3D preview: draws the rig with three.js, an orbit camera, part picking,
 * and "drag a body part to rotate it".
 * Depends on globals THREE and NineCore.
 */
(function (root) {
  'use strict';
  const C = root.NineCore;

  const PART_COLORS = {
    body: 0x3a78b8, head: 0xf0c66a, arm: 0xf0c66a, leg: 0x4f9a52, hand: 0xe6b857, foot: 0x3f8344,
  };
  function partColor(name) {
    if (name === 'Head') return PART_COLORS.head;
    if (/Hand/.test(name)) return PART_COLORS.hand;
    if (/Foot/.test(name)) return PART_COLORS.foot;
    if (/Arm/.test(name)) return PART_COLORS.arm;
    if (/Leg/.test(name)) return PART_COLORS.leg;
    return PART_COLORS.body;
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function faceTexture(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#f0c66a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2116';
    const s = Math.min(w, h);
    g.beginPath(); g.ellipse(w / 2 - s * 0.18, h * 0.42, s * 0.05, s * 0.09, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(w / 2 + s * 0.18, h * 0.42, s * 0.05, s * 0.09, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = s * 0.05; g.lineCap = 'round'; g.strokeStyle = '#2a2116';
    g.beginPath(); g.arc(w / 2, h * 0.55, s * 0.2, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // ------------------------------------------------------------------
  // Weapon models. Geometry is in the weapon joint's frame (the tool Handle):
  // grip at the origin, blades along +Y, gun barrels along -Z (the fingers'
  // direction), +Z toward the elbow. These are only for the preview.
  // ------------------------------------------------------------------
  const KITS = {
    none: {},
    sword: { right: 'sword' },
    longsword: { right: 'longsword' },
    dual: { right: 'shortblade', left: 'shortblade' },
    greatsword: { right: 'greatsword' },
    swordshield: { right: 'shortsword', left: 'shield' },
    bow: { left: 'bow' },
    heavygun: { right: 'heavygun' },
  };
  const BLADES = new Set(['sword', 'shortsword', 'shortblade', 'longsword', 'greatsword']);
  const mat = (color, metal) => new THREE.MeshStandardMaterial({ color, metalness: metal || 0, roughness: metal ? 0.35 : 0.75 });
  function part(g, geo, material, x, y, z) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    g.add(m);
    return m;
  }
  /** Straight blade: grip below the origin, guard, then the blade along +Y. */
  function blade(o) {
    const g = new THREE.Group();
    part(g, new THREE.BoxGeometry(o.grip[0], o.grip[1], o.grip[0]), mat(o.gripColor || 0x3b2b20), 0, o.grip[1] / 2 - o.grip[1] * 0.8 + 0.05);
    part(g, new THREE.BoxGeometry(o.guard[0], o.guard[1], o.guard[2]), mat(o.guardColor || 0xc89b3c, 0.5), 0, o.guardY);
    part(g, new THREE.BoxGeometry(o.blade[0], o.blade[1], o.blade[2]), mat(o.bladeColor || 0xc9d1dc, 0.6), 0, o.guardY + o.guard[1] / 2 + o.blade[1] / 2);
    return g;
  }
  const MODELS = {
    sword: () => blade({ grip: [0.16, 0.7], guard: [0.14, 0.16, 0.9], guardY: 0.35, blade: [0.07, 3.0, 0.32] }),
    shortsword: () => blade({ grip: [0.16, 0.6], guard: [0.14, 0.14, 0.8], guardY: 0.3, blade: [0.07, 2.3, 0.3] }),
    shortblade: () => blade({ grip: [0.14, 0.55], guard: [0.12, 0.12, 0.5], guardY: 0.28, blade: [0.06, 1.9, 0.24], bladeColor: 0xb8c2d0 }),
    longsword: () => {
      const g = blade({ grip: [0.15, 1.15], guard: [0.5, 0.08, 0.5], guardY: 0.3, blade: [0.06, 4.2, 0.2], gripColor: 0x2a2440, guardColor: 0x8a7a50 });
      return g;
    },
    greatsword: () => blade({ grip: [0.2, 1.25], guard: [0.26, 0.26, 1.5], guardY: 0.38, blade: [0.14, 4.6, 0.95], bladeColor: 0x9aa4b2, guardColor: 0x5a4a3a }),
    shield: () => {
      const g = new THREE.Group();
      const face = part(g, new THREE.CylinderGeometry(1.1, 1.1, 0.14, 28), mat(0x8c2f2f), -0.28, 0, 0.35);
      face.rotation.z = Math.PI / 2; // disc faces the hand's outside (-X)
      part(g, new THREE.SphereGeometry(0.22, 12, 8), mat(0xc89b3c, 0.5), -0.36, 0, 0.35);
      return g;
    },
    bow: () => {
      // Built in the hand's frame (limbs along the hand's X, bulging along -Y,
      // i.e. away from the body when the arm points at the target), then turned
      // into the handle frame.
      const g = new THREE.Group();
      const inner = new THREE.Group();
      inner.rotation.x = Math.PI / 2;
      const R = 1.9, arc = 1.3;
      const limb = part(inner, new THREE.TorusGeometry(R, 0.07, 6, 28, arc), mat(0x7a4a24), 0, R, 0);
      limb.rotation.z = -Math.PI / 2 - arc / 2;
      const endY = R - R * Math.cos(arc / 2), endX = R * Math.sin(arc / 2);
      part(inner, new THREE.BoxGeometry(endX * 2, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0xe8e2d0 }), 0, endY, 0);
      g.add(inner);
      return g;
    },
    heavygun: () => {
      const g = new THREE.Group();
      const metal = mat(0x4a5058, 0.6), dark = mat(0x23262b, 0.5), wood = mat(0x6b4426);
      part(g, new THREE.BoxGeometry(0.2, 0.6, 0.28), dark, 0, 0.05, 0);          // grip in the fist
      part(g, new THREE.BoxGeometry(0.55, 0.6, 3.2), metal, 0, 0.62, -0.7);      // body over the forearm
      const barrel = part(g, new THREE.CylinderGeometry(0.2, 0.2, 2.0, 16), dark, 0, 0.7, -3.25);
      barrel.rotation.x = Math.PI / 2;
      part(g, new THREE.BoxGeometry(0.62, 0.62, 0.35), metal, 0, 0.7, -4.2);     // muzzle
      const scope = part(g, new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12), dark, 0, 1.08, -0.6);
      scope.rotation.x = Math.PI / 2;
      part(g, new THREE.BoxGeometry(0.4, 0.55, 1.1), wood, 0, 0.45, 1.4);        // stock toward the shoulder
      return g;
    },
  };

  /** Box geometry for a joint, shifted by its optional meshOffset (e.g. along a blade). */
  function boxFor(jt) {
    const geo = new THREE.BoxGeometry(...jt.size);
    if (jt.meshOffset) geo.translate(...jt.meshOffset);
    return geo;
  }

  /** Write a NineCore CFrame into a THREE.Matrix4. */
  function setMatrix(m4, w) {
    m4.set(w.r[0], w.r[1], w.r[2], w.p[0], w.r[3], w.r[4], w.r[5], w.p[1], w.r[6], w.r[7], w.r[8], w.p[2], 0, 0, 0, 1);
  }

  /** Rodrigues rotation matrix (row-major 3x3) about a unit axis. */
  function axisAngle(axis, ang) {
    const [x, y, z] = axis, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return [
      t * x * x + c, t * x * y - s * z, t * x * z + s * y,
      t * x * y + s * z, t * y * y + c, t * y * z - s * x,
      t * x * z - s * y, t * y * z + s * x, t * z * z + c,
    ];
  }

  class Viewer {
    constructor(container, opts) {
      this.el = container;
      this.opts = opts || {};
      this.rigId = null;
      this.meshes = {};
      this.selected = null;
      this.prop = 'sword';
      this.ghostStates = null;

      if (THREE.ColorManagement && 'legacyMode' in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      else renderer.outputEncoding = THREE.sRGBEncoding;
      container.appendChild(renderer.domElement);
      renderer.domElement.setAttribute('aria-label', 'มุมมอง 3 มิติของตัวละคร');
      this.renderer = renderer;

      const scene = new THREE.Scene();
      this.scene = scene;
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
      this.orbit = { yaw: -0.6, pitch: 0.18, dist: 13, target: new THREE.Vector3(0, 2.7, 0) };

      this.hemi = new THREE.HemisphereLight(0xffffff, 0x445066, 0.9);
      scene.add(this.hemi);
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(-6, 12, -8);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 8, bottom: -2, near: 1, far: 40 });
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xffffff, 0.35);
      fill.position.set(8, 5, 6);
      scene.add(fill);

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.22 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      this.ground = ground;

      // Direction arrow on the floor: the character faces -Z.
      const arrowShape = new THREE.Shape();
      arrowShape.moveTo(0, -0.45); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(-0.3, 0); arrowShape.closePath();
      this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
      this.arrow.rotation.x = -Math.PI / 2;
      this.arrow.position.set(0, 0.01, -1.5);
      scene.add(this.arrow);

      this.rigGroup = new THREE.Group();
      scene.add(this.rigGroup);
      this.buildKit(this.prop);
      this.ghostGroups = [new THREE.Group(), new THREE.Group()];
      this.ghostGroups.forEach((g) => scene.add(g));

      this.raycaster = new THREE.Raycaster();
      // IK handles (hands/feet) and the drag target marker.
      this.ikMode = false;
      const handleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 });
      this.ikHandles = [0, 1, 2, 3].map(() => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), handleMat);
        m.renderOrder = 5; m.visible = false; m.raycast = () => {};
        scene.add(m);
        return m;
      });
      this.ikHandleMat = handleMat;
      this.ikTarget = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.6 }));
      this.ikTarget.renderOrder = 6; this.ikTarget.visible = false; this.ikTarget.raycast = () => {};
      scene.add(this.ikTarget);
      this.applyTheme();
      this.bindInput();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
      this.resize();
    }

    applyTheme() {
      const bg = new THREE.Color(cssVar('--view-bg', '#1a1e26'));
      this.scene.background = bg;
      if (this.grid) this.scene.remove(this.grid);
      const major = new THREE.Color(cssVar('--view-grid-major', '#3a4150'));
      const minor = new THREE.Color(cssVar('--view-grid', '#2a303b'));
      this.grid = new THREE.GridHelper(40, 40, major, minor);
      this.grid.position.y = 0.002;
      this.scene.add(this.grid);
      this.selectColor = new THREE.Color(cssVar('--select', '#4fb3ea'));
      this.arrow.material.color = new THREE.Color(cssVar('--accent', '#f0ae3c'));
      if (this.ikHandleMat) { this.ikHandleMat.color = new THREE.Color(cssVar('--accent', '#f0ae3c')); this.ikTarget.material.color = new THREE.Color(cssVar('--select', '#4fb3ea')); }
      this.ghostColors = [new THREE.Color(cssVar('--accent', '#f0ae3c')), new THREE.Color(cssVar('--select', '#4fb3ea'))];
      if (this.ghostGroups) this.ghostGroups.forEach((g, i) => g.children.forEach((m) => m.material.color.copy(this.ghostColors[i])));
      if (this.selected) this.setSelected(this.selected);
      this.render();
    }

    /** Build the weapon models for a kit and attach them to the scene. */
    buildKit(kitName) {
      for (const g of Object.values(this.kitGroups || {})) {
        if (!g) continue;
        this.scene.remove(g);
        g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      const kit = KITS[kitName] || KITS.none;
      this.kitGroups = {};
      for (const [hand, joint] of [['right', 'Handle'], ['left', 'LeftHandle']]) {
        const model = kit[hand];
        if (!model) { this.kitGroups[hand] = null; continue; }
        const g = MODELS[model]();
        g.matrixAutoUpdate = false;
        g.userData.joint = joint;
        g.userData.blade = BLADES.has(model);
        g.traverse((o) => { o.userData.joint = joint; if (o.isMesh) o.castShadow = true; });
        this.scene.add(g);
        this.kitGroups[hand] = g;
      }
    }


    setRig(rigId) {
      if (this.rigId === rigId) return;
      this.rigId = rigId;
      this.rig = C.RIGS[rigId];
      for (const m of Object.values(this.meshes)) { this.rigGroup.remove(m); m.geometry.dispose(); }
      this.meshes = {};
      const headTex = rigId === 'R6' ? faceTexture(256, 128) : faceTexture(160, 160);
      for (const jt of this.rig.joints) {
        const geo = boxFor(jt);
        const base = new THREE.MeshStandardMaterial({ color: partColor(jt.name), roughness: 0.75, metalness: 0 });
        let mat = base;
        if (jt.name === 'Head') {
          const face = new THREE.MeshStandardMaterial({ map: headTex, roughness: 0.75 });
          mat = [base, base, base, base, base, face];
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData.joint = jt.name;
        // The weapon joint is drawn by the sword prop; its box is only for picking.
        if (jt.optional) mesh.visible = false;
        this.rigGroup.add(mesh);
        this.meshes[jt.name] = mesh;
      }
      this.selected = null;
      // Onion-skin ghosts: one translucent copy per neighbouring keyframe.
      this.ghostGroups.forEach((grp, i) => {
        grp.children.slice().forEach((m) => { grp.remove(m); m.geometry.dispose(); });
        for (const jt of this.rig.joints) {
          const m = new THREE.Mesh(boxFor(jt), new THREE.MeshBasicMaterial({
            color: this.ghostColors[i], transparent: true, opacity: 0.16, depthWrite: false,
          }));
          m.matrixAutoUpdate = false;
          m.userData.joint = jt.name;
          m.raycast = () => {};
          grp.add(m);
        }
        grp.visible = false;
      });
    }

    /** Show translucent copies of the previous/next keyframe pose. states = [msPrev|null, msNext|null] or null. */
    setGhosts(states) {
      this.ghostGroups.forEach((grp, i) => {
        const ms = states && states[i];
        grp.visible = !!ms;
        if (!ms) return;
        const world = C.computeWorld(this.rig, ms);
        grp.children.forEach((m) => {
          setMatrix(m.matrix, world[m.userData.joint]);
          m.matrixWorldNeedsUpdate = true;
          if (m.userData.joint === 'Handle' || m.userData.joint === 'LeftHandle') m.visible = this.weaponGhost(m.userData.joint);
        });
      });
      this.render();
    }

    setProp(name) {
      this.prop = KITS[name] ? name : 'none';
      this.buildKit(this.prop);
      if (this.world) this.placeProps();
      this.setSelected(this.selected);
    }

    /** Joints that the current kit draws a weapon for. */
    weaponJoints() {
      return Object.values(this.kitGroups).filter(Boolean).map((g) => g.userData.joint);
    }

    weaponGhost(joint) {
      const g = Object.values(this.kitGroups).find((x) => x && x.userData.joint === joint);
      return !!(g && g.userData.blade);
    }

    placeProps() {
      for (const g of Object.values(this.kitGroups)) {
        if (!g) continue;
        setMatrix(g.matrix, this.world[g.userData.joint]);
        g.matrixWorldNeedsUpdate = true;
      }
    }

    /** ms = { jointName: M } from NineCore.sampleAll */
    setPose(ms) {
      this.world = C.computeWorld(this.rig, ms);
      const m4 = new THREE.Matrix4();
      for (const jt of this.rig.joints) {
        const w = this.world[jt.name];
        m4.set(w.r[0], w.r[1], w.r[2], w.p[0], w.r[3], w.r[4], w.r[5], w.p[1], w.r[6], w.r[7], w.r[8], w.p[2], 0, 0, 0, 1);
        this.meshes[jt.name].matrix.copy(m4);
        this.meshes[jt.name].matrixWorldNeedsUpdate = true;
      }
      this.placeProps();
      this.placeIKHandles();
      this.render();
    }

    setSelected(name) {
      this.selected = name;
      for (const g of Object.values(this.kitGroups)) {
        if (!g) continue;
        const on = g.userData.joint === name;
        g.traverse((o) => {
          if (!o.material || !o.material.emissive) return;
          o.material.emissive = on ? this.selectColor : new THREE.Color(0x000000);
          o.material.emissiveIntensity = on ? 0.4 : 0;
        });
      }
      for (const [n, mesh] of Object.entries(this.meshes)) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          m.emissive = n === name ? this.selectColor : new THREE.Color(0x000000);
          m.emissiveIntensity = n === name ? 0.28 : 0;
        });
      }
      this.render();
    }

    setView(which) {
      const views = { front: [0, 0.12], side: [Math.PI / 2, 0.12], three: [-0.6, 0.18], back: [Math.PI, 0.12] };
      const v = views[which] || views.three;
      this.orbit.yaw = v[0]; this.orbit.pitch = v[1];
      this.orbit.target.set(0, 2.7, 0); this.orbit.dist = 13;
      this.render();
    }

    resize() {
      const r = this.el.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = w + 'px';
      this.renderer.domElement.style.height = h + 'px';
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.render();
    }

    render() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.renderNow();
      });
    }

    renderNow() {
      const o = this.orbit;
      o.pitch = Math.max(-1.2, Math.min(1.45, o.pitch));
      o.dist = Math.max(3, Math.min(40, o.dist));
      // yaw 0 looks at the character's face (camera on -Z side).
      const cp = Math.cos(o.pitch);
      this.camera.position.set(
        o.target.x - Math.sin(o.yaw) * cp * o.dist,
        o.target.y + Math.sin(o.pitch) * o.dist,
        o.target.z - Math.cos(o.yaw) * cp * o.dist,
      );
      this.camera.lookAt(o.target);
      this.renderer.render(this.scene, this.camera);
    }

    /** Render right now and return the picture as a data URL (for thumbnails). */
    snapshot() {
      this.renderNow();
      return this.renderer.domElement.toDataURL('image/jpeg', 0.82);
    }

    /** World point where the mouse ray meets a plane, or null. */
    planePoint(clientX, clientY, plane) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const out = new THREE.Vector3();
      return this.raycaster.ray.intersectPlane(plane, out) ? [out.x, out.y, out.z] : null;
    }

    /** Show drag handles on hands and feet when IK dragging is on. */
    setIKMode(on) {
      this.ikMode = !!on;
      this.placeIKHandles();
      this.render();
    }

    placeIKHandles() {
      this.ikHandles.forEach((h, i) => {
        const limb = ['RightArm', 'LeftArm', 'RightLeg', 'LeftLeg'][i];
        h.visible = !!(this.ikMode && this.world && this.rig);
        if (!h.visible) return;
        const p = C.limbEndWorld(this.rig, this.world, limb);
        h.position.set(p[0], p[1], p[2]);
      });
    }

    pick(clientX, clientY) {
      const r = this.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      this.rigGroup.updateMatrixWorld(true);
      // Hidden weapon boxes still take part in raycasts, so use the weapon models instead.
      const targets = Object.values(this.meshes).filter((m) => m.visible);
      for (const g of Object.values(this.kitGroups)) if (g) targets.push(g);
      const hit = this.raycaster.intersectObjects(targets, true)[0];
      return hit ? hit.object.userData.joint : null;
    }

    bindInput() {
      const el = this.renderer.domElement;
      el.style.touchAction = 'none';
      const pointers = new Map();
      let mode = null, start = null, last = null, pinch0 = 0, moved = false, poseJoint = null;

      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('pointerdown', (e) => {
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = false;
        start = last = { x: e.clientX, y: e.clientY };
        if (pointers.size === 2) {
          mode = 'pinch';
          const [a, b] = [...pointers.values()];
          pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
          if (poseJoint && this.opts.onPoseDragEnd) this.opts.onPoseDragEnd();
          poseJoint = null;
          return;
        }
        if (e.button === 2 || e.button === 1 || e.shiftKey && e.altKey) { mode = 'pan'; return; }
        const hitJoint = this.pick(e.clientX, e.clientY);
        const limb = this.ikMode && hitJoint && this.rig ? C.limbOfPart(this.rig, hitJoint) : null;
        if (limb && this.opts.onIKDrag && this.world) {
          // IK: drag the hand/foot on a plane facing the camera through its end point.
          mode = 'ik'; poseJoint = limb;
          const p = C.limbEndWorld(this.rig, this.world, limb);
          const n = new THREE.Vector3(); this.camera.getWorldDirection(n);
          this.ikPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(p[0], p[1], p[2]));
          if (this.opts.onIKDragStart) this.opts.onIKDragStart(limb);
        } else if (hitJoint && hitJoint === this.selected && this.opts.onPoseDrag) {
          mode = 'pose'; poseJoint = hitJoint;
          if (this.opts.onPoseDragStart) this.opts.onPoseDragStart(hitJoint);
        } else {
          mode = 'orbit';
        }
      });
      el.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId)) {
          if (!e.buttons) el.style.cursor = this.pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
          return;
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (mode === 'pinch' && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch0 > 0) this.orbit.dist *= pinch0 / d;
          pinch0 = d;
          this.render();
          return;
        }
        const dx = e.clientX - last.x, dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) moved = true;
        if (!moved) return;
        if (mode === 'orbit') {
          this.orbit.yaw -= dx * 0.008;
          this.orbit.pitch += dy * 0.006;
          this.render();
        } else if (mode === 'pan') {
          const s = this.orbit.dist * 0.0016;
          const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
          this.orbit.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
          this.render();
        } else if (mode === 'pose' && poseJoint) {
          this.dragJoint(poseJoint, dx, dy, e.shiftKey);
        } else if (mode === 'ik' && poseJoint) {
          const t = this.planePoint(e.clientX, e.clientY, this.ikPlane);
          if (t) {
            this.ikTarget.position.set(t[0], t[1], t[2]);
            this.ikTarget.visible = true;
            this.opts.onIKDrag(poseJoint, t);
          }
        }
      });
      const end = (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        if (mode === 'pose' && poseJoint && this.opts.onPoseDragEnd) this.opts.onPoseDragEnd();
        if (mode === 'ik' && poseJoint) {
          this.ikTarget.visible = false;
          if (this.opts.onIKDragEnd) this.opts.onIKDragEnd(poseJoint);
          if (!moved && this.opts.onPick) this.opts.onPick(this.pick(e.clientX, e.clientY));
          moved = true; // handled
        }
        if (!moved && mode !== 'pinch' && mode !== 'pan' && e.type === 'pointerup') {
          const j = this.pick(e.clientX, e.clientY);
          if (this.opts.onPick) this.opts.onPick(j);
        }
        if (pointers.size === 0) { mode = null; poseJoint = null; }
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.orbit.dist *= Math.exp(e.deltaY * 0.0012);
        this.render();
      }, { passive: false });
    }

    /**
     * Turn a screen drag into a rotation of the joint about the camera's
     * axes (like a trackball), expressed in the parent part's frame.
     * Shift = twist around the axis pointing at the camera.
     */
    dragJoint(name, dx, dy, twist) {
      if (!this.world || !this.opts.onPoseDrag) return;
      const jt = this.rig.byName[name];
      const parentR = this.world[jt.parent].r;
      const m = this.camera.matrixWorld.elements; // column-major
      const right = [m[0], m[1], m[2]], up = [m[4], m[5], m[6]], back = [m[8], m[9], m[10]];
      let axisW, ang;
      if (twist) {
        axisW = back; ang = -dx * 0.012;
      } else {
        axisW = [up[0] * dx + right[0] * dy, up[1] * dx + right[1] * dy, up[2] * dx + right[2] * dy];
        const len = Math.hypot(...axisW);
        if (len < 1e-6) return;
        axisW = axisW.map((v) => v / len);
        ang = len * 0.012;
      }
      // axis in parent space = parentR^T * axisW
      const a = [
        parentR[0] * axisW[0] + parentR[3] * axisW[1] + parentR[6] * axisW[2],
        parentR[1] * axisW[0] + parentR[4] * axisW[1] + parentR[7] * axisW[2],
        parentR[2] * axisW[0] + parentR[5] * axisW[1] + parentR[8] * axisW[2],
      ];
      this.opts.onPoseDrag(name, (pose) => {
        const cur = C.poseToM(pose);
        const r = C.m3mul(axisAngle(a, ang), cur.r);
        const out = { rot: C.m3ToEuler(r).map(C.roundAngle) };
        if (pose.pos) out.pos = pose.pos.slice();
        return out;
      });
    }
  }

  root.NineViewer = Viewer;
})(typeof self !== 'undefined' ? self : this);
