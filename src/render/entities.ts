import * as THREE from 'three';
import { Enemy, ENEMY_DEFS } from '../core/enemies';
import { getItem } from '../core/items';
import { DroppedItemEntity } from '../core/world';

export class EntityRenderer {
  group = new THREE.Group();
  enemyMeshes = new Map<number, THREE.Group>();
  itemMeshes = new Map<string, THREE.Mesh>();

  constructor(private scene: THREE.Scene) {
    scene.add(this.group);
  }

  private makeEnemyMesh(kind: Enemy['kind']): THREE.Group {
    const def = ENEMY_DEFS[kind];
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: def.color });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.8), bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: def.color + 0x101010 }));
    head.position.y = 1.35;
    head.castShadow = true;
    g.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: kind === 'ruinsentinel' ? 0xff4040 : 0xff8030 });
    for (const sx of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.05), eyeMat);
      eye.position.set(sx, 1.38, 0.26);
      g.add(eye);
    }
    if (kind === 'cavemaw') {
      body.scale.set(1.3, 0.8, 1.3);
    }
    if (kind === 'ruinsentinel') {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.2), new THREE.MeshLambertMaterial({ color: 0x50606e }));
      plate.position.set(0, 0.6, -0.4);
      g.add(plate);
    }
    g.userData.body = body;
    g.userData.head = head;
    g.userData.mat = bodyMat;
    return g;
  }

  syncEnemies(enemies: Enemy[]): void {
    const aliveIds = new Set<number>();
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      aliveIds.add(e.id);
      let mesh = this.enemyMeshes.get(e.id);
      if (!mesh) {
        mesh = this.makeEnemyMesh(e.kind);
        this.enemyMeshes.set(e.id, mesh);
        this.group.add(mesh);
      }
      mesh.position.set(e.x, e.y, e.z);
      mesh.rotation.y = Math.atan2(e.vx, e.vz);
      const mat = mesh.userData.mat as THREE.MeshLambertMaterial;
      mat.emissive = new THREE.Color(e.hurtFlash > 0 ? 0xff0000 : 0x000000);
      const bob = Math.sin(performance.now() * 0.01 + e.id) * (e.state === 'chase' ? 0.08 : 0.03);
      mesh.userData.body.position.y = 0.55 + bob;
    }
    for (const [id, mesh] of this.enemyMeshes) {
      if (!aliveIds.has(id)) {
        this.group.remove(mesh);
        mesh.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
        this.enemyMeshes.delete(id);
      }
    }
  }

  syncItems(items: DroppedItemEntity[], now: number): void {
    const seen = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = i + ':' + it.id + ':' + it.born;
      seen.add(key);
      let mesh = this.itemMeshes.get(key);
      const def = getItem(it.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.3, 0.3),
          new THREE.MeshLambertMaterial({ color: def?.color ?? 0xffffff, emissive: def?.color ?? 0x000000, emissiveIntensity: 0.15 })
        );
        this.itemMeshes.set(key, mesh);
        this.group.add(mesh);
      }
      mesh.position.set(it.x, it.y + 0.4 + Math.sin((now + it.born) * 0.004) * 0.08, it.z);
      mesh.rotation.y = now * 0.002 + i;
    }
    for (const [key, mesh] of this.itemMeshes) {
      if (!seen.has(key)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.itemMeshes.delete(key);
      }
    }
  }

  clear(): void {
    for (const [, mesh] of this.enemyMeshes) this.group.remove(mesh);
    for (const [, mesh] of this.itemMeshes) this.group.remove(mesh);
    this.enemyMeshes.clear();
    this.itemMeshes.clear();
  }
}

export interface ProjectileView {
  x: number; y: number; z: number;
  born: number;
}

export class ProjectileRenderer {
  meshes = new Map<number, THREE.Mesh>();
  constructor(private scene: THREE.Scene) {}
  sync(projectiles: { x: number; y: number; z: number; id: number }[]): void {
    const alive = new Set<number>();
    for (const p of projectiles) {
      alive.add(p.id);
      let m = this.meshes.get(p.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), new THREE.MeshLambertMaterial({ color: 0x60e0c0, emissive: 0x208060 }));
        this.meshes.set(p.id, m);
        this.scene.add(m);
      }
      m.position.set(p.x, p.y, p.z);
    }
    for (const [id, m] of this.meshes) {
      if (!alive.has(id)) { this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); this.meshes.delete(id); }
    }
  }
}
