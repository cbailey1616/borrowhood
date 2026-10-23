import { reservedSideInsets, topReservedBottom } from '../../../src/context/ReservedRegionsContext';

describe('system clearance for top controls', () => {
  it('clears both the camera and the clock below it on a folded Duo', () => {
    expect(topReservedBottom([
      { x: 390, y: 12, width: 64, height: 68 },
      { x: 384, y: 96, width: 82, height: 80 },
    ], 678)).toBe(176);
  });
  it('uses the current landscape region after unfolding', () => {
    expect(topReservedBottom([{ x: 854, y: 8, width: 97, height: 118 }], 669)).toBe(126);
  });
  it('does not reserve the keyboard or lower floating controls at the top', () => {
    expect(topReservedBottom([{ x: 0, y: 390, width: 951, height: 279 }], 669)).toBe(0);
  });
  it('keeps regular iPad windows free of extra top padding', () => {
    expect(topReservedBottom([], 1133)).toBe(0);
  });
  it('ignores invalid frames', () => {
    expect(topReservedBottom([{ y: NaN, height: 80 }, { y: 0, height: -5 }], 678)).toBe(0);
  });
});

// Keep the compact heading beside the corner status UI, while the tabs below it
// can use the entire screen width.
it('reserves only the intersecting corner of an unfolded Duo', () => {
  const regions = [{ x: 867, y: 0, width: 84, height: 124 }];
  expect(reservedSideInsets(regions, 951, 68, 112)).toEqual({ left: 0, right: 84 });
  expect(reservedSideInsets(regions, 951, 124, 172)).toEqual({ left: 0, right: 0 });
});
it('handles the opposite corner without moving controls below it', () => {
  const regions = [{ x: 0, y: 0, width: 84, height: 174 }];
  expect(reservedSideInsets(regions, 466, 68, 112)).toEqual({ left: 84, right: 0 });
  expect(reservedSideInsets(regions, 466, 174, 222)).toEqual({ left: 0, right: 0 });
});
