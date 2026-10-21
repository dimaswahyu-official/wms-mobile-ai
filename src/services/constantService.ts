import axiosInstance from "../config/axiosInstance";


class ConstantService {
  static async getInventoryTracking(subId: string, binId?: string): Promise<any> {
    try {
      const url = `/inventory-tracking/warehouse?warehouse_sub_id=${subId}&${binId ? `&warehouse_bin_id=${binId}` : ''}`;
      const response = await axiosInstance.get(url);
      return response.data;
    } catch (error: any) {
      throw error.response;
    }
  }

  static async getSubWarehouse(): Promise<any> {
    try {
      const response = await axiosInstance.get('/master-warehouse-sub');
      return response.data;
    } catch (error: any) {
      throw error.response;
    }
  }

    static async getWarehouse(): Promise<any> {
    try {
      const response = await axiosInstance.get('/master-warehouse');
      return response.data;
    } catch (error: any) {
      throw error.response;
    }
  }

   static async getWarehouseBin(): Promise<any> {
    try {
      const response = await axiosInstance.get('/master-warehouse-bin');
      return response.data;
    } catch (error: any) {
      throw error.response;
    }
  }
    static async getWeekProduction(date: string): Promise<any> {
    try {
      const response = await axiosInstance.get('master-week/find-by-date/' + date);
      return response.data;
    } catch (error: any) {
      throw error.response;
    }
  }

}

export default ConstantService;
