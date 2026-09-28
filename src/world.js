import * as THREE from 'three';

const sand = new THREE.MeshStandardMaterial({ color: 0xd7b884, roughness: 1 });
const bark = new THREE.MeshStandardMaterial({ color: 0x594b38, roughness: 1 });
const leaf = new THREE.MeshStandardMaterial({ color: 0x214f4b, roughness: .9, side: THREE.DoubleSide });
const rock = new THREE.MeshStandardMaterial({ color: 0x65736e, roughness: 1 });

function mesh(geometry, material, parent, position, rotation, scale) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  if (scale) object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function terrain(scene) {
  const geometry = new THREE.PlaneGeometry(220, 165, 78, 58);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i) + 60;
    const dune = Math.max(0, (z - 22) / 38);
    positions.setY(i, Math.sin(x * .23) * .12 + Math.cos(z * .2 + x * .08) * .11 + Math.sin(x * .84 + z * .7) * .025 + dune * dune * 1.25);
  }
  geometry.computeVertexNormals();
  const beach = mesh(geometry, sand, scene, [0, -.14, 60]);
  beach.receiveShadow = true;
  const ocean = mesh(new THREE.PlaneGeometry(500, 300), new THREE.MeshPhysicalMaterial({ color: 0x137683, roughness: .28, metalness: .18, transparent: true, opacity: .92, side: THREE.DoubleSide }), scene, [0, -.25, -105], [-Math.PI / 2, 0, 0]);
  ocean.receiveShadow = false;
  const shallows = mesh(new THREE.PlaneGeometry(220, 11), new THREE.MeshBasicMaterial({ color: 0x49b5b2, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false }), scene, [0, -.22, -23], [-Math.PI / 2, 0, 0]);
  shallows.receiveShadow = false;
  for (let i = 0; i < 11; i++) {
    const band = mesh(new THREE.PlaneGeometry(110 + i * 12, .09 + i * .014), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xe1fbdf : 0x9ce7d9, transparent: true, opacity: .2 + (i % 3) * .06, depthWrite: false, side: THREE.DoubleSide }), scene, [0, -.19 + i * .001, -20.1 - i * 2.7], [-Math.PI / 2, 0, 0]);
    band.userData.wave = i;
  }
}

