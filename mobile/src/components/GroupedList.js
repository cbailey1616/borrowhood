import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Ionicons } from './Icon';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../utils/config';
import LayeredCard from './LayeredCard';
import HapticPressable from './HapticPressable';
import { haptics } from '../utils/haptics';

export function GroupedListSection({ header, footer, children }) {
  const childArray = React.Children.toArray(children);
  return (
    <View style={styles.section}>
      {header ? (
        <Text style={styles.sectionHeader}>{header}</Text>
      ) : null}
      <LayeredCard>
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
          <View style={styles.iconBox}>
            {React.isValidElement(icon) ? React.cloneElement(icon, { size: 22, color: destructive ? COLORS.danger : iconColor, illustrated: destructive ? false : icon.props.illustrated })
              : <Ionicons name={icon} size={22} color={destructive ? COLORS.danger : iconColor} />}
          </View>
        ) : null}
        <View style={styles.itemContent}>
          <Text maxFontSizeMultiplier={1.4} style={[styles.itemTitle, { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text maxFontSizeMultiplier={1.4} style={styles.itemSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text maxFontSizeMultiplier={1.4} style={styles.itemValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {hasSwitch ? (
          <Switch
            value={switchValue}
            onValueChange={value => { haptics.selection(); onSwitchChange?.(value); }}
            trackColor={{ false: COLORS.primaryMuted, true: COLORS.primary }}
            thumbColor={COLORS.white}
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
      {!isLast && <View style={[styles.separator, !icon && styles.separatorWithoutIcon]} />}
    </View>
  );

  if (onPress && !hasSwitch) {
    return (
      <HapticPressable onPress={onPress} haptic={null} scaleDown={1} pressedBackgroundColor={COLORS.cardHover} testID={testID} accessibilityLabel={accessibilityLabel || title} accessibilityRole={accessibilityRole || 'button'}>
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
    fontFamily: 'DMSans_500Medium', fontWeight: '500',
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
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  itemContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  itemTitle: {
    ...TYPOGRAPHY.button,
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
  separatorWithoutIcon: { marginLeft: SPACING.lg },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
    marginLeft: SPACING.lg + 22 + SPACING.md,
  },
});
