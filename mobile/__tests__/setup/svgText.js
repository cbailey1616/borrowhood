// The two native image loaders accept different SVG data-URI encodings.
export const svgText = uri => uri.includes(';base64,')
  ? Buffer.from(uri.split(',')[1], 'base64').toString('utf8')
  : decodeURIComponent(uri.slice(uri.indexOf(',') + 1));
