import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { useGenerations } from '../../src/generations';
import { colors } from '../../src/theme';

export default function TabsLayout() {
  const { active } = useGenerations();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 64, paddingTop: 6 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
      }}
      // Mini player sits right above the tab bar on every tab.
      tabBar={(props) => (
        <View style={{ backgroundColor: colors.bg }}>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarBadge: active.length ? active.length : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent },
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" color={color} size={size + 6} />,
        }}
      />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color, size }) => <Ionicons name="albums" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} /> }} />
    </Tabs>
  );
}
