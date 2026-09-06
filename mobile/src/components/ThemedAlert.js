import React, { useSyncExternalStore } from 'react';
import ActionSheet from './ActionSheet';

let queue = [];
let nextId = 0;
const listeners = new Set();
const emit = () => listeners.forEach(listener => listener());
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => queue[0] || null;

// Same callback contract as our former native alerts, with explicit consent intact.
export const ThemedAlert = {
  alert(title, message, buttons = [{ text: 'Got it' }], options = {}) {
    queue.push({ id: ++nextId, title, message, buttons, options });
    emit();
  },
};

export default function ThemedAlertHost() {
  const dialog = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!dialog) return null;
  const finish = callback => {
    if (queue[0] !== dialog) return;
    queue = queue.slice(1);
    emit();
    callback?.();
  };
  const cancel = dialog.buttons.find(button => button.style === 'cancel');
  return <ActionSheet key={dialog.id} isVisible title={dialog.title} message={dialog.message}
    onClose={() => finish(cancel?.onPress || dialog.options.onDismiss)}
    cancelLabel={cancel?.text || 'Close'}
    actions={dialog.buttons.filter(button => button !== cancel).map(button => ({
      label: button.text,
      destructive: button.style === 'destructive',
      primary: button.style !== 'destructive',
      onPress: () => finish(button.onPress),
    }))} />;
}
