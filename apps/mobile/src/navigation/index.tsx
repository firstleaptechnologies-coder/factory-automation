import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {NavigationContainer, DefaultTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useAuth} from '../auth/AuthContext';
import {LoginScreen} from '../screens/LoginScreen';
import {PunchScreen} from '../screens/PunchScreen';
import {OrdersScreen} from '../screens/OrdersScreen';
import {OrderDetailScreen} from '../screens/OrderDetailScreen';
import {colors} from '../theme';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: {backgroundColor: colors.surface},
        headerTitleStyle: {color: colors.text},
        tabBarStyle: {backgroundColor: colors.surface, borderTopColor: colors.border, height: 64},
        tabBarLabelStyle: {fontSize: 12, marginBottom: 6},
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}>
      <Tabs.Screen name="Punch" component={PunchScreen} options={{title: 'Punch'}} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{title: 'Orders'}} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const {user, loading} = useAuth();

  if (loading) {
    return (
      <View style={{flex: 1, backgroundColor: colors.bg, justifyContent: 'center'}}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {backgroundColor: colors.surface},
          headerTitleStyle: {color: colors.text},
          headerTintColor: colors.text,
        }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{headerShown: false}} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{title: 'Order'}} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
