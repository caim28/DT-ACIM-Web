import type {
  AnalyzeSimulationRequest,
  AnalyzeSimulationResponse,
  CaseConfig,
  SimulationPoint,
  TreatmentType,
  InformationCondition,
} from "../types";
import { buildDemoReport } from './clinicalContext';

export const analyzeSimulation = async (
  data: SimulationPoint[],
  activeTreatments: TreatmentType[],
  caseConfig: CaseConfig,
  informationCondition: InformationCondition = 'history-available'
): Promise<string> => {
  const payload: AnalyzeSimulationRequest = {
    data,
    activeTreatments,
    caseConfig,
    informationCondition,
  };

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const result = (await response.json()) as AnalyzeSimulationResponse;

    if (!response.ok) {
      console.error("AI Analysis API Error:", result.error || response.statusText);
      return `Demo report\n\n${buildDemoReport(payload)}`;
    }

    let text = result.analysis || `Demo report\n\n${buildDemoReport(payload)}`;
    // Clean up any potential markdown symbols
    text = text.replace(/\*\*/g, '').replace(/\*/g, '');

    return text;
  } catch (error) {
    console.error("AI Analysis request failed:", error);
    return `Demo report\n\n${buildDemoReport(payload)}`;
  }
};
