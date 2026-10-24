import { Platform } from 'react-native';
import { fromByteArray } from 'base64-js';

// expo-image's Android data-URI loader decodes the payload as base64. iOS
// accepts the existing percent-encoded XML. Preserve the same artwork on both.
export function svgDataUri(svg, platform = Platform.OS) {
  const encoded = encodeURIComponent(svg);
  if (platform !== 'android') return `data:image/svg+xml;charset=utf-8,${encoded}`;
  const binary = encoded.replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return `data:image/svg+xml;base64,${fromByteArray(bytes)}`;
}
