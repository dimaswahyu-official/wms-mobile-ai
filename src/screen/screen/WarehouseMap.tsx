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
    
    // 0: Pilih WH, 1: POV Warehouse (Sub), 2: POV Sub (Bin), 3: POV Bin/Staging (Pallet)
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
                regular.push(sub);
            }
        });

        return { regularSubs: regular, inboundStagings: inbound, outboundStagings: outbound, gates: gateList };
    }, [subWarehouses]);

    // --- MODERN MINIMALIST COLOR PALETTE ---
    const COLORS = {
        warehouse: '#E0F2FE', // Soft Blue
        sub: '#FEF9C3',       // Soft Yellow
        bin: '#FEF08A',       // Vibrant Soft Yellow
        pallet: '#8B5CF6',    // Modern Purple
        staging: '#DCFCE7',   // Soft Mint Green
        gate: '#FEE2E2',      // Soft Blush Red
        textPrimary: '#1E293B',
        textSecondary: '#64748B',
    };

    useEffect(() => {
        fetchCurrentWeek();
        fetchWarehouses();
    }, []);

    // FUNGSI NAVIGASI BACK CERDAS
    const handleGoBack = () => {
        if (zoomLevel === 0) {
            navigation.goBack();
        } else if (zoomLevel === 3 && (selectedSub?.is_staging || selectedSub?.is_gate)) {
            // Jika sedang di Level 3 (Pallet) dan itu adalah Staging/Gate (tanpa Bin),
            // maka langsung kembali ke Level 1 (Floor Plan)
            setZoomLevel(1);
        } else {
            // Selain itu, mundur 1 level secara normal
            setZoomLevel(zoomLevel - 1);
        }
    };
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
        setZoomLevel(1); 
        
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

    // FUNGSI UNTUK MENGAMBIL DATA PALLET (DIPISAH AGAR BISA DIGUNAKAN BIN & STAGING)
    const fetchInventoryData = async (sub: any, bin: any = null, forceRefresh = false) => {
        const isStaging = !bin; // Jika tidak ada bin, berarti ini staging/gate
        const cacheKey = isStaging ? `${sub.id}-staging` : `${sub.id}-${bin.id}`;
        
        setBinInfo({
            capacity: (bin ? bin.capacity_pallet : sub.capacity_pallet) || 138, // Default ke 138 jika null
            name: bin ? bin.name : sub.name,
            zone: sub.name,
            warehouseName: selectedWarehouse.name,
        });

        if (!forceRefresh && inventoryCache[cacheKey]) {
            setPallets(inventoryCache[cacheKey]);
            return;
        }

        try {
            setLoadingGrid(true);
            // Jika staging, kita asumsikan binId dikosongkan (empty string) saat memanggil API
            const binIdParam = bin ? bin.id : ''; 
            const response = await ConstantService.getInventoryTracking(sub.id, binIdParam);
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
            setZoomLevel(isStaging ? 1 : 2); // Kembali ke layar sebelumnya jika gagal
        } finally {
            setLoadingGrid(false);
        }
    };

    // UPDATE LOGIKA KLIK SUB-WAREHOUSE
    const handleSelectSub = async (sub: any) => {
        setSelectedSub(sub);
        setSelectedBin(null);
        
        // 1. CEK JIKA INI STAGING ATAU GATE (TIDAK ADA BIN)
        if (sub.is_staging || sub.is_gate) {
            setZoomLevel(3); // Langsung lompat ke Grid Pallet
            fetchInventoryData(sub, null); // Jalankan fetch tanpa bin
            return;
        }

        // 2. JIKA STORAGE BIASA, MASUK KE LEVEL 2 (DAFTAR BIN)
        setZoomLevel(2); 

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

    // UPDATE LOGIKA KLIK BIN BIASA
    const handleSelectBin = (bin: any, forceRefresh = false) => {
        setSelectedBin(bin);
        setZoomLevel(3); 
        fetchInventoryData(selectedSub, bin, forceRefresh);
    };

    const gridData = useMemo<GridItem[]>(() => {
        let grid: GridItem[] = Array.from({ length: binInfo.capacity || 138 }, (_, i) => ({ slot_index: i, empty: true }));
        pallets.forEach((pallet) => {
            if (pallet.slot_index < (binInfo.capacity || 138)) grid[pallet.slot_index] = { ...pallet, empty: false };
        });
        return grid;
    }, [pallets, binInfo.capacity]);

    const getSeatColor = useCallback((item: GridItem): string => {
        if (item.empty) return '#F1F5F9'; // Soft Slate
        if (currentWeek > 0 && item.oldestWeek && currentWeek - item.oldestWeek >= 3) return '#FDA4AF'; // Soft Rose
        if (!item.isFull) return '#FDE047'; // Soft Yellow
        return COLORS.pallet; // Modern Purple
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
                <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
                    <Text style={styles.backBtnText}>← Kembali</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Helicopter View</Text>
                
                <View style={styles.breadcrumbContainer}>
                    <TouchableOpacity onPress={() => setZoomLevel(0)}>
                        <Text style={[styles.breadcrumbText, zoomLevel === 0 && styles.breadcrumbActive]}>Semua WH</Text>
                    </TouchableOpacity>
                    {zoomLevel >= 1 && selectedWarehouse && (
                        <TouchableOpacity onPress={() => setZoomLevel(1)}>
                            <Text style={[styles.breadcrumbText, zoomLevel === 1 && styles.breadcrumbActive]}> / {selectedWarehouse.name}</Text>
                        </TouchableOpacity>
                    )}
                    {zoomLevel >= 2 && selectedSub && (
                        <TouchableOpacity onPress={() => setZoomLevel(2)}>
                            <Text style={[styles.breadcrumbText, zoomLevel === 2 && styles.breadcrumbActive]}> / {selectedSub.name}</Text>
                        </TouchableOpacity>
                    )}
                    {/* Hanya tampilkan path Bin jika memang ada bin yang dipilih (Bukan staging) */}
                    {zoomLevel === 3 && selectedBin && (
                        <Text style={[styles.breadcrumbText, styles.breadcrumbActive]}> / {selectedBin.name}</Text>
                    )}
                </View>
            </View>

            <View style={styles.contentArea}>
                {loading && zoomLevel < 3 && <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />}

                {/* --- LEVEL 0: PILIH WAREHOUSE --- */}
                {!loading && zoomLevel === 0 && (
                    <FlatList
                        data={warehouses}
                        keyExtractor={(item) => item.id.toString()}
                        numColumns={2}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.boxCard} onPress={() => handleSelectWarehouse(item)} activeOpacity={0.8}>
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
                                    <Text style={styles.sectionTitle}>Inbound Staging</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {inboundStagings.map((sub) => (
                                            <TouchableOpacity 
                                                key={sub.id} 
                                                style={styles.inboundBox} 
                                                onPress={() => handleSelectSub(sub)}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={styles.inboundText}>{sub.code || sub.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}

                            {/* Area Storage / Sub-Warehouse Biasa (Kuning) */}
                            <Text style={[styles.sectionTitle, { marginTop: inboundStagings.length > 0 ? 12 : 0 }]}>Storage Zone</Text>
                            <ScrollView contentContainerStyle={styles.subGrid} showsVerticalScrollIndicator={false}>
                                {regularSubs.map((sub) => (
                                    <TouchableOpacity 
                                        key={sub.id} 
                                        style={[styles.subBox, { backgroundColor: COLORS.sub }]} 
                                        onPress={() => handleSelectSub(sub)}
                                        activeOpacity={0.8}
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
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.stagingText, { transform: [{ rotate: '-90deg' }], width: 80, textAlign: 'center' }]}>
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
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.gateText, { transform: [{ rotate: '-90deg' }], width: 60, textAlign: 'center' }]}>
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
                        <View style={styles.zoomHeader}>
                            <Text style={styles.zoomTitle}>{selectedSub.name}</Text>
                            <Text style={styles.zoomSubtitle}>Storage Area</Text>
                        </View>
                        <ScrollView contentContainerStyle={styles.binsGridWrapper} showsVerticalScrollIndicator={false}>
                            {bins.map((bin) => (
                                <TouchableOpacity key={bin.id} style={styles.binDetailBox} onPress={() => handleSelectBin(bin)} activeOpacity={0.8}>
                                    <View style={styles.binDetailIconWrapper}>
                                        <Text style={styles.binDetailIcon}>📦</Text>
                                    </View>
                                    <Text style={styles.binDetailText}>{bin.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* --- LEVEL 3: POV BIN / STAGING (PALLET GRID - UNGU) --- */}
                {zoomLevel === 3 && (
                    loadingGrid ? (
                        <ActivityIndicator size="large" color={COLORS.pallet} style={{ marginTop: 50 }} />
                    ) : (
                        <View style={styles.zoomBinContainer}>
                            <View style={styles.infoBar}>
                                <View>
                                    {/* Jika tidak ada bin (Staging), tampilkan nama sub-nya, jika ada tampilkan nama bin-nya */}
                                    <Text style={styles.infoBarTitle}>{binInfo.name}</Text>
                                    <Text style={styles.infoBarSubtitle}>Kapasitas: {binInfo.capacity} Pallet</Text>
                                </View>
                                {/* Tombol Refresh dijalankan sesuai dengan apakah data ini dari Bin atau dari Staging */}
                                <TouchableOpacity onPress={() => selectedBin ? handleSelectBin(selectedBin, true) : fetchInventoryData(selectedSub, null, true)} style={styles.refreshBtnContainer}>
                                    <Text style={styles.refreshBtn}>Refresh</Text>
                                </TouchableOpacity>
                            </View>
                            
                            <View style={styles.legendContainer}>
                                <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: COLORS.pallet }]} /><Text style={styles.legendText}>Full</Text></View>
                                <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#FDE047' }]} /><Text style={styles.legendText}>Partial</Text></View>
                                <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#FDA4AF' }]} /><Text style={styles.legendText}>Aging</Text></View>
                                <View style={styles.legendItem}><View style={[styles.legendBox, { backgroundColor: '#F1F5F9' }]} /><Text style={styles.legendText}>Empty</Text></View>
                            </View>

                          <FlatList
                                data={gridData}
                                keyExtractor={(item) => item.slot_index.toString()}
                                numColumns={4}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={styles.palletGridContent}
                                renderItem={({ item }) => {
                                    const bgColor = getSeatColor(item);
                                    const isPartial = bgColor === '#FDE047';
                                    const isGridEmpty = item.empty;
                                    const txtColor = (bgColor === '#FDE047' || bgColor === '#F1F5F9') ? '#334155' : '#FFFFFF';

                                    return (
                                        <TouchableOpacity 
                                            style={[
                                                styles.palletSeat, 
                                                { backgroundColor: bgColor },
                                                !isGridEmpty && styles.palletSeatActive // Tambahkan shadow hanya jika tidak kosong
                                            ]} 
                                            onPress={() => handlePressSeat(item)} 
                                            activeOpacity={0.7}
                                        >
                                            <Text 
                                                style={[styles.palletSeatText, { color: txtColor }]} 
                                                numberOfLines={1} 
                                                adjustsFontSizeToFit
                                            >
                                                {!isGridEmpty && item.code ? item.code : ''}
                                            </Text>

                                            {isPartial && item.items && item.items.length > 0 && (
                                                <View style={[styles.skuList, { borderTopColor: 'rgba(0,0,0,0.06)' }]}>
                                                    {item.items.slice(0, 3).map((sku, idx) => (
                                                        <Text key={idx} style={[styles.skuText, { color: txtColor }]} numberOfLines={1}>
                                                            • {sku.item_name} (W{sku.week})
                                                        </Text>
                                                    ))}
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        </View>
                    )
                )}
            </View>

            {/* --- MODAL DETAIL (Tetap sama) --- */}
            <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalDragIndicator} />
                        {selectedPallet && (
                            <>
                                <Text style={styles.modalTitle}>Detail Pallet</Text>
                                <View style={styles.modalDataRow}>
                                    <Text style={styles.modalLabel}>Pallet ID</Text>
                                    <Text style={styles.modalValue}>{selectedPallet.code}</Text>
                                </View>
                                <View style={styles.modalDataRow}>
                                    <Text style={styles.modalLabel}>Total Qty</Text>
                                    <Text style={styles.modalValue}>{selectedPallet.totalQty} {selectedPallet.uom}</Text>
                                </View>
                                <View style={styles.modalDataRow}>
                                    <Text style={styles.modalLabel}>Oldest Week</Text>
                                    <Text style={styles.modalValue}>W-{selectedPallet.oldestWeek}</Text>
                                </View>

                                <Text style={styles.modalListTitle}>Daftar Isi Item</Text>
                                <ScrollView style={styles.itemListContainer} showsVerticalScrollIndicator={false}>
                                    {selectedPallet.items && selectedPallet.items.length > 0 ? (
                                        selectedPallet.items.map((it, idx) => (
                                            <View key={idx} style={styles.itemCard}>
                                                <Text style={styles.itemName}>{it.item_name}</Text>
                                                <Text style={styles.itemDetail}>{it.qty} {it.uom} • Week {it.week}</Text>
                                            </View>
                                        ))
                                    ) : (<Text style={styles.emptyDetail}>Pallet Kosong</Text>)}
                                </ScrollView>

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
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderColor: '#F1F5F9' },
    backButton: { marginBottom: 12 },
    backBtnText: { color: '#6366F1', fontSize: 14, fontWeight: '600' },
    title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
    breadcrumbContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
    breadcrumbText: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
    breadcrumbActive: { color: '#334155', fontWeight: '700' },
    contentArea: { flex: 1 },
    listPadding: { padding: 16 },

    boxCard: { flex: 1, backgroundColor: '#FFFFFF', margin: 8, paddingVertical: 24, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    boxIcon: { fontSize: 32, marginBottom: 12 },
    boxText: { fontSize: 15, fontWeight: '600', color: '#334155', textAlign: 'center' },

    warehouseMap: { flex: 1, flexDirection: 'row', margin: 16, borderRadius: 24, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
    mapLeftSection: { flex: 2.5, padding: 8, borderRightWidth: 1, borderColor: '#BAE6FD' },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#0369A1', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    inboundSection: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#E0F2FE' },
    inboundBox: { minWidth: 100, height: 50, marginRight: 12, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFEDD5', borderRadius: 12 },
    inboundText: { color: '#C2410C', fontSize: 11, fontWeight: '700' },
    subGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    subBox: { width: '48%', height: 100, marginBottom: 12, padding: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
    subText: { fontSize: 12, fontWeight: '600', color: '#A16207', textAlign: 'center' },
   
    mapRightSection: { flex: 1, flexDirection: 'row', paddingLeft: 8 },
    stagingColumn: { flex: 1, justifyContent: 'space-around', paddingVertical: 8, paddingRight: 8 },
    gateColumn: { width: 45, justifyContent: 'space-around', alignItems: 'flex-end', paddingVertical: 8 },
    stagingBox: { flex: 1, width: '100%', marginVertical: 6, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
    stagingText: { color: '#047857', fontSize: 10, fontWeight: '700' },
    gateBox: { width: 32, height: 70, marginVertical: 6, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
    gateText: { color: '#BE123C', fontSize: 10, fontWeight: '700' },

    zoomSubContainer: { flex: 1, backgroundColor: '#FFFFFF', margin: 16, borderRadius: 24, padding: 20 },
    zoomHeader: { marginBottom: 24 },
    zoomTitle: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
    zoomSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4 },
    binsGridWrapper: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    binDetailBox: { width: '47%', backgroundColor: '#F8FAFC', padding: 16, marginBottom: 16, borderRadius: 16, alignItems: 'center' },
    binDetailIconWrapper: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
    binDetailIcon: { fontSize: 20 },
    binDetailText: { fontSize: 14, fontWeight: '600', color: '#334155', textAlign: 'center' },

    zoomBinContainer: { flex: 1, backgroundColor: '#FFFFFF' },
    infoBar: { paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#F1F5F9' },
    infoBarTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
    infoBarSubtitle: { fontSize: 12, color: '#64748B', marginTop: 4 },
    refreshBtnContainer: { backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    refreshBtn: { color: '#4F46E5', fontSize: 12, fontWeight: '600' },
    
    legendContainer: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center' },
    legendBox: { width: 12, height: 12, borderRadius: 4, marginRight: 8 },
    legendText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
 
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: 380 },
    modalDragIndicator: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
    modalDataRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F1F5F9' },
    modalLabel: { fontSize: 14, color: '#64748B' },
    modalValue: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
    
    modalListTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginTop: 24, marginBottom: 12 },
    itemListContainer: { maxHeight: 180 },
    itemCard: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginBottom: 8 },
    itemName: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 4 },
    itemDetail: { fontSize: 12, color: '#64748B' },
    emptyDetail: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
    
    closeButton: { marginTop: 24, backgroundColor: '#6366F1', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
    closeButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
   
 
    // Perkecil ukuran font dasar, tapi manfaatkan adjustsFontSizeToFit di komponen Text
     palletWeekText: { fontSize: 8, fontWeight: '600', textAlign: 'center', marginBottom: 2, opacity: 0.8 },
    
    palletGridContent: { 
        paddingBottom: 40, 
        paddingTop: 16, 
        paddingHorizontal: 12 
    },
    palletSeat: { 
        flex: 1, 
        margin: 5, 
        minHeight: 64, // Dibuat sedikit lebih tinggi agar lega
        borderRadius: 12, // Sudut melengkung modern
        paddingVertical: 10,
        paddingHorizontal: 8,
        justifyContent: 'center', 
        alignItems: 'center',
    },
    // Efek shadow 3D halus khusus untuk pallet yang ada isinya
    palletSeatActive: {
        shadowColor: '#64748B', 
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.08, 
        shadowRadius: 4, 
        elevation: 1,
    },
    palletSeatText: { 
        fontSize: 10, 
        fontWeight: '700', 
        textAlign: 'center', 
        width: '100%',
        letterSpacing: 0.3, // Jarak antar huruf agar lebih elegan
    },
    skuList: { 
        marginTop: 6, 
        paddingTop: 6,
        width: '100%', 
        alignItems: 'flex-start',
        borderTopWidth: 1, // Garis pemisah minimalis
    },
    skuText: { 
        fontSize: 7, 
        fontWeight: '600', 
        lineHeight: 12,
        width: '100%', 
        opacity: 0.85, // Warna sedikit diredupkan agar tidak menyaingi ID Pallet
    },
});

export default WarehouseMap;