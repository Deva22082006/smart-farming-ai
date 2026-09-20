import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Leaf, ClipboardCheck, Sliders } from 'lucide-react-native';
import { Colors, FontSize, FontWeight, Shadows } from '@/constants/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const isWeb = Platform.OS === 'web';
  const tabHeight = isWeb ? 64 : 58 + bottomInset;
  const tabPaddingBottom = isWeb ? 8 : Math.max(bottomInset, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: tabHeight,
          paddingBottom: tabPaddingBottom,
          paddingTop: 8,
          ...Shadows.sm,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: FontWeight.medium,
        },
        tabBarItemStyle: {
          minHeight: 48,
          paddingVertical: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Home
              size={focused ? 22 : 20}
              color={color}
              strokeWidth={focused ? 2.2 : 1.8}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="checks"
        options={{
          title: 'Checks',
          tabBarIcon: ({ color, size, focused }) => (
            <Leaf
              size={focused ? 22 : 20}
              color={color}
              strokeWidth={focused ? 2.2 : 1.8}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Review',
          tabBarIcon: ({ color, size, focused }) => (
            <ClipboardCheck
              size={focused ? 22 : 20}
              color={color}
              strokeWidth={focused ? 2.2 : 1.8}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="others"
        options={{
          title: 'Others',
          tabBarIcon: ({ color, size, focused }) => (
            <Sliders
              size={focused ? 22 : 20}
              color={color}
              strokeWidth={focused ? 2.2 : 1.8}
            />
          ),
        }}
      />
    </Tabs>
  );
}
