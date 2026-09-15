import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import api from '../services/api';

let devicePromise;
let pending = Promise.resolve();
let generation = 0;
let paused = false;
export const resumePushRegistration = () => { paused = false; };
export const registrationGeneration = () => generation;
export const cancelPushRegistration = () => { generation += 1; };

export async function getPushDevice() {
  if (!devicePromise) devicePromise = (async () => {
    const stored = await SecureStore.getItemAsync('pushDevice');
    if (stored) return JSON.parse(stored);
    const device = { installationId: Crypto.randomUUID(), revocationSecret: `${Crypto.randomUUID()}-${Crypto.randomUUID()}` };
    await SecureStore.setItemAsync('pushDevice', JSON.stringify(device));
    return device;
  })().catch(error => { devicePromise = null; throw error; });
  return devicePromise;
}

export function savePushRegistration(token, expectedGeneration, userId) {
  const job = pending.catch(() => {}).then(async () => {
    const device = await getPushDevice();
    if (paused || generation !== expectedGeneration) return;
    await SecureStore.setItemAsync('pushRegistered', JSON.stringify({ userId }));
    await api.updatePushToken(token, device);
  });
  pending = job;
  return job;
}

export function revokePushRegistration() {
  paused = true;
  cancelPushRegistration();
  // Serialize against an already-sent registration; logout must win the race.
  const job = pending.catch(() => {}).then(async () => {
    const registered = await SecureStore.getItemAsync('pushRegistered');
    if (!registered) return;
    try { await api.revokePushDevice({ ...await getPushDevice(), userId: JSON.parse(registered).userId }); }
    catch (error) { paused = false; throw error; }
    await SecureStore.deleteItemAsync('pushRegistered');
  });
  pending = job;
  return job;
}
