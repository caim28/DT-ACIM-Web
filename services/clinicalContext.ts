import { CaseType, TreatmentType, type AnalyzeSimulationRequest, type InformationCondition } from '../types';

export const getHistoryContext = (condition: InformationCondition): string =>
  condition === 'key-history-missing'
    ? 'Prior response to beta-blockers is unavailable in this scenario. The wider illustrative range highlights the additional uncertainty when interpreting the two pathways.'
    : 'Relevant treatment history is available in this scenario, providing more context for interpreting the two pathways. The narrower illustrative range represents this information condition.';

export const getEvidenceContext = (condition: InformationCondition): string => {
  const context = condition === 'key-history-missing'
    ? 'Without prior treatment-response information, applying these treatment comparisons to this patient requires additional assumptions. Reviewing earlier medication and response records could help the clinical team assess their relevance.'
    : 'Available treatment history helps place the comparison in context, but existing records alone do not establish how this individual would respond to an alternative treatment.';
  return `${context} These predefined trajectories and ranges illustrate the comparison. Whether the differences represent treatment effects, and whether using them improves clinical decisions or outcomes, requires further evidence, including prospective evaluation. Differences between this patient or care setting and previously evaluated cases should also inform the clinical team’s interpretation.`;
};

export const buildDemoReport = ({ data, activeTreatments, caseConfig, informationCondition = 'history-available' }: AnalyzeSimulationRequest): string => {
  const last = data.at(-1);
  const options = [
    activeTreatments.includes(TreatmentType.METOPROLOL) && last?.metoprolol_mean != null
      ? `RAS + Metoprolol: ${last.metoprolol_mean.toFixed(1)} ${caseConfig.unit}` : '',
    activeTreatments.includes(TreatmentType.CARVEDILOL) && last?.carvedilol_mean != null
      ? `RAS + Carvedilol: ${last.carvedilol_mean.toFixed(1)} ${caseConfig.unit}` : '',
  ].filter(Boolean);
  const comparison = options.length === 2
    ? caseConfig.id === CaseType.GLUCOSE
      ? 'The carvedilol pathway has a lower displayed glucose endpoint than the metoprolol pathway.'
      : 'The two displayed diastolic blood pressure endpoints are closely aligned.'
    : 'Select both pathways to compare their displayed outcomes.';
  return [
    'Patient Status & Initial Care (Hours 1–8):\nThis illustrative case represents a 55-year-old male with diabetes and hypertension. Insulin is administered at Hour 1.',
    'Intervention Protocol (Hour 8):\nThe demo compares RAS blockade plus metoprolol with RAS blockade plus carvedilol.',
    `Comparative Simulation (Hours 9–13):\n${options.join('; ') || 'No treatment pathway selected.'} ${comparison}`,
    `Clinical Interpretation:\n${getHistoryContext(informationCondition)} The displayed outcomes support discussion of trade-offs alongside the treating team’s assessment.`,
    `Evidence & Clinical Context:\n${getEvidenceContext(informationCondition)}`,
  ].join('\n\n');
};
