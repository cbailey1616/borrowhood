export const COVER_ASPECT = 3;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function coverTransform(image, frameWidth, zoom = 1, offset = { x: 0, y: 0 }) {
  const height = frameWidth / COVER_ASPECT;
  const scale = Math.max(frameWidth / image.width, height / image.height) * clamp(zoom, 1, 4);
  const width = image.width * scale;
  const imageHeight = image.height * scale;
  const x = clamp(offset.x, -(width - frameWidth) / 2, (width - frameWidth) / 2);
  const y = clamp(offset.y, -(imageHeight - height) / 2, (imageHeight - height) / 2);
  return { scale, width, height: imageHeight, x, y, left: (frameWidth - width) / 2 + x, top: (height - imageHeight) / 2 + y };
}

export function coverCropRect(image, frameWidth, zoom, offset) {
  const transform = coverTransform(image, frameWidth, zoom, offset);
  // Whole pixels with an exact 3:1 shape. Clamp rounding at all four edges.
  const height = Math.max(1, Math.floor(frameWidth / COVER_ASPECT / transform.scale));
  const width = height * COVER_ASPECT;
  return {
    originX: clamp(Math.round(-transform.left / transform.scale), 0, image.width - width),
    originY: clamp(Math.round(-transform.top / transform.scale), 0, image.height - height),
    width,
    height,
  };
}
