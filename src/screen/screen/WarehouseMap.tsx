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

const getFormattedDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const WarehouseMap: React.FC<Props> = ({ navigation }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingGrid, setLoadingGrid] = useState<boolean>(false);
    
    // 0: Pilih WH, 1: POV Warehouse (Sub), 2: POV Sub (Bin), 3: POV Bin (Pallet)
    const [zoomLevel, setZoomLevel] = useState<number>(0); 

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

    const { regularSubs, inboundStagings, outboundStagings, gates } = useMemo(() => {
        const regular: any[] = [];
        const inbound: any[] = [];
        const outbound: any[] = [];
        const gateList: any[] = [];

        subWarehouses.forEach(sub => {
            if (sub.is_gate) {
                gateList.push(sub);
            } else if (sub.is_staging === 'INBOUND') {
                inbound.push(sub);
            } else if (sub.is_staging === 'OUTBOUND') {
                outbound.push(sub);
            } else {
                // Jika bukan staging dan bukan gate, masuk ke Sub-Warehouse biasa (Kuning)
                regular.push(sub);
            }
        });

        return { regularSubs: regular, inboundStagings: inbound, outboundStagings: outbound, gates: gateList };
    }, [subWarehouses]);

    // --- COLOR PALETTE ---
    const COLORS = {
        warehouse: '#5A9BD5', // Biru
        sub: '#FDE282',       // Kuning Terang (Sub-Warehouse)
        bin: '#E6C653',       // Kuning Gelap/Border (Bin)
        pallet: '#6235B0',    // Ungu
        staging: '#70AD47',   // Hijau
        gate: '#FF0000'       // Merah
    };

    useEffect(() => {
        fetchCurrentWeek();
        fetchWarehouses();
    }, []);

    const fetchCurrentWeek = async () => {
        try {
            const todayStr = getFormattedDate(new Date());
            const res = await ConstantService.getWeekProduction(todayStr);
            const weekNum = Number(res?.data?.[0]?.MINGGU) || 0;
            setCurrentWeek(weekNum);
        } catch (err) {
            console.log("Gagal memuat current week", err);
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
        setZoomLevel(1); // Masuk POV Warehouse
        
        if (allSubWarehouses) {
            setSubWarehouses(allSubWarehouses.filter(sub => sub.warehouse_id === wh.id));
            return;
        }
        try {
            setLoading(true);
            const res = await ConstantService.getSubWarehouse();
            setAllSubWarehouses(res.data);
            setSubWarehouses(res.data.filter((sub: any) => sub.warehouse_id === wh.id));
        } catch (err) {
            Alert.alert("Error", "Gagal mengambil data Sub Warehouse");
            setZoomLevel(0);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSub = async (sub: any) => {
        setSelectedSub(sub);
        setZoomLevel(2); // Masuk POV Sub-Warehouse

        if (allBins) {
            setBins(allBins.filter(b => b.warehouse_sub_id === sub.id));
            return;
        }
        try {
            setLoading(true);
            const res = await ConstantService.getWarehouseBin();
            setAllBins(res.data);
            setBins(res.data.filter((b: any) => b.warehouse_sub_id === sub.id));
        } catch (err) {
            Alert.alert("Error", "Gagal mengambil data Bin");
            setZoomLevel(1);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectBin = async (bin: any, forceRefresh = false) => {
        setSelectedBin(bin);
        setZoomLevel(3); // Masuk POV Bin (Lihat Pallet)

        const cacheKey = `${selectedSub.id}-${bin.id}`;
        setBinInfo({
            capacity: bin.capacity_pallet || 138,
            name: bin.name,
            zone: selectedSub.name,
            warehouseName: selectedWarehouse.name,
        });

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
                const parsedItems: PalletContent[] = currentItems.map((it: any) => ({
                    item_name: it.item_name || 'Unknown Item',
                    qty: it.current_quantity || 0,
                    uom: it.uom || '-',
                    week: it.week_number || palletData.currentWeekNumber || 0,
                }));

                let oldestWeek = palletData.currentWeekNumber || 0;
                if (parsedItems.length > 0) oldestWeek = Math.min(...parsedItems.map((i) => i.week));

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

            setInventoryCache(prev => ({ ...prev, [cacheKey]: mappedPallets }));
            setPallets(mappedPallets);
        } catch (error) {
            Alert.alert("Error", "Gagal memuat data Inventory Pallet");
            setZoomLevel(2);
        } finally {
            setLoadingGrid(false);
        }
    };

    const gridData = useMemo<GridItem[]>(() => {
        let grid: GridItem[] = Array.from({ length: binInfo.capacity || 138 }, (_, i) => ({ slot_index: i, empty: true }));
        pallets.forEach((pallet) => {
            if (pallet.slot_index < (binInfo.capacity || 138)) grid[pallet.slot_index] = { ...pallet, empty: false };
        });
        return grid;
    }, [pallets, binInfo.capacity]);

    const getSeatColor = useCallback((item: GridItem): string => {
        if (item.empty) return '#E0E0E0'; // Kosong -> Abu-abu
        if (currentWeek > 0 && item.oldestWeek && currentWeek - item.oldestWeek >= 3) return '#FF8A80'; // Aging -> Merah
        if (!item.isFull) return '#FFD54F'; // Partial -> Kuning
        return COLORS.pallet; // Full -> Ungu
    }, [currentWeek]);

    const handlePressSeat = useCallback((item: GridItem) => {
        if (!item.empty) {
            setSelectedPallet(item);
            setModalVisible(true);
        }
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            {/* HEADER & BREADCRUMBS */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => zoomLevel === 0 ? navigation.goBack() : setZoomLevel(zoomLevel - 1)}>
                    <Text style={styles.backBtn}>{'< Kembali'}</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Helicopter View</Text>
                
                <View style={styles.breadcrumbContainer}>
                    <TouchableOpacity onPress={() => setZoomLevel(0)}><Text style={[styles.breadcrumbText, zoomLevel === 0 && styles.breadcrumbActive]}>Semua WH</Text></TouchableOpacity>
                    {zoomLevel >= 1 && selectedWarehouse && (<TouchableOpacity onPress={() => setZoomLevel(1)}><Text style={[styles.breadcrumbText, zoomLevel === 1 && styles.breadcrumbActive]}>{' > '}{selectedWarehouse.name}</Text></TouchableOpacity>)}
                    {zoomLevel >= 2 && selectedSub && (<TouchableOpacity onPress={() => setZoomLevel(2)}><Text style={[styles.breadcrumbText, zoomLevel === 2 && styles.breadcrumbActive]}>{' > '}{selectedSub.name}</Text></TouchableOpacity>)}
                    {zoomLevel === 3 && selectedBin && (<Text style={[styles.breadcrumbText, styles.breadcrumbActive]}>{' > '}{selectedBin.name}</Text>)}
                </View>
            </View>

            <View style={styles.contentArea}>
                {loading && zoomLevel < 3 && <ActivityIndicator size="large" color="#4A90E2" style={{ marginTop: 20 }} />}

                {/* --- LEVEL 0: PILIH WAREHOUSE --- */}
                {!loading && zoomLevel === 0 && (
                    <FlatList
                        data={warehouses}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.boxCard} onPress={() => handleSelectWarehouse(item)}>
                                <Text style={styles.boxIcon}>🏢</Text>
                                <Text style={styles.boxText}>{item.name}</Text>
                            </TouchableOpacity>
                        )}
                        contentContainerStyle={styles.listPadding}
                    />
                )}

                
                {/* --- LEVEL 1: POV WAREHOUSE (BLUE MAP) --- */}
                {!loading && zoomLevel === 1 && (
                    <View style={[styles.warehouseMap, { backgroundColor: COLORS.warehouse }]}>
                        
                        {/* KIRI: INBOUND & REGULAR SUB-WAREHOUSE */}
                        <View style={styles.mapLeftSection}>
                            
                            {/* Area Inbound Staging (Atas) */}
                            {inboundStagings.length > 0 && (
                                <View style={styles.inboundSection}>
                                    <Text style={styles.sectionTitle}>INBOUND STAGING</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {inboundStagings.map((sub) => (
                                            <TouchableOpacity 
                                                key={sub.id} 
                                                style={[styles.inboundBox, { backgroundColor: '#FFB74D' }]} 
                                                onPress={() => handleSelectSub(sub)}
                                            >
                                                <Text style={styles.subText}>{sub.code || sub.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}

                            {/* Area Storage / Sub-Warehouse Biasa (Kuning) */}
                            <Text style={[styles.sectionTitle, { marginTop: inboundStagings.length > 0 ? 10 : 0 }]}>STORAGE ZONE</Text>
                            <ScrollView contentContainerStyle={styles.subGrid}>
                                {regularSubs.map((sub) => (
                                    <TouchableOpacity 
                                        key={sub.id} 
                                        style={[styles.subBox, { backgroundColor: COLORS.sub }]} 
                                        onPress={() => handleSelectSub(sub)}
                                    >
                                        <Text style={styles.subText}>{sub.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                   
                        {/* KANAN: STAGING OUTBOUND (HIJAU) & GATE (MERAH) */}
                  
                        <View style={styles.mapRightSection}>
                            
                           {/* Kolom 1: STAGING OUTBOUND (Hijau) */}
                            <View style={styles.stagingColumn}>
                                {outboundStagings.map((stg) => (
                                    <TouchableOpacity 
                                        key={stg.id}
                                        style={[styles.stagingBox, { backgroundColor: COLORS.staging }]}
                                        onPress={() => handleSelectSub(stg)}
                                    >
                                        <Text style={[styles.stagingText, { transform: [{ rotate: '-90deg' }], width: 100, textAlign: 'center' }]}>
                                            {stg.code || stg.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Kolom 2: GATE (Merah) di ujung kanan */}
                            <View style={styles.gateColumn}>
                                {gates.map((gate) => (
                                    <TouchableOpacity 
                                        key={gate.id}
                                        style={[styles.gateBox, { backgroundColor: COLORS.gate }]}
                                        onPress={() => handleSelectSub(gate)}
                                    >
                                        <Text style={[styles.stagingText, { fontSize: 10, transform: [{ rotate: '-90deg' }], width: 60, textAlign: 'center' }]}>
                                            {gate.code || 'GATE'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                        </View>

                    </View>
                )}

                {/* --- LEVEL 2: POV SUB-WAREHOUSE (INSIDE YELLOW BOX) --- */}
                {!loading && zoomLevel === 2 && (
                    <View style={styles.zoomSubContainer}>
                        <Text style={styles.zoomTitle}>Area: {selectedSub.name}</Text>
                        <ScrollView contentContainerStyle={styles.binsGridWrapper}>
                            {bins.map((bin) => (
                                <TouchableOpacity key={bin.id} style={styles.binDetailBox} onPress={() => handleSelectBin(bin)}>
                                    <Text style={styles.binDetailIcon}>📦</Text>
                                    <Text style={styles.binDetailText}>{bin.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* --- LEVEL 3: POV BIN (PALLET GRID - UNGU) --- */}
                {zoomLevel === 3 && (
                    loadingGrid ? (
                        <ActivityIndicator size="large" color={COLORS.pallet} style={{ marginTop: 50 }} />
                    ) : (
                        <View style={styles.zoomBinContainer}>
                            <View style={styles.infoBar}>
                                <Text style={styles.subtitle}>Rak: {selectedBin.name} | Kapasitas: {binInfo.capacity}</Text>
                                <TouchableOpacity onPress={() => handleSelectBin(selectedBin, true)}><Text style={styles.refreshBtn}>🔄 Refresh</Text></TouchableOpacity>
                            </View>
                            
                            <View style={styles.legendContainer}>
                                <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: COLORS.pallet }]} /><Text style={styles.legendText}>Full</Text></View>
                                <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#FFD54F' }]} /><Text style={styles.legendText}>Partial</Text></View>
                                <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#FF8A80' }]} /><Text style={styles.legendText}>Aging</Text></View>
                                <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#E0E0E0' }]} /><Text style={styles.legendText}>Empty</Text></View>
                            </View>

                            <FlatList
                                data={gridData}
                                keyExtractor={(item) => item.slot_index.toString()}
                                numColumns={5}
                                contentContainerStyle={styles.palletGridContent}
                                renderItem={({ item }) => (
                                    <TouchableOpacity style={[styles.palletSeat, { backgroundColor: getSeatColor(item) }]} onPress={() => handlePressSeat(item)} activeOpacity={0.7}>
                                        <Text style={styles.palletSeatText}>{!item.empty && item.code ? item.code.slice(-3) : ''}</Text>
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    )
                )}
            </View>

            {/* --- MODAL DETAIL --- */}
            <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {selectedPallet && (
                            <>
                                <Text style={styles.modalTitle}>Detail Pallet</Text>
                                <View style={styles.divider} />
                                <Text style={styles.modalLabel}>Pallet ID: <Text style={styles.modalValue}>{selectedPallet.code}</Text></Text>
                                <Text style={styles.modalLabel}>Total Qty: <Text style={styles.modalValue}>{selectedPallet.totalQty} {selectedPallet.uom}</Text></Text>
                                <Text style={styles.modalLabel}>Oldest Week: <Text style={styles.modalValue}>W-{selectedPallet.oldestWeek}</Text></Text>

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
                                    ) : (<Text style={styles.itemDetail}>Pallet Kosong</Text>)}
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
    breadcrumbContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    breadcrumbText: { fontSize: 14, color: '#999', fontWeight: '500' },
    breadcrumbActive: { color: '#4A90E2', fontWeight: 'bold' },
    contentArea: { flex: 1 },
    listPadding: { padding: 15 },

    // Level 0: Box List
    boxCard: { flex: 1, backgroundColor: '#FFF', margin: 8, padding: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    boxIcon: { fontSize: 32, marginBottom: 10 },
    boxText: { fontSize: 16, fontWeight: 'bold', color: '#333', textAlign: 'center' },

    // Level 1: Warehouse Floor Plan
    warehouseMap: { flex: 1, flexDirection: 'row', margin: 10, borderWidth: 2, borderColor: '#4A86C6' },
    mapLeftSection: { flex: 2.5, padding: 10, borderRightWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
    subGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    subBox: { width: '48%', height: 120, marginBottom: 10, padding: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#D4B844', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },
    subText: { fontSize: 10, fontWeight: 'bold', color: '#826A14', textAlign: 'center' },
    stagingText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
   
    // Level 2: Sub-Warehouse (Bins)
    zoomSubContainer: { flex: 1, margin: 15, padding: 15, backgroundColor: '#FFFDE7', borderRadius: 12, borderWidth: 1, borderColor: '#FDE282' },
    zoomTitle: { fontSize: 18, fontWeight: 'bold', color: '#826A14', marginBottom: 15, textAlign: 'center' },
    binsGridWrapper: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    binDetailBox: { width: '30%', backgroundColor: '#FFF', padding: 15, marginBottom: 15, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E6C653', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
    binDetailIcon: { fontSize: 24, marginBottom: 5 },
    binDetailText: { fontSize: 14, fontWeight: 'bold', color: '#555', textAlign: 'center' },

    // Level 3: Bin (Pallets Grid)
    zoomBinContainer: { flex: 1 },
    infoBar: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FFF', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth:1, borderColor: '#EEE' },
    subtitle: { fontSize: 14, color: '#777', fontWeight: '500' },
    refreshBtn: { color: '#4A90E2', fontSize: 13, fontWeight: 'bold' },
    legendContainer: { flexDirection: 'row', justifyContent: 'space-evenly', marginVertical: 10, paddingHorizontal: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendBox: { width: 16, height: 16, borderRadius: 4, marginRight: 6 },
    legendText: { fontSize: 12, color: '#555' },
    palletGridContent: { alignItems: 'center', paddingBottom: 30 },
    palletSeat: { width: 50, height: 50, margin: 6, borderRadius: 8, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    palletSeatText: { fontSize: 10, fontWeight: 'bold', color: '#FFF' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFF', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    divider: { height: 1, backgroundColor: '#EEE', marginVertical: 12 },
    modalLabel: { fontSize: 14, color: '#777', marginBottom: 8 },
    modalValue: { fontSize: 16, fontWeight: '600', color: '#333' },
    closeButton: { marginTop: 24, backgroundColor: '#4A90E2', padding: 16, borderRadius: 12, alignItems: 'center' },
    closeButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    itemListContainer: { backgroundColor: '#F9F9F9', padding: 10, borderRadius: 8, maxHeight: 150 },
    itemRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
    itemDot: { fontSize: 16, color: '#4A90E2', marginRight: 8, marginTop: -2 },
    itemName: { fontSize: 14, fontWeight: '600', color: '#333' },
    itemDetail: { fontSize: 12, color: '#777' },
    inboundSection: {
        marginBottom: 10,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)'
    },
    inboundBox: {
        width: 80,
        height: 60,
        marginRight: 10,
        padding: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#E65100',
        borderRadius: 4,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 8,
        letterSpacing: 1
    },
    stagingGateWrapper: { 
        flexDirection: 'row', // Memastikan Staging di kiri, Gate di kanan
        alignItems: 'center', 
        justifyContent: 'flex-end', 
        height: '25%',
        marginBottom: 10
    },
  
    mapRightSection: { 
        flex: 1, 
        flexDirection: 'row', // Membagi area kanan jadi kiri-kanan
        paddingLeft: 10 
    },
    stagingColumn: {
        flex: 1,
        justifyContent: 'space-around',
        paddingVertical: 10,
        paddingRight: 10,
    },
    gateColumn: {
        width: 50, // Ruang khusus gate di ujung kanan
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        paddingVertical: 10,
    },
    stagingBox: { 
        width: 35, // Dibuat lebih besar dan tebal
        height: 80, // Tinggi lebih besar agar muat diklik
        flex: 1, // Otomatis mengisi tinggi yang tersedia
        marginVertical: 5,
        justifyContent: 'center', 
        alignItems: 'center', 
        borderWidth: 1, 
        borderColor: '#5A8F35',
        borderRadius: 4,
    },
    gateBox: { 
        width: 35, // Dibuat lebih besar dan tebal
        height: 80, // Tinggi lebih besar agar muat diklik
        marginVertical: 5,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1, 
        borderColor: '#CC0000',
        borderRadius: 2,
    },
});

export default WarehouseMap;