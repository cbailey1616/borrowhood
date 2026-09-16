import { useEffect, useRef, useState } from 'react';
import { UNSTABLE_usePreventRemove as usePreventRemove } from '@react-navigation/native';
import useNavigationTask from './useNavigationTask';

// Covers the close button, Android back, and native swipe dismissal alike.
export default function useUnsavedChanges(navigation, values) {
  const initial = useRef(JSON.stringify(values));
  const [saved, setSaved] = useState(false);
  const promptOpen = useRef(false);
  const startNavigationTask = useNavigationTask(navigation);
  const dirty = JSON.stringify(values) !== initial.current;
  usePreventRemove(dirty && !saved, ({ data }) => {
    if (promptOpen.current) return;
    promptOpen.current = true;
    const isCurrent = startNavigationTask();
    const closePrompt = () => { promptOpen.current = false; };
    Alert.alert('Leave without saving?', 'Your changes haven’t been saved yet.', [
      { text: 'Keep editing', style: 'cancel', onPress: closePrompt },
      { text: 'Discard changes', style: 'destructive', onPress: () => {
        closePrompt();
        if (isCurrent()) navigation.dispatch(data.action);
      } },
    ]);
  });
  useEffect(() => { if (saved && navigation.isFocused?.() !== false) navigation.goBack(); }, [saved, navigation]);
  return () => setSaved(true);
}
import { ThemedAlert as Alert } from "../components/ThemedAlert";
