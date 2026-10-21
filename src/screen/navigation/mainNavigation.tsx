// src/navigation/AppNavigator.tsx

import React from 'react';
// Pastikan NavigationContainer sudah membungkus MainNavigator ini di App.js/App.tsx Anda
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../HomeScreen';
import { Text, View } from 'react-native';
import WarehouseMap from '../screen/WarehouseMap';

// Buat komponen dummy sementara untuk layar tujuan agar tidak error
const DummyScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text>Ini adalah layar tujuan</Text>
  </View>
);

const Stack = createNativeStackNavigator();

const MainNavigator = () => {
  return (
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName="InboundList">
        
        {/* Screen Utama */}
        <Stack.Screen name="InboundList" component={HomeScreen} />
        
        {/* Screen Tujuan yang dipanggil di onPress */}
        <Stack.Screen
          name="WarehouseMap"
          component={WarehouseMap as React.ComponentType<any>}
        />
        <Stack.Screen name="OtherScreen" component={DummyScreen} />
        
      </Stack.Navigator>
  );
};

export default MainNavigator;