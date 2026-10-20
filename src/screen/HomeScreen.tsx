import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// 1. Terima props navigation
const HomeScreen = ({ navigation }: { navigation: any }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home Screen</Text>
      <View style={styles.menuContainer}>
        
        {/* 2. Tambahkan aksi navigasi pada onPress */}
        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={() => navigation.navigate('WarehouseMap')} 
        >
          <Text style={styles.menuText}>WMS Helicopter View</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={() => navigation.navigate('OtherScreen')} // Ganti dengan screen tujuan kedua
        >
          <Text style={styles.menuText}>Menu 2</Text>
        </TouchableOpacity>

      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 30,
  },
  menuContainer: {
    width: '100%',
  },
  menuButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  menuText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default HomeScreen;