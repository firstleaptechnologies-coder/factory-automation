import React from 'react';
import { View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { TabBar } from './TabBar';
import { Loader } from '../ui';
import { palette } from '../theme';

import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { PunchScreen } from '../screens/PunchScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrderPhotosScreen } from '../screens/OrderPhotosScreen';
import { LeadsScreen } from '../screens/LeadsScreen';
import { LeadDetailScreen } from '../screens/LeadDetailScreen';
import { LeadCreateScreen } from '../screens/LeadCreateScreen';
import { LeadConvertScreen } from '../screens/LeadConvertScreen';
import { BoardScreen } from '../screens/BoardScreen';
import { ClientsScreen } from '../screens/ClientsScreen';
import { ClientDetailScreen } from '../screens/ClientDetailScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AdminMaterialsScreen } from '../screens/admin/AdminMaterialsScreen';
import { AdminSizesScreen } from '../screens/admin/AdminSizesScreen';
import { AdminFlowScreen } from '../screens/admin/AdminFlowScreen';
import { AdminLeadFieldsScreen } from '../screens/admin/AdminLeadFieldsScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: palette.bg,
    card: palette.surface,
    text: palette.text,
    border: 'rgba(0,0,0,0.28)',
    primary: palette.accent,
    notification: palette.accent,
  },
};

function MainTabs() {
  return (
    <Tabs.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.bg } }}>
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{ title: 'Orders' }} />
      {/* The centre action. It is a route so it can hold state while you fill it. */}
      <Tabs.Screen name="PunchTab" component={PunchScreen} options={{ title: 'Punch' }} />
      <Tabs.Screen name="Leads" component={LeadsScreen} options={{ title: 'Leads' }} />
      <Tabs.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <Loader />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          animation: 'slide_from_right',
        }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            <Stack.Screen name="OrderPhotos" component={OrderPhotosScreen} />
            <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
            <Stack.Screen name="LeadCreate" component={LeadCreateScreen} />
            <Stack.Screen name="LeadConvert" component={LeadConvertScreen} />
            <Stack.Screen name="Board" component={BoardScreen} />
            <Stack.Screen name="Clients" component={ClientsScreen} />
            <Stack.Screen name="ClientDetail" component={ClientDetailScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="AdminMaterials" component={AdminMaterialsScreen} />
            <Stack.Screen name="AdminSizes" component={AdminSizesScreen} />
            <Stack.Screen name="AdminFlow" component={AdminFlowScreen} />
            <Stack.Screen name="AdminLeadFields" component={AdminLeadFieldsScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
