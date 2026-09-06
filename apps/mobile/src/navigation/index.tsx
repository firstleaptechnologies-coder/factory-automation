import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {NavigationContainer, DefaultTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {useAuth} from '../auth/AuthContext';
import {LoginScreen} from '../screens/LoginScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {JobDetailScreen} from '../screens/JobDetailScreen';
import {MachinesScreen} from '../screens/MachinesScreen';
import {StockScreen} from '../screens/StockScreen';
import {CloseSheetScreen} from '../screens/CloseSheetScreen';
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
      <Tabs.Screen name="Home" component={HomeScreen} options={{title: 'My work'}} />
      <Tabs.Screen name="Machines" component={MachinesScreen} options={{title: 'Machines'}} />
      <Tabs.Screen name="Stock" component={StockScreen} options={{title: 'Stock'}} />
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
            <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{title: 'Job'}} />
            <Stack.Screen name="CloseSheet" component={CloseSheetScreen} options={{title: 'Close sheet'}} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
