import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Inventory } from '../src/game/inventory';
import { showInventory, PanelActions } from '../src/ui/panels';

function makeActions() {
  return {
    onClose: vi.fn(),
    onUse: vi.fn(),
    onDrop: vi.fn(),
    onEquip: vi.fn(),
    onChange: vi.fn()
  } satisfies PanelActions;
}

function dropEvent(raw: string | undefined, shiftKey: boolean): Event {
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  (ev as unknown as { dataTransfer?: unknown }).dataTransfer =
    raw === undefined ? undefined : { getData: () => raw };
  (ev as unknown as { shiftKey: boolean }).shiftKey = shiftKey;
  return ev;
}

describe('inventory panel drag & split', () => {
  let root: HTMLElement;
  let inv: Inventory;
  let actions: ReturnType<typeof makeActions>;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    inv = new Inventory();
    inv.slots[0] = { id: 'iron_scrap', count: 10 };
    actions = makeActions();
    showInventory(root, inv, actions);
  });

  const slotEls = () => Array.from(root.querySelectorAll<HTMLElement>('#inv-grid .slot'));

  it('shift-drop splits half, notifies once and re-renders once', () => {
    slotEls()[3].dispatchEvent(dropEvent('0', true));
    expect(inv.slots[0]?.count).toBe(5);
    expect(inv.slots[3]?.count).toBe(5);
    expect(actions.onChange).toHaveBeenCalledTimes(1);
    expect(slotEls()[3].querySelector('.cnt')?.textContent).toBe('5');
  });

  it('left-drop moves the whole stack with a single notification', () => {
    slotEls()[3].dispatchEvent(dropEvent('0', false));
    expect(inv.slots[0]).toBeNull();
    expect(inv.slots[3]?.count).toBe(10);
    expect(actions.onChange).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['abc', 'non-numeric'],
    ['1.5', 'fractional'],
    ['-2', 'negative'],
    ['24', 'out of range'],
    ['', 'empty']
  ])('ignores forged DataTransfer slot %s (%s)', (raw) => {
    const before = structuredClone(inv.toJSON());
    slotEls()[3].dispatchEvent(dropEvent(raw, true));
    slotEls()[3].dispatchEvent(dropEvent(raw, false));
    expect(inv.toJSON()).toEqual(before);
    expect(actions.onChange).not.toHaveBeenCalled();
    expect(slotEls().length).toBe(inv.size);
  });

  it('ignores drops with a missing DataTransfer entirely', () => {
    const before = structuredClone(inv.toJSON());
    slotEls()[3].dispatchEvent(dropEvent(undefined, true));
    expect(inv.toJSON()).toEqual(before);
    expect(actions.onChange).not.toHaveBeenCalled();
  });

  it('failed shift-split onto an occupied slot re-renders without notifying', () => {
    inv.slots[3] = { id: 'copper_scrap', count: 2 };
    showInventory(root, inv, actions);
    const before = structuredClone(inv.toJSON());
    slotEls()[3].dispatchEvent(dropEvent('0', true));
    expect(inv.toJSON()).toEqual(before);
    expect(actions.onChange).not.toHaveBeenCalled();
    expect(slotEls()[0].querySelector('.cnt')?.textContent).toBe('10');
  });
});
