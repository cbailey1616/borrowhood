import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, PanResponder, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import HapticPressable from './HapticPressable';
import { Ionicons } from './Icon';
import { COLORS, RADIUS, TYPOGRAPHY } from '../utils/config';
import { COVER_ASPECT, clamp, coverCropRect, coverTransform } from '../utils/coverCrop';

async function renderPhoto(uri, crop) {
  const context = ImageManipulator.manipulate(uri);
  let image;
  try {
    if (crop) {
      context.crop(crop);
      if (crop.width > 1200) context.resize({ width: 1200 });
    }
    image = await context.renderAsync();
    return await image.saveAsync({ format: SaveFormat.JPEG, compress: crop ? 0.9 : 1 });
  } finally {
    image?.release();
    context.release();
  }
}

export default function CoverPhotoCropper({ photo, onCancel, onComplete }) {
  const { width, height } = useWindowDimensions();
  const frameWidth = Math.min(width - 40, 600);
  const canvasHeight = Math.max(frameWidth / COVER_ASPECT, Math.min(frameWidth, height * 0.5));
  const frameTop = (canvasHeight - frameWidth / COVER_ASPECT) / 2;
  const [image, setImage] = useState(null);
  const [crop, setCrop] = useState({ zoom: 1, x: 0, y: 0 });
  const cropRef = useRef(crop);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  const gesture = useRef(null);
  const move = (zoom, offset) => {
    if (!image || busy.current) return;
    const nextZoom = clamp(zoom, 1, 4);
    const next = coverTransform(image, frameWidth, nextZoom, offset);
    cropRef.current = { zoom: nextZoom, x: next.x, y: next.y };
    setCrop(cropRef.current);
  };

  useEffect(() => {
    let current = true;
    active.current = true;
    setImage(null);
    setError(null);
    // Normalize EXIF orientation before measuring and cropping, so camera
    // portraits and library photos use the same displayed pixel coordinates.
    renderPhoto(photo.uri).then(result => {
      if (!current) return;
      if (!(result.width >= 3 && result.height >= 1)) throw new Error('Invalid image size');
      setImage(result);
      cropRef.current = { zoom: 1, x: 0, y: 0 };
      setCrop(cropRef.current);
    }).catch(() => { if (current) setError('Couldn’t open this photo. Try again.'); });
    return () => { current = false; active.current = false; };
  }, [photo.uri, retry]);

  const pan = useMemo(() => {
    const touchesOf = event => event.nativeEvent.touches;
    const start = event => {
      const touches = touchesOf(event);
      if (!touches.length) return;
      const a = touches[0], b = touches[1] || a;
      gesture.current = { count: touches.length, ...cropRef.current,
        pageX: a.pageX, pageY: a.pageY,
        midX: (a.locationX + b.locationX) / 2, midY: (a.locationY + b.locationY) / 2,
        distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !!image && !busy.current,
      onMoveShouldSetPanResponder: () => !!image && !busy.current,
      onPanResponderGrant: start,
      onPanResponderMove: event => {
        const touches = touchesOf(event);
        if (!gesture.current || touches.length !== gesture.current.count) { start(event); return; }
        const first = gesture.current, a = touches[0];
        if (touches.length > 1 && first.distance > 0) {
          const b = touches[1];
          const zoom = clamp(first.zoom * Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) / first.distance, 1, 4);
          const ratio = zoom / first.zoom;
          move(zoom, {
            x: (a.locationX + b.locationX) / 2 - frameWidth / 2 - (first.midX - frameWidth / 2 - first.x) * ratio,
            y: (a.locationY + b.locationY) / 2 - canvasHeight / 2 - (first.midY - canvasHeight / 2 - first.y) * ratio,
          });
        } else move(first.zoom, { x: first.x + a.pageX - first.pageX, y: first.y + a.pageY - first.pageY });
      },
      onPanResponderRelease: () => { gesture.current = null; },
      onPanResponderTerminate: () => { gesture.current = null; },
    });
  }, [image, frameWidth, canvasHeight]);

  const usePhoto = async () => {
    if (!image || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const current = cropRef.current;
      const result = await renderPhoto(image.uri, coverCropRect(image, frameWidth, current.zoom, current));
      if (active.current) onComplete(result.uri);
    } catch {
      if (active.current) setError('Couldn’t crop this photo. Try again.');
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  };
  const zoomBy = delta => move(cropRef.current.zoom + delta, cropRef.current);
  const transform = image ? coverTransform(image, frameWidth, crop.zoom, crop) : null;
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy.current) onCancel(); }}>
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <HapticPressable accessibilityRole="button" accessibilityLabel="Cancel cover crop" onPress={onCancel} disabled={saving} style={styles.control}>
          <Ionicons name="close" size={24} color={COLORS.primary} />
        </HapticPressable>
        <Text style={styles.title} accessibilityRole="header">Crop cover</Text>
        <View style={styles.control} />
      </View>
      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        <View testID="CoverCrop.frame" {...pan.panHandlers} style={[styles.frame, { width: frameWidth, height: canvasHeight }]}>
          {transform ? <>
            <Image source={{ uri: image.uri }} pointerEvents="none" resizeMode="stretch"
              accessibilityLabel="Cover crop preview" style={{ position: 'absolute', width: transform.width, height: transform.height, left: transform.left, top: frameTop + transform.top }} />
            <View pointerEvents="none" style={[styles.shade, { top: 0, height: frameTop }]} />
            <View pointerEvents="none" style={[styles.shade, { bottom: 0, height: frameTop }]} />
            <View pointerEvents="none" style={[styles.cropOutline, { top: frameTop, height: frameWidth / COVER_ASPECT }]}>
              {[1, 2].map(n => <View key={`v${n}`} style={[styles.grid, { left: `${n * 100 / 3}%`, top: 0, bottom: 0, width: 1 }]} />)}
              {[1, 2].map(n => <View key={`h${n}`} style={[styles.grid, { top: `${n * 100 / 3}%`, left: 0, right: 0, height: 1 }]} />)}
            </View>
          </> : !error && <ActivityIndicator color={COLORS.spinner} accessibilityLabel="Preparing cover photo" />}
        </View>
        <Text style={styles.hint}>Drag to position · Pinch to zoom</Text>
        <View style={styles.zoomRow}>
          <HapticPressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={!image || saving || crop.zoom <= 1} onPress={() => zoomBy(-0.25)} style={styles.control}>
            <Ionicons name="remove" size={24} color={COLORS.primary} />
          </HapticPressable>
          <Text style={styles.hint} accessibilityRole="adjustable" accessibilityLabel="Cover zoom"
            accessibilityValue={{ min: 100, max: 400, now: Math.round(crop.zoom * 100), text: `${Math.round(crop.zoom * 100)} percent` }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={event => zoomBy(event.nativeEvent.actionName === 'increment' ? 0.25 : -0.25)}>{Math.round(crop.zoom * 100)}%</Text>
          <HapticPressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={!image || saving || crop.zoom >= 4} onPress={() => zoomBy(0.25)} style={styles.control}>
            <Ionicons name="add" size={24} color={COLORS.primary} />
          </HapticPressable>
        </View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!image && error && <HapticPressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={styles.control}>
          <Text style={styles.hint}>Try again</Text>
        </HapticPressable>}
      </ScrollView>
      <HapticPressable accessibilityRole="button" accessibilityLabel="Use cover photo" onPress={usePhoto} disabled={!image || saving} style={[styles.useButton, (!image || saving) && styles.disabled]}>
        {saving ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.useText}>Use photo</Text>}
      </HapticPressable>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  title: { ...TYPOGRAPHY.headline, color: COLORS.primary, flex: 1, textAlign: 'center' },
  control: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 16 },
  frame: { overflow: 'hidden', backgroundColor: COLORS.text, justifyContent: 'center', alignItems: 'center', borderRadius: RADIUS.md },
  shade: { position: 'absolute', left: 0, right: 0, backgroundColor: '#00000080' },
  cropOutline: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#FFFFFF' },
  grid: { position: 'absolute', backgroundColor: '#FFFFFF88' },
  hint: { ...TYPOGRAPHY.footnote, color: COLORS.textSecondary, textAlign: 'center' },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  error: { ...TYPOGRAPHY.footnote, color: COLORS.danger, textAlign: 'center', paddingHorizontal: 20 },
  useButton: { minHeight: 52, margin: 20, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  useText: { ...TYPOGRAPHY.body, color: COLORS.surface },
  disabled: { opacity: 0.5 },
});
