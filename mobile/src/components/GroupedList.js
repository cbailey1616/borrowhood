import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import LayeredCard from './LayeredCard';
import HapticPressable from './HapticPressable';

export function GroupedListSection({ header, footer, children }) {
  const childArray = React.Children.toArray(children);
  return (
    <View style={styles.section}>
      {header ? (
        <Text style={styles.sectionHeader}>{header}</Text>
      ) : null}
      <LayeredCard stacked={false}>
        <View style={styles.sectionContent}>
          {childArray.map((child, index) =>
            React.cloneElement(child, {
              isFirst: index === 0,
              isLast: index === childArray.length - 1,
            })
          )}
        </View>
      </LayeredCard>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

export function GroupedListItem({
  icon,
  iconColor = COLORS.textSecondary,
  iconBg,
  title,
  subtitle,
  value,
  onPress,
  chevron = true,
  destructive = false,
  switchValue,
  onSwitchChange,
  rightElement,
  isFirst,
  isLast,
  testID,
  accessibilityLabel,
  accessibilityRole,
}) {
  const textColor = destructive ? COLORS.danger : COLORS.text;
  const hasSwitch = switchValue !== undefined;

  const content = (
    <View
      style={[
        styles.item,
        isFirst && styles.itemFirst,
        isLast && styles.itemLast,
      ]}
    >
      <View style={styles.itemInner}>
        {icon ? (
          <View
            style={[
              styles.iconBox,
              { backgroundColor: iconBg || (destructive ? COLORS.dangerMuted : 'transparent') },
            ]}
          >
            {React.isValidElement(icon) ? icon : <Ionicons name={icon} size={20} color={destructive ? COLORS.danger : iconColor} illustrated={!destructive && iconColor === COLORS.textSecondary} />}
          </View>
        ) : null}
        <View style={styles.itemContent}>
          <Text style={[styles.itemTitle, { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.itemSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text style={styles.itemValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {hasSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={onSwitchChange}
            trackColor={{ false: COLORS.primaryMuted, true: COLORS.primary }}
            thumbColor="#fff"
            ios_backgroundColor={COLORS.primaryMuted}
          />
        ) : null}
        {rightElement || null}
        {chevron && !hasSwitch && onPress ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={COLORS.textMuted}
            style={styles.chevron}
          />
        ) : null}
      </View>
      {!isLast && <View style={styles.separator} />}
    </View>
  );

  if (onPress && !hasSwitch) {
    return (
      <HapticPressable onPress={onPress} haptic="light" testID={testID} accessibilityLabel={accessibilityLabel || title} accessibilityRole={accessibilityRole || 'button'}>
        {content}
      </HapticPressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    ...TYPOGRAPHY.footnote,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.lg,
    letterSpacing: 0,
  },
  sectionContent: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  sectionFooter: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
    marginLeft: SPACING.lg,
  },
  item: {
    backgroundColor: 'transparent',
  },
  itemFirst: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  itemLast: {
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  itemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: SPACING.lg,
    minHeight: 56,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  itemContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  itemTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  itemSubtitle: {
    ...TYPOGRAPHY.caption1,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  itemValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    marginRight: SPACING.xs,
  },
  chevron: {
    marginLeft: SPACING.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
    marginLeft: SPACING.lg + 30 + SPACING.md,
  },
});
