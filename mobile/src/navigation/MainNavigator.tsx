import React from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { CampaignsScreen } from '../screens/CampaignsScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { CampaignDetailScreen } from '../screens/CampaignDetailScreen';
import { WhyScreen } from '../screens/WhyScreen';
import { MetaConnectScreen } from '../screens/MetaConnectScreen';
import { ar } from '../i18n/ar';
import { brand, surface, text as textColor } from '../theme/tokens';
import type { MainStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

function Tabs(): React.ReactElement {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.base,
        tabBarInactiveTintColor: textColor.faint,
        tabBarStyle: { backgroundColor: surface.surface, borderTopColor: surface.border },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: ar.tabHome }} />
      <Tab.Screen name="Campaigns" component={CampaignsScreen} options={{ title: ar.tabCampaigns }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: ar.tabAccount }} />
    </Tab.Navigator>
  );
}

/**
 * Root of the signed-in experience. A native stack ON TOP of the tab bar —
 * pushing CampaignDetail/Why/MetaConnect over the tabs is the standard iOS
 * pattern (the tab bar hides on push, exactly like Mail/Settings), not a web
 * router mapped onto native chrome.
 */
export function MainNavigator(): React.ReactElement {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: brand.base,
        headerTitleStyle: { color: textColor.primary },
        // v7 renamed headerBackTitleVisible → headerBackButtonDisplayMode.
        headerBackButtonDisplayMode: 'minimal',
        // The reading direction is RTL even though layout stays LTR (see
        // ALPHA_LAUNCH.md for why) — the platform back-swipe stays on its
        // native edge, and Arabic titles/text still shape RTL on their own.
        animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} options={{ title: ar.screenCampaign }} />
      <Stack.Screen name="Why" component={WhyScreen} options={{ title: ar.screenWhy }} />
      <Stack.Screen name="MetaConnect" component={MetaConnectScreen} options={{ title: ar.screenConnect }} />
    </Stack.Navigator>
  );
}
