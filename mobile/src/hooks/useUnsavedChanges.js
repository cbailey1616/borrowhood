import { useEffect, useRef, useState } from 'react';
import { UNSTABLE_usePreventRemove as usePreventRemove } from '@react-navigation/native';

// Covers the close button, Android back, and native swipe dismissal alike.
export default function useUnsavedChanges(navigation, values) {
  const initial = useRef(JSON.stringify(values));
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(values) !== initial.current;
  usePreventRemove(dirty && !saved, ({ data }) => {
    Alert.alert('Leave without saving?', 'Your changes haven’t been saved yet.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard changes', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => { if (saved) navigation.goBack(); }, [saved, navigation]);
  return () => setSaved(true);
}
import { ThemedAlert as Alert } from "../components/ThemedAlert";
