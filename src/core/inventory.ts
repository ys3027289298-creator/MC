import { getItem, ItemDef } from './items';

export interface ItemStack {
  id: string;
  count: number;
  durability?: number;
}

export interface InventorySave {
  slots: (ItemStack | null)[];
  hotbar: number[];
  size: number;
  hotbarSize: number;
}

export class Inventory {
  slots: (ItemStack | null)[];
  hotbar: number[];
  readonly size: number;
  readonly hotbarSize = 8;

  constructor(size = 24) {
    this.size = size;
    this.slots = new Array(size).fill(null);
    this.hotbar = [0, 1, 2, 3, 4, 5, 6, 7];
  }

  defOf(stack: ItemStack): ItemDef {
    return getItem(stack.id)!;
  }

  countOf(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  usedSlots(): number {
    return this.slots.filter((s) => s !== null).length;
  }

  add(id: string, count = 1, durability?: number): number {
    const def = getItem(id);
    if (!def) return count;
    let remaining = count;
    if (def.maxStack > 1) {
      for (let i = 0; i < this.size && remaining > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.count < def.maxStack) {
          const move = Math.min(remaining, def.maxStack - s.count);
          s.count += move;
          remaining -= move;
        }
      }
    }
    while (remaining > 0) {
      const idx = this.slots.findIndex((s) => s === null);
      if (idx < 0) break;
      const move = Math.min(remaining, def.maxStack);
      this.slots[idx] = { id, count: move, durability: durability ?? def.durability };
      remaining -= move;
    }
    return remaining;
  }

  remove(id: string, count = 1): boolean {
    if (this.countOf(id) < count) return false;
    let remaining = count;
    for (let i = 0; i < this.size && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(remaining, s.count);
        s.count -= take;
        remaining -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  removeSlot(index: number, count = 1): ItemStack | null {
    const s = this.slots[index];
    if (!s) return null;
    const take = Math.min(count, s.count);
    const out: ItemStack = { id: s.id, count: take, durability: s.durability };
    s.count -= take;
    if (s.count <= 0) this.slots[index] = null;
    return out;
  }

  split(index: number): number {
    const s = this.slots[index];
    if (!s || s.count < 2) return -1;
    const empty = this.slots.findIndex((x) => x === null);
    if (empty < 0) return -1;
    const half = Math.floor(s.count / 2);
    s.count -= half;
    this.slots[empty] = { id: s.id, count: half, durability: s.durability };
    return empty;
  }

  hasMaterials(cost: Record<string, number>): boolean {
    return Object.entries(cost).every(([id, n]) => this.countOf(id) >= n);
  }
  pay(cost: Record<string, number>): boolean {
    if (!this.hasMaterials(cost)) return false;
    for (const [id, n] of Object.entries(cost)) this.remove(id, n);
    return true;
  }

  wear(index: number, amount = 1): boolean {
    const s = this.slots[index];
    if (!s || s.durability === undefined) return true;
    s.durability -= amount;
    if (s.durability <= 0) {
      this.slots[index] = null;
      return false;
    }
    return true;
  }

  wearItem(id: string, amount = 1): boolean {
    const idx = this.slots.findIndex((s) => s && s.id === id && s.durability !== undefined);
    if (idx < 0) return false;
    return this.wear(idx, amount);
  }

  repair(index: number, amount: number): void {
    const s = this.slots[index];
    const def = s ? getItem(s.id) : undefined;
    if (s && def?.durability) s.durability = Math.min(def.durability, (s.durability ?? 0) + amount);
  }

  hotbarSlot(pos: number): ItemStack | null {
    return this.slots[this.hotbar[pos]] ?? null;
  }
  hotbarIndex(pos: number): number {
    return this.hotbar[pos];
  }
  findItem(id: string): number {
    return this.slots.findIndex((s) => s && s.id === id);
  }
  findTool(type: string, minTier = 1): number {
    return this.slots.findIndex((s) => {
      if (!s) return false;
      const d = getItem(s.id);
      return d?.toolType === type && (d.tier ?? 1) >= minTier;
    });
  }

  dropAll(index: number): ItemStack | null {
    const s = this.slots[index];
    this.slots[index] = null;
    return s;
  }

  serialize(): InventorySave {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), hotbar: [...this.hotbar], size: this.size, hotbarSize: this.hotbarSize };
  }
  static load(data: InventorySave): Inventory {
    const inv = new Inventory(data.size ?? 24);
    inv.slots = data.slots.map((s) => (s ? { ...s } : null));
    while (inv.slots.length < inv.size) inv.slots.push(null);
    inv.hotbar = data.hotbar ?? [0, 1, 2, 3, 4, 5, 6, 7];
    return inv;
  }
}
