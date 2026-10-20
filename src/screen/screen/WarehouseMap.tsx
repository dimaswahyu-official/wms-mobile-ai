import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  SafeAreaView,
} from 'react-native';

// --- 1. MOCK DATA (Simulasi Gabungan 4 API) ---
// Asumsi Bin memiliki kapasitas 35 slot.
const BIN_CAPACITY = 35;
const CURRENT_WEEK = 46; // Simulasi minggu berjalan untuk logic AI FIFO

const mockPallets = [
  { id: 1, slot_index: 2, code: 'CWH-001', isFull: true, week: 45, item: 'ARB16', qty: 30 },
  { id: 2, slot_index: 3, code: 'CWH-002', isFull: false, week: 46, item: 'ARB16', qty: 15 },
  // Pallet dengan week lama (42) -> Akan di-flag oleh AI
  { id: 3, slot_index: 10, code: 'CWH-003', isFull: true, week: 42, item: 'ARB16', qty: 30 }, 
  { id: 4, slot_index: 11, code: 'CWH-004', isFull: true, week: 45, item: 'ARB16', qty: 30 },
  { id: 5, slot_index: 24, code: 'CWH-005', isFull: false, week: 42, item: 'ARB16', qty: 10 },
];

type NavigationProp = StackNavigationProp<any, 'WarehouseMap'>;

const WarehouseMap = ({ navigation:any }: { navigation: any }) => {
  const [selectedPallet, setSelectedPallet] = useState(null) as [any, any];
  const [modalVisible, setModalVisible] = useState(false);
  const navigation = useNavigation<NavigationProp>();

  // --- 2. LOGIC DATA PREPARATION & AI ---
  // Membuat array kosong sebanyak kapasitas bin
  const gridData = useMemo(() => {
    let grid = Array.from({ length: BIN_CAPACITY }, (_, i) => ({
      slot_index: i,
      empty: true,
    }));

    // Memasukkan data pallet ke slot yang sesuai
    mockPallets.forEach((pallet) => {
      grid[pallet.slot_index] = { ...pallet, empty: false };
    });

    return grid;
  }, []);

  // AI Logic: Mencari pallet dengan umur > 3 minggu
  const aiSuggestions = useMemo(() => {
    return mockPallets.filter((p) => CURRENT_WEEK - p.week >= 3);
  }, []);

  // Fungsi penentuan warna kursi (Modern Minimalist Pastels)
  const getSeatColor = (item:any) => {
    if (item.empty) return '#E0E0E0'; // Abu-abu (Kosong)
    if (CURRENT_WEEK - item.week >= 3) return '#FF8A80'; // Merah Pastel (Aging / AI Flag)
    if (!item.isFull) return '#FFD54F'; // Kuning/Oranye (Belum Penuh)
    return '#81C784'; // Hijau Pastel (Penuh & Normal)
  };

  // --- 3. RENDERERS ---
  const handlePressSeat = (item:any) => {
    if (!item.empty) {
      setSelectedPallet(item);
      setModalVisible(true);
    }
  };

  const renderSeat = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.seat, { backgroundColor: getSeatColor(item) }]}
      onPress={() => handlePressSeat(item)}
      activeOpacity={0.7}
    >
      <Text style={styles.seatText}>{item.empty ? '' : item.code.slice(-3)}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Info */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>{'< Kembali'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Zone: JT06 - BIN A</Text>
        <Text style={styles.subtitle}>GD-RK-PRE (Kapasitas: {BIN_CAPACITY})</Text>
      </View>

      {/* AI Suggestion Box */}
      {aiSuggestions.length > 0 && (
        <View style={styles.aiBox}>
          <Text style={styles.aiTitle}>🤖 Smart AI Suggestion</Text>
          <Text style={styles.aiText}>
            Ditemukan {aiSuggestions.length} pallet dengan week lama ({' '}
            {CURRENT_WEEK - 3}). Prioritaskan slot warna merah bata untuk
            menghindari dead stock!
          </Text>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#81C784' }]} /><Text style={styles.legendText}>Full</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#FFD54F' }]} /><Text style={styles.legendText}>Partial</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#FF8A80' }]} /><Text style={styles.legendText}>Aging</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#E0E0E0' }]} /><Text style={styles.legendText}>Empty</Text></View>
      </View>

      {/* Cinema Seat Grid */}
      <View style={styles.gridContainer}>
        <FlatList
          data={gridData}
          renderItem={renderSeat}
          keyExtractor={(item) => item.slot_index.toString()}
          numColumns={5} // Membagi menjadi 5 kolom seperti kursi bioskop
          contentContainerStyle={styles.flatListContent}
        />
      </View>

      {/* Modal Detail Pallet */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedPallet && (
              <>
                <Text style={styles.modalTitle}>Detail Pallet</Text>
                <View style={styles.divider} />
                <Text style={styles.modalLabel}>ID: <Text style={styles.modalValue}>{selectedPallet.code}</Text></Text>
                <Text style={styles.modalLabel}>Item: <Text style={styles.modalValue}>{selectedPallet.item}</Text></Text>
                <Text style={styles.modalLabel}>Quantity: <Text style={styles.modalValue}>{selectedPallet.qty} DUS</Text></Text>
                <Text style={styles.modalLabel}>Week Number: <Text style={styles.modalValue}>W-{selectedPallet.week}</Text></Text>
                
                {CURRENT_WEEK - selectedPallet.week >= 3 && (
                  <Text style={styles.warningText}>⚠️ AI: Segera keluarkan barang ini (FIFO).</Text>
                )}

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.closeButtonText}>Tutup</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { padding: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#F0F0F0' },
  backBtn: { color: '#4A90E2', fontSize: 16, marginBottom: 8, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#777', marginTop: 4 },
  
  aiBox: { margin: 16, padding: 16, backgroundColor: '#E3F2FD', borderRadius: 12, borderWidth: 1, borderColor: '#BBDEFB' },
  aiTitle: { fontSize: 16, fontWeight: 'bold', color: '#1565C0', marginBottom: 6 },
  aiText: { fontSize: 14, color: '#0D47A1', lineHeight: 20 },
  
  legendContainer: { flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 10, paddingHorizontal: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendBox: { width: 16, height: 16, borderRadius: 4, marginRight: 6 },
  legendText: { fontSize: 12, color: '#555' },
  
  gridContainer: { flex: 1, alignItems: 'center', marginTop: 10 },
  flatListContent: { paddingBottom: 30 },
  seat: {
    width: 50,
    height: 50,
    margin: 6,
    borderRadius: 8, // Rounded corners (Modern)
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  seatText: { fontSize: 10, fontWeight: 'bold', color: '#333' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  divider: { height: 1, backgroundColor: '#EEE', marginVertical: 12 },
  modalLabel: { fontSize: 14, color: '#777', marginBottom: 8 },
  modalValue: { fontSize: 16, fontWeight: '600', color: '#333' },
  warningText: { marginTop: 16, color: '#D32F2F', fontSize: 14, fontWeight: 'bold', backgroundColor: '#FFEBEE', padding: 10, borderRadius: 8 },
  closeButton: { marginTop: 24, backgroundColor: '#4A90E2', padding: 16, borderRadius: 12, alignItems: 'center' },
  closeButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});

export default WarehouseMap;