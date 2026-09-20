import * as THREE from 'three';
import { BLOCKS, BlockId } from '../core/blocks';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT, World } from '../core/world';

// 六个面：方向 + 4 个角（逆时针）+ AO 采样
interface FaceDef {
  dir: [number, number, number];
  corners: [number, number, number][];
  normal: [number, number, number];
}

const FACES: FaceDef[] = [
  { dir: [1, 0, 0], normal: [1, 0, 0], corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
  { dir: [-1, 0, 0], normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]] },
  { dir: [0, 1, 0], normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], normal: [0, 0, 1], corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { dir: [0, 0, -1], normal: [0, 0, -1], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
];

function shouldDrawFace(world: World, id: number, nx: number, ny: number, nz: number): boolean {
  const def = BLOCKS[id];
  if (!def) return false;
  const neighbor = BLOCKS[nx];
  if (!neighbor) return true;
  if (neighbor.id === BlockId.Air) return true;
  if (neighbor.transparent && neighbor.id !== id) return true;
  if (neighbor.liquid && !def.liquid) return true;
  return false;
}

export interface ChunkMesh {
  opaque: THREE.Mesh;
  transparent: THREE.Mesh;
}

export function buildChunkMesh(world: World, chunk: Chunk, material: THREE.Material, transMaterial: THREE.Material): ChunkMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const tPos: number[] = [];
  const tNorm: number[] = [];
  const tCol: number[] = [];
  const tIdx: number[] = [];

  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;
  const tmpColor = new THREE.Color();

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.get(lx, y, lz);
        if (id === BlockId.Air) continue;
        const def = BLOCKS[id];
        const wx = baseX + lx, wz = baseZ + lz;
        const target = def.transparent ? { p: tPos, n: tNorm, c: tCol, i: tIdx } : { p: positions, n: normals, c: colors, i: indices };
        for (const face of FACES) {
          const nxId = world.getBlock(wx + face.dir[0], y + face.dir[1], wz + face.dir[2]);
          if (!shouldDrawFace(world, id, nxId, 0, 0)) continue;
          const start = target.p.length / 3;
          // 顶面/底面明暗差异
          let shade = 1;
          if (face.normal[1] === 1) shade = 1.0;
          else if (face.normal[1] === -1) shade = 0.55;
          else if (face.dir[0] !== 0) shade = 0.75;
          else shade = 0.85;
          if (def.liquid) shade *= 0.9;
          for (const corner of face.corners) {
            target.p.push(lx + corner[0], y + corner[1] - (def.liquid ? 0.12 : 0), lz + corner[2]);
            target.n.push(...face.normal);
            tmpColor.setHex(def.color);
            target.c.push(tmpColor.r * shade, tmpColor.g * shade, tmpColor.b * shade);
          }
          target.i.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const opaque = new THREE.Mesh(geo, material);
  opaque.position.set(baseX, 0, baseZ);
  opaque.matrixAutoUpdate = false;
  opaque.updateMatrix();

  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
  tGeo.setAttribute('normal', new THREE.Float32BufferAttribute(tNorm, 3));
  tGeo.setAttribute('color', new THREE.Float32BufferAttribute(tCol, 3));
  tGeo.setIndex(tIdx);
  const transparent = new THREE.Mesh(tGeo, transMaterial);
  transparent.position.set(baseX, 0, baseZ);
  transparent.matrixAutoUpdate = false;
  transparent.updateMatrix();

  return { opaque, transparent };
}

export function disposeChunkMesh(mesh: ChunkMesh): void {
  mesh.opaque.geometry.dispose();
  mesh.transparent.geometry.dispose();
}
