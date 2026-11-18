export interface SimulationPoint {
  hour: number;
  history?: number; // The historical value (Red line)
  
  // Scenario A: Metoprolol (Blue)
  metoprolol_mean?: number;
  metoprolol_runs?: number[]; // Array of values for individual simulation threads
  
  // Scenario B: Carvedilol (Green)
  carvedilol_mean?: number;
  carvedilol_runs?: number[];
}

export enum TreatmentType {
  METOPROLOL = 'Metoprolol',
  CARVEDILOL = 'Carvedilol'
}

export enum CaseType {
  GLUCOSE = 'GLUCOSE',
  BP = 'BP'
}

export interface CaseConfig {
  id: CaseType;
  label: string;
  unit: string;
  yAxisDomain: [number, number];
  description: string;
  patientId: string;
  primaryCondition: string;
}

export interface SimulationConfig {
  runs: number; // Number of monte carlo runs to display (e.g. 20)
  variance: number; // Randomness factor
  interventionHour: number;
}

export type InformationCondition = 'history-available' | 'key-history-missing';

export interface AnalyzeSimulationRequest {
  data: SimulationPoint[];
  activeTreatments: TreatmentType[];
  caseConfig: CaseConfig;
  informationCondition?: InformationCondition;
}

export interface AnalyzeSimulationResponse {
  analysis?: string;
  error?: string;
}
