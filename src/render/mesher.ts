// Builds one BufferGeometry per chunk with face culling and vertex colors.

import * as THREE from 'three';
import { B, blockDef } from '../game/blocks';
import { Chunk, CHUNK_SIZE, WORLD_HEIGHT, World } from '../game/world';

const FACES = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
];

export interface ChunkMeshData {
  opaque: THREE.BufferGeometry | null;
  transparent: THREE.BufferGeometry | null;
  emissives: { x: number; y: number; z: number; color: number }[];
}

function faceVisible(world: World, x: number, y: number, z: number, selfTransparent: boolean): boolean {
  const id = world.getBlock(x, y, z);
  if (id === B.Air) return true;
  const def = blockDef(id);
  if (def.transparent && selfTransparent && id === B.GlassPane) return false;
  return !!def.transparent;
}

export function buildChunkGeometry(world: World, chunk: Chunk): ChunkMeshData {
  const opaque = { pos: [] as number[], norm: [] as number[], col: [] as number[], idx: [] as number[] };
  const trans = { pos: [] as number[], norm: [] as number[], col: [] as number[], idx: [] as number[] };
  const emissives: ChunkMeshData['emissives'] = [];
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.get(lx, y, lz);
        if (id === B.Air) continue;
        const def = blockDef(id);
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const target = def.transparent ? trans : opaque;
        if (def.emissive) emissives.push({ x: wx + 0.5, y: y + 0.5, z: wz + 0.5, color: def.emissive });
        const shade = new THREE.Color(def.color);
        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          if (!faceVisible(world, wx + dx, y + dy, wz + dz, !!def.transparent)) continue;
          const start = target.pos.length / 3;
          let faceShade = 1;
          if (dy === -1) faceShade = 0.55;
          else if (dy === 1) faceShade = 1;
          else if (dx !== 0) faceShade = 0.8;
          else faceShade = 0.7;
          // door open: skip two opposing faces handled simply by skipping whole block when open
          if (id === B.HatchDoor && world.doorOpen.has(`${wx},${y},${wz}`)) continue;
          for (const c of face.corners) {
            target.pos.push(wx + c[0], y + c[1], wz + c[2]);
            target.norm.push(dx, dy, dz);
            target.col.push(
              (shade.r * faceShade),
              (shade.g * faceShade),
              (shade.b * faceShade)
            );
          }
          target.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  }

  const toGeom = (b: typeof opaque): THREE.BufferGeometry | null => {
    if (b.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    return g;
  };
  return { opaque: toGeom(opaque), transparent: toGeom(trans), emissives };
}

// Simple water surface as a separate grid per chunk.
export function buildWaterGeometry(world: World, chunk: Chunk): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const indices: number[] = [];
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = baseX + lx;
      const z = baseZ + lz;
      if (world.isWaterAt(x, 26, z)) {
        const y = 26.9;
        const start = positions.length / 3;
        positions.push(x, y, z, x + 1, y, z, x + 1, y, z + 1, x, y, z + 1);
        indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
    }
  }
  if (indices.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
