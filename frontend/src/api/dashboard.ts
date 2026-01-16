/**
 * Dashboard API - Enhanced with live data generation fallback
 */
import api from "./index";
import { DashboardOverview, MachineSummary } from "../types/api";

export const dashboardApi = {
    /**
     * Get dashboard overview with live data
     */
    async getOverview(): Promise<DashboardOverview> {
        const response = await api.get<DashboardOverview>("/dashboard/overview");
        return response.data;
    },

    /**
     * Generate test data if no live data available
     */
    async generateTestData(count: number = 10): Promise<{ ok: boolean; message: string }> {
        const response = await api.post("/simulator/generate-test-data", null, {
            params: { count },
        });
        return response.data;
    },

    /**
     * Get machine summary with live data
     */
    async getMachineSummary(machineId: string): Promise<MachineSummary> {
        const response = await api.get<MachineSummary>(`/machines/${machineId}/summary`);
        return response.data;
    },
};
