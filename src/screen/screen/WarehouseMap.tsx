import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Modal,
    SafeAreaView,
    ActivityIndicator,
    Alert,
    ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import ConstantService from '../../services/constantService';

// --- TYPES & INTERFACES ---
export type RootStackParamList = {
    InboundList: undefined;
    WarehouseMap: { subId?: string; binId?: string };
    OtherScreen: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'WarehouseMap'>;

interface PalletContent {
    item_name: string;
    qty: number;
    uom: string;
    week: number;
}

interface PalletData {
    id: string;
    slot_index: number;
    code: string;
    isFull: boolean;
    oldestWeek: number;
    items: PalletContent[];
    totalQty: number;
    uom: string;
}

interface GridItem {
    slot_index: number;
    empty: boolean;
    id?: string;
    code?: string;
    isFull?: boolean;
    oldestWeek?: number;
    items?: PalletContent[];
    totalQty?: number;
    uom?: string;
}

interface BinInfo {
    capacity: number;
    name: string;
    zone: string;
    warehouseName: string;
}

// --- HELPER DATE ---
const getFormattedDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- KOMPONEN SEAT (MEMOIZED) ---
const SeatItem = React.memo(({ item, onPress, seatColor }: { item: GridItem, onPress: (item: GridItem) => void, seatColor: string }) => {
    return (
        <TouchableOpacity
            style={[styles.seat, { backgroundColor: seatColor }]}
            onPress={() => onPress(item)}
            activeOpacity={0.7}
        >
            <Text style={styles.seatText}>
                {item.empty || !item.code ? '' : item.code.slice(-3)}
            </Text>
        </TouchableOpacity>
    );
}, (prevProps, nextProps) => {
    return prevProps.item.id === nextProps.item.id && prevProps.seatColor === nextProps.seatColor;
});


const WarehouseMap: React.FC<Props> = ({ navigation }) => {
    // --- 1. STATE MANAGEMENT ---
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingGrid, setLoadingGrid] = useState<boolean>(false);

    // State baru untuk current week dari API
    const [currentWeek, setCurrentWeek] = useState<number>(0);

    const [allSubWarehouses, setAllSubWarehouses] = useState<any[] | null>(null);
    const [allBins, setAllBins] = useState<any[] | null>(null);
    const [inventoryCache, setInventoryCache] = useState<Record<string, PalletData[]>>({});

    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [subWarehouses, setSubWarehouses] = useState<any[]>([]);
    const [bins, setBins] = useState<any[]>([]);

    const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);
    const [selectedSub, setSelectedSub] = useState<any>(null);
    const [selectedBin, setSelectedBin] = useState<any>(null);

    const [pallets, setPallets] = useState<PalletData[]>([]);
    const [binInfo, setBinInfo] = useState<BinInfo>({ capacity: 0, name: '', zone: '', warehouseName: '' });

    const [selectedPallet, setSelectedPallet] = useState<GridItem | null>(null);
    const [modalVisible, setModalVisible] = useState<boolean>(false);

    // --- 2. EFFECT (Panggil API saat pertama mount) ---
    useEffect(() => {
        fetchCurrentWeek();
        fetchWarehouses();
    }, []);

    // --- 3. FETCH DATA FUNCTIONS ---
    const fetchCurrentWeek = async () => {
        try {
            const todayStr = getFormattedDate(new Date());
            const res = await ConstantService.getWeekProduction(todayStr);

            // Sesuaikan pembacaan response berdasarkan struktur JSON API master-week Anda.
            // Jika res.data mengembalikan angka langsung, atau { week_number: 46 }
            const weekNum = Number(res?.data?.[0]?.MINGGU) || 0;
            setCurrentWeek(weekNum);
        } catch (err) {
            console.log("Gagal memuat current week dari API", err);
        }
    };

    const fetchWarehouses = async () => {
        try {
            setLoading(true);
            const res = await ConstantService.getWarehouse();
            if (res.data) setWarehouses(res.data);
        } catch (err) {
            Alert.alert("Error", "Gagal mengambil data Warehouse");
        } finally {
            setLoading(false);
        }
    };
    const handleSelectWarehouse = async (wh: any) => {
        setSelectedWarehouse(wh);
        setSelectedSub(null);
        setSelectedBin(null);
        setPallets([]);

        // CEK CACHE: Jika data semua sub-warehouse sudah pernah di-load, langsung filter saja
        if (allSubWarehouses) {
            setSubWarehouses(allSubWarehouses.filter(sub => sub.warehouse_id === wh.id));
            return;
        }

        try {
            setLoading(true);
            const res = await ConstantService.getSubWarehouse();
            setAllSubWarehouses(res.data); // Simpan semua ke cache
            setSubWarehouses(res.data.filter((sub: any) => sub.warehouse_id === wh.id)); // Tampilkan yang sesuai
        } catch (err) {
            Alert.alert("Error", "Gagal mengambil data Sub Warehouse");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSub = async (sub: any) => {
        setSelectedSub(sub);
        setSelectedBin(null);
        setPallets([]);

        // CEK CACHE: Jika data semua bin sudah pernah di-load
        if (allBins) {
            setBins(allBins.filter(b => b.warehouse_sub_id === sub.id));
            return;
        }

        try {
            setLoading(true);
            const res = await ConstantService.getWarehouseBin(); // Pastikan API ini ada di service
            setAllBins(res.data); // Simpan semua ke cache
            setBins(res.data.filter((b: any) => b.warehouse_sub_id === sub.id));
        } catch (err) {
            Alert.alert("Error", "Gagal mengambil data Bin");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectBin = async (bin: any, forceRefresh = false) => {
        setSelectedBin(bin);
        const cacheKey = `${selectedSub.id}-${bin.id}`;

        setBinInfo({
            capacity: bin.capacity_pallet || 138,
            name: bin.name,
            zone: selectedSub.name,
            warehouseName: selectedWarehouse.name,
        });

        // CEK CACHE: Jika grid ini sudah pernah dibuka dan tidak sedang memaksa refresh
        if (!forceRefresh && inventoryCache[cacheKey]) {
            setPallets(inventoryCache[cacheKey]);
            return;
        }

        try {
            setLoadingGrid(true);
            const response = await ConstantService.getInventoryTracking(selectedSub.id, bin.id);
            const trackingData: any[] = response.data || [];

            const mappedPallets: PalletData[] = trackingData.map((item, index) => {
                const palletData = item.pallet;
                const currentItems: any[] = palletData.currentItems || [];

                // 1. Mapping seluruh isi item ke format array baru
                const parsedItems: PalletContent[] = currentItems.map((it: any) => ({
                    item_name: it.item_name || 'Unknown Item',
                    qty: it.current_quantity || 0,
                    uom: it.uom || '-',
                    week: it.week_number || palletData.currentWeekNumber || 0,
                }));

                // 2. Cari Week Paling Tua (Terkecil) untuk logic FIFO (AI Suggestion)
                // Jika pallet kosong, gunakan week bawaan pallet
                let oldestWeek = palletData.currentWeekNumber || 0;
                if (parsedItems.length > 0) {
                    oldestWeek = Math.min(...parsedItems.map((i) => i.week));
                }

                return {
                    id: item.id,
                    slot_index: index,
                    code: palletData.pallet_code || 'Unknown',
                    isFull: palletData.isFull || false,
                    oldestWeek: oldestWeek,
                    items: parsedItems,
                    totalQty: palletData.currentQuantity || 0,
                    uom: palletData.uom || '-',
                };
            });

            // Simpan data mapping ke dalam Dictionary Cache
            setInventoryCache(prev => ({ ...prev, [cacheKey]: mappedPallets }));
            setPallets(mappedPallets);
        } catch (error) {
            Alert.alert("Error", "Gagal memuat data Inventory Pallet");
        } finally {
            setLoadingGrid(false);
        }
    };

    // 3. SEMUA useMemo HARUS DI SINI (Jangan diletakkan di bawah IF)
    const gridData = useMemo<GridItem[]>(() => {
        let grid: GridItem[] = Array.from({ length: binInfo.capacity }, (_, i) => ({
            slot_index: i,
            empty: true,
        }));
        pallets.forEach((pallet) => {
            if (pallet.slot_index < binInfo.capacity) {
                grid[pallet.slot_index] = { ...pallet, empty: false };
            }
        });
        return grid;
    }, [pallets, binInfo.capacity]);

    // Ganti p.week menjadi p.oldestWeek
    const aiSuggestions = useMemo<PalletData[]>(() => {
        if (!currentWeek) return []; // Jangan beri saran jika currentWeek belum diload
        return pallets.filter((p) => currentWeek - 38 >= 3);
    }, [pallets, currentWeek]); // Masukkan currentWeek ke dependency

    const getSeatColor = useCallback((item: GridItem): string => {
        if (item.empty) return '#E0E0E0';
        if (currentWeek > 0 && item.oldestWeek && currentWeek - item.oldestWeek >= 3) return '#FF8A80';
        if (!item.isFull) return '#FFD54F';
        return '#81C784';
    }, [currentWeek]); // Masukkan currentWeek ke dependency

    const handlePressSeat = useCallback((item: GridItem) => {
        if (!item.empty) {
            setSelectedPallet(item);
            setModalVisible(true);
        }
    }, []);

    const renderSeat = useCallback(({ item }: { item: GridItem }) => (
        <SeatItem
            item={item}
            onPress={handlePressSeat}
            seatColor={getSeatColor(item)}
        />
    ), [handlePressSeat]); // Menambahkan dependency

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.backBtn}>{'< Kembali'}</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Helicopter View</Text>
               
            </View>
            <View style={styles.filterSection}>
                {loading && <ActivityIndicator size="small" color="#4A90E2" style={{ marginBottom: 10 }} />}

                <Text style={styles.filterLabel}>1. Pilih Warehouse</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                    {warehouses.map((wh) => (
                        <TouchableOpacity key={wh.id} style={[styles.chip, selectedWarehouse?.id === wh.id && styles.chipActive]} onPress={() => handleSelectWarehouse(wh)}>
                            <Text style={[styles.chipText, selectedWarehouse?.id === wh.id && styles.chipTextActive]}>{wh.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {selectedWarehouse && subWarehouses.length > 0 && (
                    <>
                        <Text style={styles.filterLabel}>2. Pilih Sub-Warehouse / Zone</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                            {subWarehouses.map((sub) => (
                                <TouchableOpacity key={sub.id} style={[styles.chip, selectedSub?.id === sub.id && styles.chipActive]} onPress={() => handleSelectSub(sub)}>
                                    <Text style={[styles.chipText, selectedSub?.id === sub.id && styles.chipTextActive]}>{sub.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </>
                )}

                {selectedSub && bins.length > 0 && (
                    <>
                        <Text style={styles.filterLabel}>3. Pilih Bin</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                            {bins.map((bin) => (
                                <TouchableOpacity key={bin.id} style={[styles.chip, selectedBin?.id === bin.id && styles.chipActive]} onPress={() => handleSelectBin(bin)}>
                                    <Text style={[styles.chipText, selectedBin?.id === bin.id && styles.chipTextActive]}>{bin.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </>
                )}
            </View>

            {selectedBin ? (
                loadingGrid ? (
                    <ActivityIndicator size="large" color="#4A90E2" style={{ marginTop: 50 }} />
                ) : (
                    <>
                        <View style={styles.infoBar}>
                            <Text style={styles.subtitle}>Zone: {binInfo.zone} - {binInfo.name} | Kapasitas: {binInfo.capacity}</Text>

                            {/* TOMBOL REFRESH AGAR BISA MEMAKSA UPDATE DATA */}
                            <TouchableOpacity onPress={() => handleSelectBin(selectedBin, true)}>
                                <Text style={styles.refreshBtn}>🔄 Refresh Data</Text>
                            </TouchableOpacity>
                        </View>

                        {aiSuggestions.length > 0 && (
                            <View style={styles.aiBox}>
                                <Text style={styles.aiTitle}>🤖 Smart AI Suggestion</Text>
                                <Text style={styles.aiText}>
                                    Ditemukan {aiSuggestions.length} pallet dengan week lama (&gt 3 minggu). Prioritaskan slot warna merah!
                                </Text>
                            </View>
                        )}

                        <View style={styles.legendContainer}>
                            <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#81C784' }]} /><Text style={styles.legendText}>Full</Text></View>
                            <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#FFD54F' }]} /><Text style={styles.legendText}>Partial</Text></View>
                            <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#FF8A80' }]} /><Text style={styles.legendText}>Aging</Text></View>
                            <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#E0E0E0' }]} /><Text style={styles.legendText}>Empty</Text></View>
                        </View>

                        <View style={styles.gridContainer}>
                            <FlatList
                                data={gridData}
                                renderItem={renderSeat}
                                keyExtractor={(item) => item.slot_index.toString()}
                                numColumns={5}
                                contentContainerStyle={styles.flatListContent}
                                showsVerticalScrollIndicator={false}
                            />
                        </View>
                    </>
                )
            ) : (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>Silakan pilih Warehouse, Zone, dan Bin terlebih dahulu.</Text>
                </View>
            )}

            {/* --- MODAL DETAIL (Sama seperti sebelumnya) --- */}
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

                                <Text style={styles.modalLabel}>Pallet ID: <Text style={styles.modalValue}>{selectedPallet.code}</Text></Text>
                                <Text style={styles.modalLabel}>Total Qty: <Text style={styles.modalValue}>{selectedPallet.totalQty} {selectedPallet.uom}</Text></Text>
                                <Text style={styles.modalLabel}>Oldest Week: <Text style={styles.modalValue}>W-{selectedPallet.oldestWeek}</Text></Text>

                                {selectedPallet.oldestWeek && (currentWeek - selectedPallet.oldestWeek >= 3) && (
                                    <Text style={styles.warningText}>⚠️ AI: Umur barang melewati batas normal. Segera lakukan picking.</Text>
                                )}

                                {/* Looping untuk menampilkan banyak item di dalam 1 pallet */}
                                <Text style={[styles.modalLabel, { marginTop: 15, fontWeight: 'bold', color: '#333' }]}>Daftar Isi Item:</Text>
                                <View style={styles.itemListContainer}>
                                    {selectedPallet.items && selectedPallet.items.length > 0 ? (
                                        selectedPallet.items.map((it, idx) => (
                                            <View key={idx} style={styles.itemRow}>
                                                <Text style={styles.itemDot}>•</Text>
                                                <View>
                                                    <Text style={styles.itemName}>{it.item_name}</Text>
                                                    <Text style={styles.itemDetail}>{it.qty} {it.uom} | Week: {it.week}</Text>
                                                </View>
                                            </View>
                                        ))
                                    ) : (
                                        <Text style={styles.itemDetail}>Pallet Kosong</Text>
                                    )}
                                </View>

                                <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
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
    subtitle: { fontSize: 14, color: '#777', fontWeight: '500' },

    // Styles untuk Selector (Chips)
    filterSection: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EEE' },
    filterLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 5 },
    chipContainer: { flexDirection: 'row', marginBottom: 15 },
    chip: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F0F0F0', borderRadius: 20, marginRight: 10 },
    chipActive: { backgroundColor: '#4A90E2' },
    chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
    chipTextActive: { color: '#FFF', fontWeight: 'bold' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    emptyStateText: { color: '#999', fontSize: 15, textAlign: 'center' },

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
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    seatText: { fontSize: 10, fontWeight: 'bold', color: '#333' },

    infoBar: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    refreshBtn: { color: '#4A90E2', fontSize: 13, fontWeight: 'bold' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    divider: { height: 1, backgroundColor: '#EEE', marginVertical: 12 },
    modalLabel: { fontSize: 14, color: '#777', marginBottom: 8 },
    modalValue: { fontSize: 16, fontWeight: '600', color: '#333' },
    warningText: { marginTop: 16, color: '#D32F2F', fontSize: 14, fontWeight: 'bold', backgroundColor: '#FFEBEE', padding: 10, borderRadius: 8 },
    closeButton: { marginTop: 24, backgroundColor: '#4A90E2', padding: 16, borderRadius: 12, alignItems: 'center' },
    closeButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    itemListContainer: { backgroundColor: '#F9F9F9', padding: 10, borderRadius: 8, maxHeight: 150 },
    itemRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
    itemDot: { fontSize: 16, color: '#4A90E2', marginRight: 8, marginTop: -2 },
    itemName: { fontSize: 14, fontWeight: '600', color: '#333' },
    itemDetail: { fontSize: 12, color: '#777' },
});

export default WarehouseMap;