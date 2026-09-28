import * as THREE from 'three';

const blue = 0x65d9ff;
const red = 0xff5268;
function material(color, roughness = .6, metalness = .1) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function emissive(color, intensity = 2) { return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: .3 }); }
function box(parent, dimensions, position, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), mat);
  mesh.position.set(...position); parent.add(mesh); return mesh;
}
function labelTexture(text, color = '#7cdbff', background = '#0c1c2b') {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = background; context.fillRect(0, 0, 256, 128);
  context.strokeStyle = color; context.lineWidth = 3; context.strokeRect(5, 5, 246, 118);
  context.font = 'bold 62px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color; context.fillText(text, 128, 68);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createWorld(host) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1320);
  scene.fog = new THREE.FogExp2(0x0b1320, .024);
  const camera = new THREE.PerspectiveCamera(65, 1, .04, 150);
  camera.position.set(0, 1.8, 4); camera.rotation.x = -.045;
  scene.add(camera);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xc6eaff, 0x152a43, 2.2));
  const frontLight = new THREE.DirectionalLight(0xeaf6ff, 3.5); frontLight.position.set(-3, 8, 4); scene.add(frontLight);
  const coolLight = new THREE.PointLight(blue, 22, 22, 2); coolLight.position.set(0, 3, -7); scene.add(coolLight);
  const warmLight = new THREE.PointLight(0xfead72, 8, 14, 2); warmLight.position.set(2, 2, 2); scene.add(warmLight);

  const dark = material(0x122132, .32, .65);
  const wall = material(0x213043, .5, .5);
  const bright = emissive(0x95e4ff, 2.3);
  const dim = emissive(0x146381, .65);
  const orange = emissive(0xff8c62, 1.4);
  box(scene, [10, .16, 132], [0, -.1, -54], material(0x162539, .24, .8));
  box(scene, [10, .18, 132], [0, 6, -54], material(0x142132));
  for (const side of [-1, 1]) {
    box(scene, [.2, 6, 132], [side * 5, 3, -54], wall);
    box(scene, [.04, .04, 132], [side * 3.55, .015, -54], dim);
    box(scene, [.06, .06, 132], [side * 4.8, .5, -54], bright);
    box(scene, [.06, .06, 132], [side * 4.8, 4.7, -54], dim);
    box(scene, [.055, .03, 132], [side * .84, .011, -54], dim);
  }
  const segments = [];
  const signMaterial = new THREE.MeshBasicMaterial({ map: labelTexture('FLUXO') });
  for (let i = 0; i < 20; i++) {
    const group = new THREE.Group(); group.position.z = 7 - i * 7;
    for (const side of [-1, 1]) {
      box(group, [.32, 5.7, .35], [side * 4.8, 2.8, 0], dark);
      box(group, [.06, 3.9, .08], [side * 4.58, 2.8, .05], bright);
      box(group, [1.65, .06, .32], [side * 3.75, 5.65, 0], bright);
      const accent = box(group, [.08, .2, 1.35], [side * 4.78, 1.2, -3.5], i % 4 === 0 ? orange : dim);
      accent.rotation.z = side * .1;
      box(group, [.12, 1.3, 2.7], [side * 4.81, 2.95, -3.4], dark);
    }
    box(group, [9.6, .24, .3], [0, 5.75, 0], dark);
    box(group, [1.9, .045, .17], [0, 5.58, 0], bright);
    box(group, [7.05, .012, .025], [0, .018, -3.5], dim);
    for (const side of [-1, 1]) {
      const chevron = box(group, [.36, .012, .06], [side * .14, .025, 0], dim);
      chevron.rotation.y = side * -.7;
    }
    if (i % 4 === 0) box(group, [1.4, .7, .05], [0, 4.7, -.2], signMaterial);
    scene.add(group); segments.push(group);
  }
  // Bright far portal anchors the vanishing point.
  box(scene, [2.8, 4.1, .2], [0, 2.2, -112], emissive(0x287895, 1));

  const phone = new THREE.Group(); camera.add(phone); phone.position.set(.24, -.37, -.93);
  const shell = material(0x19222b, .28, .7);
  box(phone, [.29, .56, .035], [0, 0, 0], shell);
  const screenMat = new THREE.MeshBasicMaterial({ map: labelTexture('↑', '#83e7ff', '#153c51') });
  box(phone, [.255, .505, .006], [0, 0, .022], screenMat);
  box(phone, [.055, .009, .008], [0, .223, .029], material(0x08131b));
  box(phone, [.055, .055, .009], [-.085, .21, -.023], material(0x060c12));
  const cameraGlass = emissive(0x41616c, .2);
  box(phone, [.024, .024, .009], [-.085, .21, -.031], cameraGlass);
  const skin = material(0xa87555, .85);
  const sleeve = material(0x293b4e, .85);
  const hands = [];
  for (const side of [-1, 1]) {
    const palm = new THREE.Mesh(new THREE.SphereGeometry(.072, 12, 9), skin); palm.scale.set(.74, 1.15, .66); camera.add(palm);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.065, .095, 1, 12), sleeve); camera.add(arm);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(.022, .07, 4, 8), skin); camera.add(thumb);
    hands.push({ side, palm, arm, thumb });
  }
  const pickupGeometry = new THREE.OctahedronGeometry(.29, 0);
  const pickupMats = { blue: emissive(blue, 1.5), red: emissive(red, 1.3) };
  const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(.8, .8, .8));
  const frameMats = { blue: new THREE.LineBasicMaterial({ color: blue, transparent: true, opacity: .52 }), red: new THREE.LineBasicMaterial({ color: red, transparent: true, opacity: .5 }) };
  const icons = { blue: new THREE.MeshBasicMaterial({ map: labelTexture('+', '#c7f5ff', '#124d67') }), red: new THREE.MeshBasicMaterial({ map: labelTexture('!', '#ffe0e3', '#8a243b') }) };
  const iconGeometry = new THREE.BoxGeometry(.36, .25, .01);
  function createPickup(kind, serial) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(pickupGeometry, pickupMats[kind]));
    const frame = new THREE.LineSegments(frameGeo, frameMats[kind]); group.add(frame);
    const icon = new THREE.Mesh(iconGeometry, icons[kind]);
    icon.position.z = .37; group.add(icon);
    group.position.set(Math.sin(serial * 2.3) * .42, 1.72, -65);
    scene.add(group);
    return { kind, object: group, frame, icon, serial };
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(.56, .008, 6, 48), new THREE.MeshBasicMaterial({ color: blue, transparent: true, opacity: .5 }));
  halo.position.set(0, 1.7, 1.2); scene.add(halo);
  const pulse = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.72, 64), new THREE.MeshBasicMaterial({ color: blue, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  pulse.position.set(0, 1.7, 0); scene.add(pulse);
  const armUp = new THREE.Vector3(0, 1, 0);
  const basePhone = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const targetPhone = new THREE.Quaternion();
  const poseEuler = new THREE.Euler(0, 0, 0, 'ZXY');
  const end = new THREE.Vector3(); const start = new THREE.Vector3(); const delta = new THREE.Vector3();
  phone.quaternion.copy(basePhone);

  function update(dt, run, pose, collecting, ambientTime) {
    const advancing = run.phase === 'running';
    const distance = run.distance;
    const stride = advancing ? Math.sin(distance * 1.4) : Math.sin(ambientTime * 1.4) * .2;
    camera.position.y = 1.8 + stride * .025;
    camera.rotation.z = advancing ? Math.cos(distance * .7) * .006 : 0;
    for (let i = 0; i < segments.length; i++) segments[i].position.z = 11 - ((i * 7 + 140 - distance % 140) % 140);
    const beta = (pose?.beta ?? 105) * Math.PI / 180;
    const gamma = (pose?.gamma ?? 0) * Math.PI / 180;
    const alpha = (pose?.alpha ?? 0) * Math.PI / 180;
    targetPhone.copy(basePhone).multiply(new THREE.Quaternion().setFromEuler(poseEuler.set(beta, gamma, alpha, 'ZXY')));
    phone.quaternion.slerp(targetPhone, 1 - Math.exp(-dt * 22));
    phone.position.y = -.37 + stride * .012;
    screenMat.color.set(collecting ? 0xb1f1ff : 0x698594);
    phone.updateMatrix();
    for (const hand of hands) {
      end.set(hand.side * .15, -.095, .005).applyQuaternion(phone.quaternion).add(phone.position);
      hand.palm.position.copy(end); hand.palm.quaternion.copy(phone.quaternion);
      hand.thumb.position.set(hand.side * .117, -.04, .044).applyQuaternion(phone.quaternion).add(phone.position); hand.thumb.quaternion.copy(phone.quaternion);
      start.set(hand.side * .40, -.84, -.12);
      delta.subVectors(end, start); hand.arm.position.copy(start).addScaledVector(delta, .5);
      hand.arm.scale.y = delta.length(); hand.arm.quaternion.setFromUnitVectors(armUp, delta.normalize());
    }
    halo.visible = collecting || run.shield > 0;
    halo.material.color.set(run.shield > 0 ? 0xc6ff95 : blue);
    halo.rotation.z = ambientTime * .22;
    halo.scale.setScalar(1 + Math.sin(ambientTime * 4) * .03);
    pulse.material.opacity = run.pulse > 0 ? run.pulse : 0;
    pulse.scale.setScalar(1 + (1 - run.pulse / .65) * 7);
    pulse.position.z = 1 - (1 - run.pulse / .65) * 27;
    renderer.render(scene, camera);
  }
  return { scene, camera, renderer, createPickup, update,
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); },
    removePickup(item) { scene.remove(item.object); } };
}
