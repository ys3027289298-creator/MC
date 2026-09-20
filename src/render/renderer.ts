// Three.js scene: chunk meshes, lighting, water, mobs, drops, weather FX.

import * as THREE from 'three';
import { World } from '../game/world';
import { ENEMY_DEFS, Enemy } from '../game/enemies';
import { buildChunkGeometry, buildWaterGeometry } from './mesher';
import { Projectile } from '../game/actions';
import { daylightFactor, EnvironmentState, WEATHER_INFO } from '../game/survival';

interface ChunkMeshes {
  opaque?: THREE.Mesh;
  transparent?: THREE.Mesh;
  water?: THREE.Mesh;
  lights: THREE.PointLight[];
}

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  private chunkMeshes = new Map<string, ChunkMeshes>();
  private opaqueMat: THREE.MeshLambertMaterial;
  private transMat: THREE.MeshLambertMaterial;
  private waterMat: THREE.MeshLambertMaterial;
  private enemyMeshes = new Map<number, THREE.Group>();
  private dropMeshes = new Map<number, THREE.Mesh>();
  private projectileMeshes = new Map<Projectile, THREE.Mesh>();
  highlight: THREE.LineSegments;
  private weather: THREE.Points;
  private weatherData: Float32Array;
  private flash: THREE.PointLight;
  flashTimer = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
    this.opaqueMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.transMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x2f5f8a, transparent: true, opacity: 0.5 });

    this.ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a3f2c, 0.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 120;
    const s = 50;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.flash = new THREE.PointLight(0xbfe0ff, 0, 300);
    this.scene.add(this.flash);

    this.weatherData = new Float32Array(900 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.weatherData, 3));
    this.weather = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xddddff, size: 0.18, transparent: true, opacity: 0.7 })
    );
    this.weather.visible = false;
    this.scene.add(this.weather);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private disposeMeshes(key: string) {
    const m = this.chunkMeshes.get(key);
    if (!m) return;
    for (const mesh of [m.opaque, m.transparent, m.water]) {
      if (mesh) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    for (const l of m.lights) this.scene.remove(l);
    this.chunkMeshes.delete(key);
  }

  syncChunks(world: World) {
    const present = new Set<string>();
    for (const [key, chunk] of world.chunks) {
      present.add(key);
      let entry = this.chunkMeshes.get(key);
      if (!entry) {
        entry = { lights: [] };
        this.chunkMeshes.set(key, entry);
      }
      if (chunk.dirty) {
        const data = buildChunkGeometry(world, chunk);
        for (const mesh of [entry.opaque, entry.transparent, entry.water]) if (mesh) this.scene.remove(mesh);
        entry.opaque = undefined;
        entry.transparent = undefined;
        entry.water = undefined;
        for (const l of entry.lights) this.scene.remove(l);
        entry.lights = [];
        if (data.opaque) {
          entry.opaque = new THREE.Mesh(data.opaque, this.opaqueMat);
          entry.opaque.castShadow = true;
          entry.opaque.receiveShadow = true;
          this.scene.add(entry.opaque);
        }
        if (data.transparent) {
          entry.transparent = new THREE.Mesh(data.transparent, this.transMat);
          this.scene.add(entry.transparent);
        }
        const water = buildWaterGeometry(world, chunk);
        if (water) {
          entry.water = new THREE.Mesh(water, this.waterMat);
          this.scene.add(entry.water);
        }
        let lightsAdded = 0;
        for (const em of data.emissives) {
          if (lightsAdded >= 3) break;
          const light = new THREE.PointLight(em.color, 1.1, 12, 1.6);
          light.position.set(em.x, em.y, em.z);
          this.scene.add(light);
          entry.lights.push(light);
          lightsAdded++;
        }
        chunk.dirty = false;
      }
    }
    for (const key of [...this.chunkMeshes.keys()]) {
      if (!present.has(key)) this.disposeMeshes(key);
    }
  }

  showHighlight(x: number, y: number, z: number, valid: boolean) {
    this.highlight.visible = true;
    this.highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
    (this.highlight.material as THREE.LineBasicMaterial).color.setHex(valid ? 0x7cfc00 : 0xff3333);
  }

  hideHighlight() {
    this.highlight.visible = false;
  }

  syncEnemies(enemies: Enemy[]) {
    const alive = new Set<number>();
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      alive.add(e.uid);
      let group = this.enemyMeshes.get(e.uid);
      if (!group) {
        group = this.buildEnemyMesh(e);
        this.enemyMeshes.set(e.uid, group);
        this.scene.add(group);
      }
      group.position.set(e.x, e.y, e.z);
      group.rotation.y = Math.atan2(e.vx, e.vz);
      const body = group.children[0] as THREE.Mesh;
      (body.material as THREE.MeshLambertMaterial).emissive.setHex(e.hitFlash > 0 ? 0xff6655 : 0x000000);
    }
    for (const [uid, g] of [...this.enemyMeshes]) {
      if (!alive.has(uid)) {
        this.scene.remove(g);
        this.enemyMeshes.delete(uid);
      }
    }
  }

  private buildEnemyMesh(e: Enemy): THREE.Group {
    const def = ENEMY_DEFS[e.kind];
    const group = new THREE.Group();
    const geo =
      e.kind === 'scorpion'
        ? new THREE.BoxGeometry(1.0, 0.6, 1.2)
        : e.kind === 'wraith'
          ? new THREE.ConeGeometry(0.4, 1.4, 6)
          : new THREE.BoxGeometry(0.7, 0.9, 1.0);
    const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: def.color }));
    body.position.y = e.kind === 'wraith' ? 0.9 : 0.5;
    body.castShadow = true;
    group.add(body);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5544 });
    for (const ex of [-0.15, 0.15]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
      eye.position.set(ex, 0.78, 0.48);
      group.add(eye);
    }
    return group;
  }

  syncDrops(drops: World['drops']) {
    const seen = new Set<number>();
    drops.forEach((d, i) => {
      seen.add(i);
      let mesh = this.dropMeshes.get(i);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.28, 0.28),
          new THREE.MeshLambertMaterial({ color: 0xffe28a, emissive: 0x554400 })
        );
        this.scene.add(mesh);
        this.dropMeshes.set(i, mesh);
      }
      mesh.position.set(d.x, d.y + 0.2 + Math.sin(performance.now() / 300 + i) * 0.05, d.z);
      mesh.rotation.y += 0.03;
    });
    for (const [i, m] of [...this.dropMeshes]) {
      if (!seen.has(i)) {
        this.scene.remove(m);
        m.geometry.dispose();
        this.dropMeshes.delete(i);
      }
    }
  }

  syncProjectiles(projectiles: Projectile[]) {
    const live = new Set(projectiles);
    for (const p of projectiles) {
      let mesh = this.projectileMeshes.get(p);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.06, 0.35, 5),
          new THREE.MeshBasicMaterial({ color: 0x8aa05a })
        );
        this.scene.add(mesh);
        this.projectileMeshes.set(p, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
      mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
      mesh.rotateX(Math.PI / 2);
    }
    for (const [p, m] of [...this.projectileMeshes]) {
      if (!live.has(p)) {
        this.scene.remove(m);
        this.projectileMeshes.delete(p);
      }
    }
  }

  updateSky(env: EnvironmentState, px: number, py: number, pz: number, dt: number) {
    const f = daylightFactor(env);
    const info = WEATHER_INFO[env.weather];
    const sky = new THREE.Color(0x2a3550).lerp(new THREE.Color(0x9fc8e8), f);
    if (env.weather === 'sandstorm') sky.lerp(new THREE.Color(0xc8a86a), 0.55);
    if (env.weather === 'frost') sky.lerp(new THREE.Color(0xcfe6f2), 0.35);
    if (env.weather === 'storm') sky.lerp(new THREE.Color(0x20262e), 0.5);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 18 * info.vision, 90 * info.vision);
    this.sun.intensity = 0.15 + f * 1.0 * info.vision;
    this.sun.color.setHex(f > 0.5 ? 0xfff2d0 : 0x8aa0d0);
    this.ambient.intensity = 0.18 + f * 0.25;
    this.hemi.intensity = 0.2 + f * 0.3;
    const t = env.time / 240;
    const ang = t * Math.PI * 2 - Math.PI / 2;
    this.sun.position.set(px + Math.cos(ang) * 60, py + Math.max(8, Math.sin(ang) * 70), pz + 30);
    this.sun.target.position.set(px, py, pz);
    if (env.weather === 'storm') {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flashTimer = 4 + Math.random() * 8;
        this.flash.position.set(px + (Math.random() - 0.5) * 60, py + 30, pz + (Math.random() - 0.5) * 60);
        this.flash.intensity = 6;
        setTimeout(() => (this.flash.intensity = 0), 120);
      }
    }
    this.updateWeatherParticles(env, px, py, pz);
  }

  private updateWeatherParticles(env: EnvironmentState, px: number, py: number, pz: number) {
    const active = env.weather !== 'clear';
    this.weather.visible = active;
    if (!active) return;
    const mat = this.weather.material as THREE.PointsMaterial;
    mat.color.setHex(
      env.weather === 'sandstorm'
        ? 0xd8c088
        : env.weather === 'frost'
          ? 0xdff2ff
          : 0xaac8e8
    );
    mat.size = env.weather === 'sandstorm' ? 0.22 : 0.14;
    const pos = this.weather.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.weatherData.length / 3; i++) {
      let x = this.weatherData[i * 3];
      let y = this.weatherData[i * 3 + 1];
      let z = this.weatherData[i * 3 + 2];
      if (x === 0 && y === 0 && z === 0) {
 x = px + (Math.random() - 0.5) * 40;
        y = py + Math.random() * 25;
        z = pz + (Math.random() - 0.5) * 40;
      }
      y -= env.weather === 'frost' ? 0.04 : 0.35;
      if (env.weather === 'sandstorm') x += 0.3;
      if (y < py - 2) {
        x = px + (Math.random() - 0.5) * 40;
        y = py + 20 + Math.random() * 6;
        z = pz + (Math.random() - 0.5) * 40;
      }
      this.weatherData[i * 3] = x;
      this.weatherData[i * 3 + 1] = y;
      this.weatherData[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
  }

  damageVignette(amount: number) {
    void amount;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
