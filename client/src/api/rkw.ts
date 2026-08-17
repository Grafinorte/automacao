import { api } from "./client";

export interface RkwParameter {
  id: string;
  key: string;
  label: string;
  value: number;
  category: string;
  unit: string | null;
  updatedAt: string;
}

export interface RkwMachineRate {
  id: string;
  code: string;
  name: string;
  sector: string;
  rateApril: number | null;
  rateMay: number | null;
  rateJune: number | null;
  rateConsolidated: number;
  bufferPct: number;
  rateWithBuffer: number;
  status: string;
  updatedAt: string;
}

export interface RkwFixedCost {
  id: string;
  name: string;
  amount: number;
  category: string;
  rateioPerOs: number | null;
  order: number;
  updatedAt: string;
}

export interface RkwDeviation {
  id: string;
  sectorCode: string;
  sectorName: string;
  deviationApril: number | null;
  deviationMay: number | null;
  deviationJune: number | null;
  trend: string;
  priority: string;
  updatedAt: string;
}

export interface RkwData {
  parameters: RkwParameter[];
  machineRates: RkwMachineRate[];
  fixedCosts: RkwFixedCost[];
  deviations: RkwDeviation[];
}

export const rkwApi = {
  get: () => api.get<RkwData>("/rkw"),
  updateParameter: (key: string, value: number) =>
    api.patch<RkwParameter>(`/rkw/parameters/${key}`, { value }),
  updateMachineRate: (
    id: string,
    data: { rateConsolidated?: number; bufferPct?: number; status?: string }
  ) => api.patch<RkwMachineRate>(`/rkw/machine-rates/${id}`, data),
  updateFixedCost: (id: string, amount: number) =>
    api.patch<RkwFixedCost>(`/rkw/fixed-costs/${id}`, { amount }),
};
