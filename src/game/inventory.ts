// Stack-based inventory with hotbar, equipment, split/drop support.

import { itemDef, ItemDef } from './items';

export interface ItemStack {
  id: string;
  count: number;
  durability?: number; // current durability for tools
}

export const HOTBAR_SIZE = 8;

export class Inventory {
  slots: (ItemStack | null)[];
  hotbarIndex = 0;
  armor: ItemStack | null = null;

  constructor(public readonly size = 24) {
    this.slots = new Array(size).fill(null);
  }

  def(stack: ItemStack): ItemDef {
    return itemDef(stack.id);
  }

  countItem(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  has(id: string, count = 1): boolean {
    return this.countItem(id) >= count;
  }

  canAdd(id: string, count = 1): boolean {
    const d = itemDef(id);
    let remaining = count;
    if (d.maxStack > 1) {
      for (const s of this.slots) {
        if (s && s.id === id) remaining -= d.maxStack - s.count;
        if (remaining <= 0) return true;
      }
    }
    for (const s of this.slots) {
      if (!s) {
        remaining -= d.maxStack;
        if (remaining <= 0) return true;
      }
    }
    return remaining <= 0;
  }

  add(id: string, count = 1, durability?: number): number {
    const d = itemDef(id);
    let remaining = count;
    if (d.kind === 'tool' || d.maxStack === 1) {
      for (let i = 0; i < this.size && remaining > 0; i++) {
        if (!this.slots[i]) {
          this.slots[i] = { id, count: 1, durability: durability ?? d.durability };
          remaining--;
        }
      }
      return remaining;
    }
    for (let i = 0; i < this.size && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < d.maxStack) {
        const take = Math.min(d.maxStack - s.count, remaining);
        s.count += take;
        remaining -= take;
      }
    }
    for (let i = 0; i < this.size && remaining > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(d.maxStack, remaining);
        this.slots[i] = { id, count: take };
        remaining -= take;
      }
    }
    return remaining;
  }

  remove(id: string, count = 1): number {
    let remaining = count;
    for (let i = 0; i < this.size && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, remaining);
        s.count -= take;
        remaining -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return remaining;
  }

  consume(inputs: { item: string; count: number }[]): boolean {
    for (const i of inputs) if (!this.has(i.item, i.count)) return false;
    for (const i of inputs) this.remove(i.item, i.count);
    return true;
  }

  // Move whole stack between slots; returns false if destination blocked.
  moveTo(from: number, to: number): boolean {
    if (from === to) return true;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return false;
    if (!b) {
      this.slots[to] = a;
      this.slots[from] = null;
      return true;
    }
    if (a.id === b.id && itemDef(a.id).maxStack > 1) {
      const space = itemDef(a.id).maxStack - b.count;
      const moved = Math.min(space, a.count);
      b.count += moved;
      a.count -= moved;
      if (a.count <= 0) this.slots[from] = null;
      return moved > 0;
    }
    this.slots[from] = b;
    this.slots[to] = a;
    return true;
  }

  // Split half (or given amount) into another slot.
  split(from: number, to: number, amount?: number): boolean {
    const a = this.slots[from];
    if (!a || this.slots[to]) return false;
    const d = itemDef(a.id);
    if (d.maxStack === 1) return this.moveTo(from, to);
    const n = amount ?? Math.ceil(a.count / 2);
    const take = Math.min(n, a.count);
    this.slots[to] = { id: a.id, count: take };
    a.count -= take;
    if (a.count <= 0) this.slots[from] = null;
    return true;
  }

  drop(slot: number, amount?: number): ItemStack | null {
    const s = this.slots[slot];
    if (!s) return null;
    if (amount === undefined || amount >= s.count || itemDef(s.id).maxStack === 1) {
      this.slots[slot] = null;
      return s;
    }
    const take = Math.min(amount, s.count);
    s.count -= take;
    return { id: s.id, count: take };
  }

  selected(): ItemStack | null {
    return this.slots[this.hotbarIndex] ?? null;
  }

  selectHotbar(i: number) {
    if (i >= 0 && i < HOTBAR_SIZE) this.hotbarIndex = i;
  }

  // Wear the tool currently used; returns true if it survived.
  damageSelectedTool(amount = 1): boolean {
    const s = this.selected();
    if (!s) return true;
    const d = itemDef(s.id);
    if (d.kind !== 'tool' || s.durability === undefined) return true;
    s.durability -= amount;
    if (s.durability <= 0) {
      this.slots[this.hotbarIndex] = null;
      return false;
    }
    return true;
  }

  repairSelected(amount: number): boolean {
    const s = this.selected();
    if (!s) return false;
    const d = itemDef(s.id);
    if (d.kind !== 'tool' || s.durability === undefined || d.durability === undefined) return false;
    s.durability = Math.min(d.durability, s.durability + amount);
    return true;
  }

  equip(slot: number): boolean {
    const s = this.slots[slot];
    if (!s) return false;
    const d = itemDef(s.id);
    if (d.kind !== 'armor') return false;
    const prev = this.armor;
    this.armor = s;
    this.slots[slot] = prev;
    return true;
  }

  toJSON() {
    return {
      slots: this.slots,
      hotbarIndex: this.hotbarIndex,
      armor: this.armor,
      size: this.size
    };
  }

  static fromJSON(data: ReturnType<Inventory['toJSON']>): Inventory {
    const inv = new Inventory(data.size ?? 24);
    inv.slots = data.slots.map((s) => (s ? { ...s } : null));
    while (inv.slots.length < inv.size) inv.slots.push(null);
    inv.hotbarIndex = data.hotbarIndex ?? 0;
    inv.armor = data.armor ? { ...data.armor } : null;
    return inv;
  }
}
