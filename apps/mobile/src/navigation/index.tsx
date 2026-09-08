import React from 'react';
import { View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { TabBar } from './TabBar';
import { SupportBanner } from '../components/SupportBanner';
import { Loader } from '../ui';
import { palette } from '../theme';

import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { PunchScreen } from '../screens/PunchScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrderPhotosScreen } from '../screens/OrderPhotosScreen';
import { LeadsScreen } from '../screens/LeadsScreen';
import { LeadBoardScreen } from '../screens/LeadBoardScreen';
import { ArchivedLeadsScreen } from '../screens/ArchivedLeadsScreen';
import { LeadDetailScreen } from '../screens/LeadDetailScreen';
import { LeadCreateScreen } from '../screens/LeadCreateScreen';
import { LeadConvertScreen } from '../screens/LeadConvertScreen';
import { BoardScreen } from '../screens/BoardScreen';
import { ClientsScreen } from '../screens/ClientsScreen';
import { ClientDetailScreen } from '../screens/ClientDetailScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { AdminHomeScreen } from '../screens/admin/AdminHomeScreen';
import { AdminMaterialsScreen } from '../screens/admin/AdminMaterialsScreen';
import { AdminSizesScreen } from '../screens/admin/AdminSizesScreen';
import { AdminFlowScreen } from '../screens/admin/AdminFlowScreen';
import { FlowCanvasScreen } from '../screens/admin/FlowCanvasScreen';
import { MainCardScreen } from '../screens/admin/MainCardScreen';
import { FirmProfileScreen } from '../screens/admin/FirmProfileScreen';
import { EstimatesScreen } from '../screens/EstimatesScreen';
import { EstimateEditScreen } from '../screens/EstimateEditScreen';
import { EstimateDetailScreen } from '../screens/EstimateDetailScreen';
import { ClientFirmScreen } from '../screens/ClientFirmScreen';
import { AdminLeadFieldsScreen } from '../screens/admin/AdminLeadFieldsScreen';
import { PaymentsScreen } from '../screens/PaymentsScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { DisbursementsScreen } from '../screens/DisbursementsScreen';
import { DisbursementLedgerScreen } from '../screens/DisbursementLedgerScreen';
import { ExpensesScreen } from '../screens/ExpensesScreen';
import { EmployeesScreen } from '../screens/EmployeesScreen';
import { EmployeeFormScreen } from '../screens/EmployeeFormScreen';
import { EmployeeDetailScreen } from '../screens/EmployeeDetailScreen';
import { AttendanceScreen } from '../screens/AttendanceScreen';
import { AttendanceMonthScreen } from '../screens/AttendanceMonthScreen';
import { SalaryScreen } from '../screens/SalaryScreen';
import { SalaryRunScreen } from '../screens/SalaryRunScreen';
import { PayStructuresScreen } from '../screens/PayStructuresScreen';
import { SalaryAdvancesScreen } from '../screens/SalaryAdvancesScreen';
import { ExpenseFormScreen } from '../screens/ExpenseFormScreen';
import { ExpenseDetailScreen } from '../screens/ExpenseDetailScreen';
import { ExpenseAnalyticsScreen } from '../screens/ExpenseAnalyticsScreen';
import { AdminExpenseOptionsScreen } from '../screens/admin/AdminExpenseOptionsScreen';
import { AdminRolesScreen } from '../screens/admin/AdminRolesScreen';
import { AdminLetterTemplatesScreen } from '../screens/admin/AdminLetterTemplatesScreen';
import { EmployeeLettersScreen } from '../screens/EmployeeLettersScreen';
import { VendorsScreen } from '../screens/VendorsScreen';
import { VendorDetailScreen } from '../screens/VendorDetailScreen';
import { PurchasesScreen } from '../screens/PurchasesScreen';
import { PurchaseEditScreen } from '../screens/PurchaseEditScreen';
import { PurchaseDetailScreen } from '../screens/PurchaseDetailScreen';
import { StockScreen } from '../screens/StockScreen';
import { StockMovesScreen } from '../screens/StockMovesScreen';
import { WasteScreen } from '../screens/WasteScreen';
import { TenantsScreen } from '../screens/platform/TenantsScreen';

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
      <Tabs.Screen name="Search" component={SearchScreen} options={{ title: 'Search' }} />
      <Tabs.Screen name="Leads" component={LeadsScreen} options={{ title: 'Leads' }} />
      {/*
        Punching is reached from the home card rather than the bar, but it stays
        a tab route: that is what lets a half-filled punch survive a trip to an
        order and back. The bar simply does not draw it.
      */}
      <Tabs.Screen name="PunchTab" component={PunchScreen} options={{ title: 'Punch' }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { user, loading } = useAuth();
  // A platform admin belongs to no workspace, so they get the control plane
  // rather than a shop's screens.
  const isPlatform = Boolean(user?.isPlatform);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <Loader />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {/* Above every screen, for as long as the session lasts. */}
      <SupportBanner />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
          animation: 'slide_from_right',
        }}>
        {user && isPlatform ? (
          <Stack.Screen name="Tenants" component={TenantsScreen} />
        ) : user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            <Stack.Screen name="OrderPhotos" component={OrderPhotosScreen} />
            <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
            <Stack.Screen name="LeadCreate" component={LeadCreateScreen} />
            <Stack.Screen name="LeadConvert" component={LeadConvertScreen} />
            <Stack.Screen name="Board" component={BoardScreen} />
            <Stack.Screen name="LeadBoard" component={LeadBoardScreen} />
            <Stack.Screen name="ArchivedLeads" component={ArchivedLeadsScreen} />
            <Stack.Screen name="Clients" component={ClientsScreen} />
            <Stack.Screen name="ClientDetail" component={ClientDetailScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Admin" component={AdminHomeScreen} />
            <Stack.Screen name="AdminMaterials" component={AdminMaterialsScreen} />
            <Stack.Screen name="AdminSizes" component={AdminSizesScreen} />
            <Stack.Screen name="AdminFlow" component={AdminFlowScreen} />
            <Stack.Screen name="FlowCanvas" component={FlowCanvasScreen} />
            <Stack.Screen name="MainCard" component={MainCardScreen} />
            <Stack.Screen name="AdminLeadFields" component={AdminLeadFieldsScreen} />
            <Stack.Screen name="Payments" component={PaymentsScreen} />
            <Stack.Screen name="Transactions" component={TransactionsScreen} />
            <Stack.Screen name="Disbursements" component={DisbursementsScreen} />
            <Stack.Screen name="DisbursementLedger" component={DisbursementLedgerScreen} />
            <Stack.Screen name="Expenses" component={ExpensesScreen} />
            <Stack.Screen name="ExpenseForm" component={ExpenseFormScreen} />
            <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} />
            <Stack.Screen name="ExpenseAnalytics" component={ExpenseAnalyticsScreen} />
            <Stack.Screen name="AdminExpenseOptions" component={AdminExpenseOptionsScreen} />
            <Stack.Screen name="AdminRoles" component={AdminRolesScreen} />
            <Stack.Screen name="AdminLetterTemplates" component={AdminLetterTemplatesScreen} />
            <Stack.Screen name="EmployeeLetters" component={EmployeeLettersScreen} />
            <Stack.Screen name="Vendors" component={VendorsScreen} />
            <Stack.Screen name="VendorDetail" component={VendorDetailScreen} />
            <Stack.Screen name="Purchases" component={PurchasesScreen} />
            <Stack.Screen name="PurchaseEdit" component={PurchaseEditScreen} />
            <Stack.Screen name="PurchaseDetail" component={PurchaseDetailScreen} />
            <Stack.Screen name="Stock" component={StockScreen} />
            <Stack.Screen name="StockMoves" component={StockMovesScreen} />
            <Stack.Screen name="Waste" component={WasteScreen} />
            <Stack.Screen name="Employees" component={EmployeesScreen} />
            <Stack.Screen name="EmployeeForm" component={EmployeeFormScreen} />
            <Stack.Screen name="EmployeeDetail" component={EmployeeDetailScreen} />
            <Stack.Screen name="Attendance" component={AttendanceScreen} />
            <Stack.Screen name="AttendanceMonth" component={AttendanceMonthScreen} />
            <Stack.Screen name="Salary" component={SalaryScreen} />
            <Stack.Screen name="SalaryRun" component={SalaryRunScreen} />
            <Stack.Screen name="PayStructures" component={PayStructuresScreen} />
            <Stack.Screen name="SalaryAdvances" component={SalaryAdvancesScreen} />
            <Stack.Screen name="FirmProfile" component={FirmProfileScreen} />
            <Stack.Screen name="Estimates" component={EstimatesScreen} />
            <Stack.Screen name="EstimateEdit" component={EstimateEditScreen} />
            <Stack.Screen name="EstimateDetail" component={EstimateDetailScreen} />
            <Stack.Screen name="ClientFirm" component={ClientFirmScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
