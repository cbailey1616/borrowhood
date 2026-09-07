import { Image } from 'expo-image';
import { imageIdentity } from './imageIdentity';

// Bound decoded memory separately from Expo's disk cache. Retained native refs
// can be displayed synchronously when a list cell mounts again.
const images = new Map();
const pending = new Map();
const LIMIT = 16;
export function getDecodedImage(uri) {
  const key = imageIdentity(uri);
  const image = images.get(key);
  if (image) { images.delete(key); images.set(key, image); }
  return image;
}
export function loadDecodedImage(uri) {
  const key = imageIdentity(uri);
  const cached = getDecodedImage(uri);
  if (cached) return Promise.resolve(cached);
  if (pending.has(key)) return pending.get(key);
  const request = Image.loadAsync(key === uri ? uri : { uri, cacheKey: key }, { maxWidth: 800, maxHeight: 800 }).then(image => {
    images.set(key, image);
    while (images.size > LIMIT) images.delete(images.keys().next().value);
    return image;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
