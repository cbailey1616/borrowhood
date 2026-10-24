import { svgDataUri } from '../../src/utils/svgSource';

it('round-trips SVG colors, markup and Unicode through the Android base64 decoder', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="#42594C">Neighbors’ café 🌳</text></svg>';
  const uri = svgDataUri(svg, 'android');
  expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
  expect(Buffer.from(uri.split(',')[1], 'base64').toString('utf8')).toBe(svg);
});

it('preserves the existing iOS representation', () => {
  const svg = '<svg><path fill="#E7C590"/></svg>';
  expect(svgDataUri(svg, 'ios')).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
});
