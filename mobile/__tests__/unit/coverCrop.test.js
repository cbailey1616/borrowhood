import { coverCropRect, coverTransform } from '../../src/utils/coverCrop';

it('centers a wide crop with the expected source pixels', () => {
  expect(coverCropRect({ width: 3000, height: 2000 }, 300, 1, { x: 0, y: 0 }))
    .toEqual({ originX: 0, originY: 500, width: 3000, height: 1000 });
});
it('supports zooming and dragging to opposite corners without blank edges', () => {
  const image = { width: 3000, height: 2000 };
  expect(coverCropRect(image, 300, 2, { x: 10000, y: 10000 })).toEqual({ originX: 0, originY: 0, width: 1500, height: 500 });
  expect(coverCropRect(image, 300, 2, { x: -10000, y: -10000 })).toEqual({ originX: 1500, originY: 1500, width: 1500, height: 500 });
});
it.each([[3024, 4032], [4032, 3024], [6000, 1000], [333, 999], [3, 1]])('keeps portrait, landscape and small images in bounds (%s × %s)', (width, height) => {
  for (const zoom of [1, 1.25, 2, 4]) for (const position of [-10000, 0, 10000]) {
    const image = { width, height }, offset = { x: position, y: -position };
    const rect = coverCropRect(image, 335, zoom, offset);
    expect(rect.width).toBe(rect.height * 3);
    expect(rect.originX).toBeGreaterThanOrEqual(0);
    expect(rect.originY).toBeGreaterThanOrEqual(0);
    expect(rect.originX + rect.width).toBeLessThanOrEqual(width);
    expect(rect.originY + rect.height).toBeLessThanOrEqual(height);
    const view = coverTransform(image, 335, zoom, offset);
    expect(view.left).toBeLessThanOrEqual(0.00001);
    expect(view.top).toBeLessThanOrEqual(0.00001);
    expect(view.left + view.width).toBeGreaterThanOrEqual(335 - 0.00001);
    expect(view.top + view.height).toBeGreaterThanOrEqual(335 / 3 - 0.00001);
  }
});
