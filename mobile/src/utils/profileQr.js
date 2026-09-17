import qrcode from 'qrcode-generator';

export function profileQrSource(link) {
  const code = qrcode(0, 'M');
  code.addData(link, 'Byte');
  code.make();
  // Retain a four-module white quiet zone; never put artwork over the code.
  const svg = code.createSvgTag({ cellSize: 8, margin: 32 });
  return { uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
}
