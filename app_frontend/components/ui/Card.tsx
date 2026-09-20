import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';

interface CardProps {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  accentColor?: string;
  subtitle?: string;
  style?: ViewStyle;
}

export function Card({ icon, label, value, accentColor, subtitle, style }: CardProps) {
  const accent = accentColor || Colors.primary;
  return (
    <View style={[styles.card, style]}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          {icon ? (
            <View style={[styles.iconContainer, { backgroundColor: `${accent}14` }]}>
              {typeof icon === 'string' ? (
                <Text style={styles.iconText}>{icon}</Text>
              ) : (
                icon
              )}
            </View>
          ) : null}
        </View>
        <Text style={styles.value}>{value}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    minWidth: 0,
    ...Shadows.sm,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  body: {
    padding: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 4,
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: FontSize.sm,
  },
  value: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: FontWeight.medium,
  },
});
