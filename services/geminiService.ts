import OpenAI from "openai";
import { SimulationPoint, TreatmentType, CaseConfig, CaseType } from "../types";

// Initialize OpenAI Client
// Note: "dangerouslyAllowBrowser: true" is required for client-side usage.
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY, 
  dangerouslyAllowBrowser: true
});

export const analyzeSimulation = async (
  data: SimulationPoint[],
  activeTreatments: TreatmentType[],
  caseConfig: CaseConfig
): Promise<string> => {
  
  // --- Data Preparation Logic ---
  const finalPoint = data[data.length - 1];
  const startVal = data[0].history ? Math.round(data[0].history) : "Unknown";
  // Intervention is at Hour 8
  const interventionVal = data.find(d => d.hour === 8)?.history ? Math.round(data.find(d => d.hour === 8)!.history!) : "Unknown";
  
  let summary = `Patient Profile: T2DM + Hypertension (GEMINI Trial Context).\n`;
  summary += `Metric: ${caseConfig.label} (${caseConfig.unit})\n`;
  summary += `PRE-INTERVENTION (Hour 1-8): Insulin was administered at Hour 1. Metric started at ${startVal} and reached ${interventionVal} at Hour 8.\n`;
  
  summary += "POST-INTERVENTION SIMULATION (Hour 9-13) [RAS Blocker + Beta Blocker]:\n";
  if (finalPoint) {
      if (activeTreatments.includes(TreatmentType.METOPROLOL)) {
          summary += `- RAS + Metoprolol: projected end mean ~${Math.round(finalPoint.metoprolol_mean || 0)} ${caseConfig.unit}.\n`;
      }
      if (activeTreatments.includes(TreatmentType.CARVEDILOL)) {
          summary += `- RAS + Carvedilol: projected end mean ~${Math.round(finalPoint.carvedilol_mean || 0)} ${caseConfig.unit}.\n`;
      }
  }

  // --- Clinical Context Logic ---
  const isGlucose = caseConfig.id === CaseType.GLUCOSE;
  
  const scientificContext = isGlucose 
    ? "Context: Carvedilol has insulin-sensitizing effects, leading to better stability. Metoprolol is associated with impaired glucose metabolism, causing variability/upward drift."
    : "Context: Both drugs (Metoprolol/Carvedilol) are effective for BP. Clinical trials show they are nearly indistinguishable in hemodynamic control.";

  const prompt = `
    You are an expert medical presenter demonstrating the "DT-ACIM" system (Digital Twin). 
    Your audience includes doctors viewing a clinical demo based on the GEMINI trial structure.

    Goal: Explain the patient journey, the Insulin effect (H1), and the Beta-blocker comparison (H8-H13).
    
    Data:
    ${summary}
    
    Scientific Knowledge Base:
    ${scientificContext}
    
    Structure your response in exactly these 4 short paragraphs (plain text only):

    Patient Status & Initial Care (Hour 1-8):
    Mention the patient (T2DM & HTN). Explicitly state that INSULIN was administered at Hour 1 to manage the initial severe condition. Describe the trend up to Hour 8.

    Intervention Protocol (Hour 8):
    Explain that at Hour 8, the regimen shifted to include RAS blockers + a Beta-blocker (Metoprolol vs Carvedilol) to manage the multi-morbid condition.

    Comparative Simulation (Hour 9-13):
    Analyze the difference between the two curves.
    ${isGlucose ? "-> HIGHLIGHT that Carvedilol shows better stability due to insulin-sensitizing effects, while Metoprolol shows variability/drift." : "-> HIGHLIGHT that both drugs perform nearly identically for Blood Pressure control, showing they are hemodynamically equivalent."}

    Clinical Recommendation:
    Conclude which strategy the Digital Twin suggests. ${isGlucose ? "Favor Carvedilol for glycemic control." : "Either is acceptable for BP, so choice depends on metabolic factors."}

    Constraints:
    - Professional, clinical tone suitable for doctors.
    - Under 200 words.
    - NO Markdown (**bold**, *italics*). Plain text only.
  `;

  // --- OpenAI API Call ---
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        {
          role: "system",
          content: "You are a professional medical AI assistant."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
    });
    
    let text = response.choices[0].message.content || "Unable to generate analysis.";
    // Clean up any potential markdown symbols
    text = text.replace(/\*\*/g, '').replace(/\*/g, '');
    
    return text;
  } catch (error) {
    console.error("OpenAI Error:", error);
    return "AI Analysis service is temporarily unavailable.";
  }
};
