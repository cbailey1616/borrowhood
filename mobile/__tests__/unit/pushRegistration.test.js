import * as SecureStore from 'expo-secure-store';
import api from '../../src/services/api';
import { waitFor } from '@testing-library/react-native';
import { savePushRegistration, revokePushRegistration, registrationGeneration, cancelPushRegistration, resumePushRegistration } from '../../src/utils/pushRegistration';

let values;
beforeEach(() => {
  jest.clearAllMocks();
  values = new Map();
  SecureStore.getItemAsync.mockImplementation(async key => values.get(key) || null);
  SecureStore.setItemAsync.mockImplementation(async (key,value) => values.set(key,value));
  SecureStore.deleteItemAsync.mockImplementation(async key => values.delete(key));
  api.updatePushToken.mockReset().mockResolvedValue({});
  api.revokePushDevice.mockReset().mockResolvedValue({});
  resumePushRegistration();
});

it('waits for in-flight registration before revoking, so logout wins', async () => {
  let finish;
  api.updatePushToken.mockImplementationOnce(() => new Promise(resolve => { finish=resolve; }));
  const registration = savePushRegistration('ExponentPushToken[phone]',registrationGeneration(),'account-a');
  await waitFor(() => expect(finish).toBeDefined());
  const logout = revokePushRegistration();
  expect(api.revokePushDevice).not.toHaveBeenCalled();
  finish({}); await registration; await logout;
  expect(api.revokePushDevice).toHaveBeenCalledTimes(1);
  expect(values.has('pushRegistered')).toBe(false);
});

it('cancels stale registrations before calling the server', async () => {
  const previous = registrationGeneration();
  cancelPushRegistration();
  await savePushRegistration('ExponentPushToken[old]',previous);
  expect(api.updatePushToken).not.toHaveBeenCalled();
});

it('preserves the revocation capability after an offline failure for a later retry', async () => {
  await savePushRegistration('ExponentPushToken[phone]',registrationGeneration(),'account-a');
  api.revokePushDevice.mockRejectedValueOnce(new Error('Offline'));
  await expect(revokePushRegistration()).rejects.toThrow('Offline');
  expect(JSON.parse(values.get('pushRegistered')).userId).toBe('account-a');
  await revokePushRegistration();
  expect(values.has('pushRegistered')).toBe(false);
});

it('serializes a new account registration after an unfinished revocation', async () => {
  await savePushRegistration('ExponentPushToken[phone]',registrationGeneration(),'account-a');
  let finish;
  api.revokePushDevice.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const logout = revokePushRegistration();
  await waitFor(()=>expect(finish).toBeDefined());
  resumePushRegistration();
  const next = savePushRegistration('ExponentPushToken[phone]',registrationGeneration(),'account-b');
  expect(api.updatePushToken).toHaveBeenCalledTimes(1);
  finish({}); await logout; await next;
  expect(api.updatePushToken).toHaveBeenCalledTimes(2);
  expect(JSON.parse(values.get('pushRegistered')).userId).toBe('account-b');
});
