import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showInventory, PanelActions } from '../src/ui/panels';
import { Inventory } from '../src/game/inventory';

function setup(inv: Inventory) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const actions: PanelActions = {
    onClose: vi.fn(),
    onUse: vi.fn(),
    onDrop: vi.fn(),
    onEquip: vi.fn(),
    onChange: vi.fn()
  };
  showInventory(root, inv, actions);
  return { root, actions };
}

function dropOn(
  root: HTMLElement,
  slot: number,
  opts: { shift?: boolean; data?: string; noTransfer?: boolean } = {}
) {
  const target = root.querySelector(`.slot[data-slot="${slot}"]`) as HTMLElement;
  expect(target).toBeTruthy();
  const ev = new MouseEvent('drop', { bubbles: true, cancelable: true, shiftKey: !!opts.shift });
  if (!opts.noTransfer) {
    (ev as unknown as { dataTransfer: unknown }).dataTransfer = {
      getData: () => opts.data ?? '',
      setData: () => {}
    };
  }
  target.dispatchEvent(ev);
}

function snap(inv: Inventory) {
  return JSON.parse(JSON.stringify(inv.toJSON()));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('inventory panel drag & split', () => {
  it('shift-drop splits a stack and notifies exactly once', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: 'iron_scrap', count: 10 };
    const { root, actions } = setup(inv);
    dropOn(root, 5, { shift: true, data: '0' });
    expect(inv.slots[0]?.count).toBe(5);
    expect(inv.slots[5]?.count).toBe(5);
    expect(actions.onChange).toHaveBeenCalledTimes(1);
    // re-rendered view shows the split result
    expect(root.querySelector('.slot[data-slot="5"]')?.textContent).toContain('5');
  });

  it('left-drop moves the whole stack and notifies exactly once', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: 'iron_scrap', count: 10 };
    const { root, actions } = setup(inv);
    dropOn(root, 5, { data: '0' });
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[5]?.count).toBe(10);
    expect(actions.onChange).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'abc', '-1', '1.5', '24', '999', '0x3'])(
    'ignores forged DataTransfer slot value %s without state change or notification',
    (data) => {
      const inv = new Inventory();
      inv.slots[0] = { id: 'iron_scrap', count: 10 };
      const { root, actions } = setup(inv);
      const before = snap(inv);
      dropOn(root, 5, { shift: true, data });
      dropOn(root, 5, { data });
      expect(snap(inv)).toEqual(before);
      expect(actions.onChange).not.toHaveBeenCalled();
    }
  );

  it('ignores a drop with no DataTransfer at all', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: 'iron_scrap', count: 10 };
    const { root, actions } = setup(inv);
    const before = snap(inv);
    dropOn(root, 5, { shift: true, noTransfer: true });
    expect(snap(inv)).toEqual(before);
    expect(actions.onChange).not.toHaveBeenCalled();
  });

  it('failed split (occupied target) re-renders without notifying', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: 'iron_scrap', count: 10 };
    inv.slots[5] = { id: 'copper_scrap', count: 3 };
    const { root, actions } = setup(inv);
    const before = snap(inv);
    dropOn(root, 5, { shift: true, data: '0' });
    expect(snap(inv)).toEqual(before);
    expect(actions.onChange).not.toHaveBeenCalled();
    // view restored from real state, not rendered as a success
    expect(root.querySelector('.slot[data-slot="0"]')?.textContent).toContain('10');
    expect(root.querySelector('.slot[data-slot="5"]')?.textContent).toContain('3');
  });

  it('failed move (empty source) does not notify', () => {
    const inv = new Inventory();
    inv.slots[0] = { id: 'iron_scrap', count: 10 };
    const { root, actions } = setup(inv);
    const before = snap(inv);
    dropOn(root, 5, { data: '3' }); // slot 3 is empty
    expect(snap(inv)).toEqual(before);
    expect(actions.onChange).not.toHaveBeenCalled();
  });
});
