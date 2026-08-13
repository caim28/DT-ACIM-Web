import OpenAI from "openai";
import {
  CaseType,
  TreatmentType,
  type AnalyzeSimulationRequest,
  type CaseConfig,
  type SimulationPoint,
} from "../types";

const DEFAULT_SOCLAAS_URL = "https://soclaas-api.comp.nus.edu.sg";
const DEFAULT_SOCLAAS_MODEL = "qwen3.5:9b";

const normalizeBaseURL = (url: string): string => {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
};

const hasValidBody = (body: Partial<AnalyzeSimulationRequest> | undefined): body is AnalyzeSimulationRequest => {
  return Boolean(
    body &&
      Array.isArray(body.data) &&
      Array.isArray(body.activeTreatments) &&
      body.caseConfig &&
      typeof body.caseConfig.id === "string" &&
      typeof body.caseConfig.label === "string" &&
      typeof body.caseConfig.unit === "string",
  );
};

const buildClinicalPrompt = (
  data: SimulationPoint[],
  activeTreatments: TreatmentType[],
  caseConfig: CaseConfig,
): string => {
  const finalPoint = data[data.length - 1];
  const startVal = data[0]?.history ? Math.round(data[0].history) : "Unknown";
  const hour8Point = data.find((point) => point.hour === 8);
  const interventionVal = hour8Point?.history ? Math.round(hour8Point.history) : "Unknown";

  let summary = "Patient Profile: T2DM + Hypertension (GEMINI Trial Context).\n";
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

  const isGlucose = caseConfig.id === CaseType.GLUCOSE;
  const scientificContext = isGlucose
    ? "Context: Carvedilol has insulin-sensitizing effects, leading to better stability. Metoprolol is associated with impaired glucose metabolism, causing variability/upward drift."
    : "Context: Both drugs (Metoprolol/Carvedilol) are effective for BP. Clinical trials show they are nearly indistinguishable in hemodynamic control.";

  return `
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
};

const getPublicErrorMessage = (status: number, model: string): string => {
  if (status === 401) {
    return "SoCLaaS API key is missing, invalid, or revoked.";
  }
  if (status === 403) {
    return `SoCLaaS API key cannot access model "${model}". Check SOCLAAS_MODEL in Vercel.`;
  }
  if (status === 429) {
    return "SoCLaaS rate or quota limit exceeded. Please retry later.";
  }
  return "AI Analysis service is temporarily unavailable.";
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  let body: unknown;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body." });
  }

  const requestBody = body as Partial<AnalyzeSimulationRequest> | undefined;

  if (!hasValidBody(requestBody)) {
    return res.status(400).json({ error: "Invalid analysis request." });
  }

  const apiKey = process.env.SOCLAAS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "SoCLaaS is not configured. Missing SOCLAAS_API_KEY." });
  }

  const model = process.env.SOCLAAS_MODEL || DEFAULT_SOCLAAS_MODEL;
  const baseURL = normalizeBaseURL(
    process.env.SOCLAAS_BASE_URL || process.env.SOCLAAS_URL || DEFAULT_SOCLAAS_URL,
  );

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 30_000,
  });

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are a professional medical AI assistant.",
        },
        {
          role: "user",
          content: buildClinicalPrompt(requestBody.data, requestBody.activeTreatments, requestBody.caseConfig),
        },
      ],
      temperature: 0.7,
      max_tokens: 350,
    });

    const analysis = completion.choices[0]?.message?.content || "Unable to generate analysis.";
    return res.status(200).json({
      analysis: analysis.replace(/\*\*/g, "").replace(/\*/g, ""),
    });
  } catch (error) {
    const apiError = error as { status?: number; message?: string };
    const status = apiError.status && apiError.status >= 400 && apiError.status < 600 ? apiError.status : 500;

    console.error("SoCLaaS analysis error:", {
      status,
      message: apiError.message,
      model,
      baseURL,
    });

    return res.status(status).json({ error: getPublicErrorMessage(status, model) });
  }
}
