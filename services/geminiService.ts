import type {
  AnalyzeSimulationRequest,
  AnalyzeSimulationResponse,
  CaseConfig,
  SimulationPoint,
  TreatmentType,
} from "../types";

export const analyzeSimulation = async (
  data: SimulationPoint[],
  activeTreatments: TreatmentType[],
  caseConfig: CaseConfig
): Promise<string> => {
  const payload: AnalyzeSimulationRequest = {
    data,
    activeTreatments,
    caseConfig,
  };

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as AnalyzeSimulationResponse;

    if (!response.ok) {
      console.error("AI Analysis API Error:", result.error || response.statusText);
      return result.error || "AI Analysis service is temporarily unavailable.";
    }

    let text = result.analysis || "Unable to generate analysis.";
    // Clean up any potential markdown symbols
    text = text.replace(/\*\*/g, '').replace(/\*/g, '');

    return text;
  } catch (error) {
    console.error("AI Analysis request failed:", error);
    return "AI Analysis service is temporarily unavailable.";
  }
};