function sky(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDirection; void main(){vDirection=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vDirection; void main(){float h=vDirection.y;vec3 low=vec3(.98,.59,.40);vec3 mid=vec3(.55,.72,.74);vec3 high=vec3(.16,.36,.48);vec3 c=mix(low,mid,smoothstep(-.14,.26,h));c=mix(c,high,smoothstep(.20,.92,h));gl_FragColor=vec4(c,1.);}`
  });
  const skyDome = mesh(new THREE.SphereGeometry(400, 32, 16), material, scene);
  skyDome.castShadow = false;
  skyDome.receiveShadow = false;
  const sun = mesh(new THREE.SphereGeometry(11, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffd092, fog: false }), scene, [-85, 21, -220]);
  sun.castShadow = false;
  const glow = mesh(new THREE.SphereGeometry(17, 24, 12), new THREE.MeshBasicMaterial({ color: 0xffbb8a, transparent: true, opacity: .12, depthWrite: false, fog: false }), scene, [-85, 21, -220]);
  glow.castShadow = false;
}

function makePalm(scene, x, z, size = 1, bend = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(size);
  scene.add(group);
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(.25 * bend, 1.7, -.15),
    new THREE.Vector3(.55 * bend, 3.8, -.45),
    new THREE.Vector3(.8 * bend, 6.1, -.65)
  ]);
  mesh(new THREE.TubeGeometry(trunkCurve, 12, .23, 7, false), bark, group);
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const length = 3.5 + (i % 3) * .32;
    const vertices = [];
    const indices = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      const radius = length * t;
      const height = 6.16 + Math.sin(t * Math.PI) * .55 - t * t * 2.1;
      const width = Math.sin(t * Math.PI) * .42;
      const cx = .8 * bend + Math.cos(angle) * radius;
      const cz = -.65 + Math.sin(angle) * radius;
      vertices.push(cx + Math.cos(angle + Math.PI / 2) * width, height, cz + Math.sin(angle + Math.PI / 2) * width);
      vertices.push(cx - Math.cos(angle + Math.PI / 2) * width, height, cz - Math.sin(angle + Math.PI / 2) * width);
      if (j < 8) indices.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(geometry, leaf, group);
  }
  for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(.19, 8, 6), new THREE.MeshStandardMaterial({ color: 0x745c35 }), group, [.72 + Math.cos(i * 2) * .25, 5.91 - (i % 2) * .2, -.65 + Math.sin(i * 2) * .25]);
  return group;
}

function props(scene) {
  const palms = [[-19,-3,1.2,1],[-13,-10,.86,-1],[17,-5,1.18,-1],[24,1,.85,1],[-23,20,.95,-1],[25,21,1.1,1],[-31,-17,.82,1],[36,-12,.94,-1]];
  for (const values of palms) makePalm(scene, ...values);
  const rockGeometry = new THREE.DodecahedronGeometry(1, 1);
  const clusters = [[-11,-7],[-16,12],[13,-15],[19,10],[-23,-19],[28,-6],[9,24],[-12,28]];
  for (const [x,z] of clusters) {
    for (let j=0;j<4;j++) {
      const scale=.3+((j*7+x*x+z*z)%10)/15;
      mesh(rockGeometry, rock, scene, [x + Math.sin(j*2.6)*1.1,scale*.23,z + Math.cos(j*2.3)*.7], [j*.3,j*1.2,0], [scale,scale*.55,scale*.8]);
    }
  }
  for (let i=0;i<65;i++) {
    const a=i*2.39996;
    const r=7+(i%17)*1.23;
    const x=Math.cos(a)*r;
    const z=Math.sin(a)*r+2;
    if (z<-19 || Math.abs(x)<3 && z<10) continue;
    mesh(new THREE.ConeGeometry(.17,.48,4), new THREE.MeshStandardMaterial({ color: i%3===0?0x4e796b:0x8b9870, roughness:1 }), scene, [x,.12,z], [0,a,0], [1,.8+(i%4)*.2,1]);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(9.4,9.47,96), new THREE.MeshBasicMaterial({ color:0xf4d5a1,transparent:true,opacity:.24,side:THREE.DoubleSide }));
  ring.rotation.x=-Math.PI/2;
  ring.position.y=.025;
  scene.add(ring);
}

export function makeWorld() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x8caeb0, .0075);
  sky(scene);
  terrain(scene);
  props(scene);
  scene.add(new THREE.HemisphereLight(0xa7e7ec, 0x8c573d, 2.15));
  const sunlight = new THREE.DirectionalLight(0xffc197, 2.7);
  sunlight.position.set(-35, 65, -45);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024,1024);
  sunlight.shadow.camera.left=-38; sunlight.shadow.camera.right=38;
  sunlight.shadow.camera.top=38; sunlight.shadow.camera.bottom=-38;
  sunlight.shadow.normalBias=.04;
  scene.add(sunlight);
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .04, 500);
  camera.position.set(0,1.7,10);
  const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return { scene,camera,renderer };
}

function segment(parent, material, a, b, radius) {
  const direction=new THREE.Vector3().subVectors(b,a);
  const body=mesh(new THREE.CylinderGeometry(radius*.72,radius,direction.length(),7),material,parent);
  body.position.copy(a).add(b).multiplyScalar(.5);
  body.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  return body;
}

export function makeCreature(type = 0) {
  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);
  const colors=[0xb94d4c,0x225b61,0x755360,0x826342];
  const shell=new THREE.MeshStandardMaterial({color:colors[type%colors.length],metalness:.32,roughness:.45});
  const under=new THREE.MeshStandardMaterial({color:0x1b292c,roughness:.7});
  const eye=new THREE.MeshStandardMaterial({color:0xffdf8c,emissive:0xffb34d,emissiveIntensity:1.3});
  const accent=new THREE.MeshStandardMaterial({color:0x6ce0d6,emissive:0x28b5b5,emissiveIntensity:.65});
  mesh(new THREE.SphereGeometry(.95,16,10),under,model,[0,.63,0],null,[1,.42,.75]);
  mesh(new THREE.SphereGeometry(.9,18,12),shell,model,[0,.86,0],null,[1,.48,.79]);
  mesh(new THREE.TorusGeometry(.64,.035,5,22,Math.PI*1.45),accent,model,[0,1.1,.1],[Math.PI/2,0,.52]);
  for(let side of [-1,1]){
    for(let i=0;i<3;i++){
      const start=new THREE.Vector3(side*(.55+i*.05),.62,-.42+i*.4);
      const knee=new THREE.Vector3(side*(1.08+i*.13),.4,-.5+i*.55);
      const foot=new THREE.Vector3(side*(1.37+i*.16),.07,-.52+i*.68);
      segment(model,under,start,knee,.09);
      segment(model,shell,knee,foot,.065);
    }
    segment(model,under,new THREE.Vector3(side*.69,.68,.35),new THREE.Vector3(side*1.18,.67,.62),.16);
    const claw=mesh(new THREE.SphereGeometry(.33,10,8),shell,model,[side*1.35,.63,.77],null,[1,.8,.95]);
    claw.rotation.y=side*.4;
    segment(model,shell,new THREE.Vector3(side*1.4,.61,.98),new THREE.Vector3(side*1.65,.54,1.2),.1);
    segment(model,shell,new THREE.Vector3(side*1.27,.61,1.01),new THREE.Vector3(side*1.39,.54,1.27),.07);
    segment(model,under,new THREE.Vector3(side*.43,1.03,.55),new THREE.Vector3(side*.46,1.43,.54),.07);
    mesh(new THREE.SphereGeometry(.13,10,8),eye,model,[side*.46,1.46,.56]);
  }
  root.userData={model,type,health:type===3?3:1,speed:type===3?.72:1,hitAt:0};
  const size=type===3?1.7:type===1?1.13:.93;
  root.scale.setScalar(size);
  return root;
}

export function makeSaber(camera) {
  const group=new THREE.Group();
  camera.add(group);
  const grip=new THREE.MeshStandardMaterial({color:0x243136,metalness:.85,roughness:.25});
  const metal=new THREE.MeshStandardMaterial({color:0xb5c9c7,metalness:.9,roughness:.18});
  mesh(new THREE.CylinderGeometry(.07,.08,.5,12),grip,group,[0,-.47,0]);
  for(let i=0;i<5;i++)mesh(new THREE.TorusGeometry(.079,.013,5,12),metal,group,[0,-.66+i*.09,0],[Math.PI/2,0,0]);
  mesh(new THREE.CylinderGeometry(.12,.09,.13,12),metal,group,[0,-.16,0]);
  mesh(new THREE.CylinderGeometry(.10,.10,.065,12),grip,group,[0,-.08,0]);
  const glowMaterial=new THREE.MeshBasicMaterial({color:0x2bc6f8,transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false});
  const midMaterial=new THREE.MeshBasicMaterial({color:0x4bdcff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false});
  mesh(new THREE.CylinderGeometry(.055,.07,2.05,12),glowMaterial,group,[0,1,0]);
  mesh(new THREE.CylinderGeometry(.026,.034,2.05,12),midMaterial,group,[0,1,0]);
  mesh(new THREE.CylinderGeometry(.013,.018,2.04,12),new THREE.MeshBasicMaterial({color:0xe8ffff}),group,[0,1,0]);
  mesh(new THREE.SphereGeometry(.055,12,8),new THREE.MeshBasicMaterial({color:0x83f4ff}),group,[0,2.02,0]);
  const light=new THREE.PointLight(0x41d9ff,2.8,5);
  light.position.set(0,1,0);
  group.add(light);
  return group;
}
