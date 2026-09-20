import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface StatusBadgeProps {
  label: string;
  color: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
  small?: boolean;
}

export function StatusBadge({ label, color, icon, style, small }: StatusBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: `${color}14`, borderColor: `${color}35` },
        small && styles.badgeSmall,
        style,
      ]}
    >
      {icon ? (
        <View style={styles.iconWrapper}>{icon}</View>
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
      <Text
        style={[
          styles.text,
          { color },
          small && styles.textSmall,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  iconWrapper: {
    marginRight: 4,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    textTransform: 'capitalize',
  },
  textSmall: {
    fontSize: 11,
  },
});
