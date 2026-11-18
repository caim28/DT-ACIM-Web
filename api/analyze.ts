import OpenAI from "openai";
import { buildDemoReport, getHistoryContext, getEvidenceContext } from "../services/clinicalContext.js";
import type { AnalyzeSimulationRequest, CaseConfig, SimulationPoint, InformationCondition } from "../types";

const DEFAULT_SOCLAAS_URL = "https://soclaas-api.comp.nus.edu.sg";
const DEFAULT_SOCLAAS_MODEL = "qwen3.5:9b";
const GLUCOSE_CASE_ID = "GLUCOSE";
const METOPROLOL_TREATMENT = "Metoprolol";
const CARVEDILOL_TREATMENT = "Carvedilol";

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
      typeof body.caseConfig.unit === "string" &&
      (body.informationCondition === undefined || body.informationCondition === "history-available" || body.informationCondition === "key-history-missing"),
  );
};

const buildClinicalPrompt = (
  data: SimulationPoint[],
  activeTreatments: string[],
  caseConfig: CaseConfig,
  informationCondition: InformationCondition = "history-available",
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
    if (activeTreatments.includes(METOPROLOL_TREATMENT)) {
      summary += `- RAS + Metoprolol: projected end mean ~${Math.round(finalPoint.metoprolol_mean || 0)} ${caseConfig.unit}.\n`;
    }
    if (activeTreatments.includes(CARVEDILOL_TREATMENT)) {
      summary += `- RAS + Carvedilol: projected end mean ~${Math.round(finalPoint.carvedilol_mean || 0)} ${caseConfig.unit}.\n`;
    }
  }

  const outcomeContext = caseConfig.id === GLUCOSE_CASE_ID
    ? "The predefined glucose paths have different endpoints. Describe the displayed difference without inferring a proven individual treatment benefit."
    : "The predefined diastolic blood pressure paths have similar endpoints. Describe this as a feature of the displayed simulation, not proof of clinical equivalence.";

  return `You are presenting the DT-ACIM conceptual demo to clinicians.
Data:
${summary}
Information condition:
${getHistoryContext(informationCondition)}
Outcome context:
${outcomeContext}
Write exactly four short paragraphs, using these headings:
Patient Status & Initial Care (Hours 1–8): describe the history, with insulin administered at Hour 1 for hyperglycemia.
Intervention Protocol (Hour 8): describe the displayed RAS blockade and beta-blocker pathways.
Comparative Simulation (Hours 9–13): use only the selected pathways and endpoint values above. If only one is selected, describe that pathway without comparing it to an unselected one.
Clinical Interpretation: relate the comparison to the selected information condition and clinical team discussion.
Use plain text, under 220 words. These are predefined illustrative trajectories and ranges.
Do not prescribe a treatment, favor a drug by default, invent studies or statistics, or claim the ranges are calibrated confidence intervals. Missing history changes the illustrative range, not the predefined means.
Do not add an Evidence & Clinical Context section; the application appends that section for the selected information condition.`;
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

const getMessageText = (content: unknown): string => {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text || "");
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
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
    return res.status(200).json({ analysis: `Demo report\n\n${buildDemoReport(requestBody)}` });
  }

  const model = process.env.SOCLAAS_MODEL || DEFAULT_SOCLAAS_MODEL;
  const baseURL = normalizeBaseURL(
    process.env.SOCLAAS_BASE_URL || process.env.SOCLAAS_URL || DEFAULT_SOCLAAS_URL,
  );

  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: 12_000,
    maxRetries: 0,
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
          content: buildClinicalPrompt(requestBody.data, requestBody.activeTreatments, requestBody.caseConfig, requestBody.informationCondition),
        },
      ],
      temperature: 0.7,
      max_tokens: 550,
      reasoning_effort: "none",
    } as any);

    const message = completion.choices[0]?.message as { content?: unknown; reasoning_content?: unknown } | undefined;
    const analysis =
      getMessageText(message?.content) ||
      getMessageText(message?.reasoning_content) ||
      "Unable to generate analysis.";

    return res.status(200).json({
      analysis: `${analysis.replace(/\*\*/g, "").replace(/\*/g, "")}\n\nEvidence & Clinical Context:\n${getEvidenceContext(requestBody.informationCondition || "history-available")}`,
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

    return res.status(200).json({ analysis: `Demo report\n\n${buildDemoReport(requestBody)}` });
  }
}
