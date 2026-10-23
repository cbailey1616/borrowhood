import qrcode from 'qrcode-generator';

export function profileQrSource(link) {
  const code = qrcode(0, 'M');
  code.addData(link, 'Byte');
  code.make();
  // Retain a four-module white quiet zone; never put artwork over the code.
  // Explicit SVG units avoid native image decoders treating 100% as 100 units.
  const size = code.getModuleCount() * 8 + 64;
  const svg = code.createSvgTag({ cellSize: 8, margin: 32 })
    .replace('<rect width="100%" height="100%"', `<rect width="${size}" height="${size}"`);
  return { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}
