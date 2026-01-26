import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  BrainCircuit, 
  RefreshCw, 
  Settings, 
  FileText, 
  TrendingDown,
  HeartPulse,
  Syringe,
  Info,
  BookOpen,
  X,
  HelpCircle,
  FlaskConical
} from 'lucide-react';

import SimulationChart from './components/SimulationChart';
import { SimulationPoint, TreatmentType, CaseType, CaseConfig } from './types';
import { analyzeSimulation } from './services/geminiService';

const CASE_CONFIGS: Record<CaseType, CaseConfig> = {
  [CaseType.GLUCOSE]: {
    id: CaseType.GLUCOSE,
    label: "Blood Glucose",
    unit: "mg/dL",
    yAxisDomain: [150, 750], 
    description: "T2DM + HTN (GEMINI Trial Context). 55M. Hour 1: Insulin. Hour 8: RAS + Beta Blockers.",
    patientId: "856091",
    primaryCondition: "Hyperglycemia"
  },
  [CaseType.BP]: {
    id: CaseType.BP,
    label: "Diastolic BP",
    unit: "mmHg",
    yAxisDomain: [58, 88], 
    description: "T2DM + HTN (GEMINI Trial Context). 55M. Hour 1: Insulin. Hour 8: RAS + Beta Blockers.",
    patientId: "856091",
    primaryCondition: "Hypertension"
  }
};

const generateData = (caseType: CaseType, config: { runs: number, variance: number }): SimulationPoint[] => {
  const data: SimulationPoint[] = [];
  
  // Data Mapping:
  // Input: Indices 0..12
  // Output: Hours 1..13 (Index + 1)
  // Intervention: Hour 8
  
  let historyRaw: number[] = [];
  let cf1Raw: number[] = []; // Metoprolol
  let cf2Raw: number[] = []; // Carvedilol
  
  if (caseType === CaseType.GLUCOSE) {
    // Original outcome (Indices 0-12 => Hours 1-13)
    historyRaw = [704.00, 638.50, 591.25, 544.00, 487.50, 431.00, 393.50, 356.00, 327.00, 298.00, 273.00, 248.00, 239.50];
    
    // CF1 (Metoprolol) - Starts influencing from Hour 9 (Index 8 in history)
    cf1Raw = [326.60, 283.13, 236.68, 226.69, 216.44];
    
    // CF2 (Carvedilol)
    cf2Raw = [310.53, 259.99, 207.02, 199.59, 186.44];
  } 
  else if (caseType === CaseType.BP) {
    historyRaw = [73.72, 75.24, 72.52, 73.98, 76.55, 74.39, 72.82, 76.22, 77.60, 73.80, 75.72, 75.90, 83.38];
    cf1Raw = [63.77, 63.88, 64.93, 64.51, 67.37];
    cf2Raw = [64.25, 63.94, 64.93, 64.52, 67.35];
  }

  // Build Simulation Points for Hours 1 to 13
  for (let i = 0; i < historyRaw.length; i++) {
      const hour = i + 1; // Map 0-based index to 1-based hour
      const histVal = historyRaw[i];
      
      let metMean, carvMean, metRuns, carvRuns;

      // Logic Update:
      // Hour 1-7: Only History exists. Met/Carv are undefined (no lines drawn).
      // Hour 8: Anchor point. All lines exist and are equal to history.
      // Hour 9+: Divergence.
      
      if (hour < 8) {
          // Pre-intervention: No counterfactuals yet
          metMean = undefined;
          carvMean = undefined;
          metRuns = undefined;
          carvRuns = undefined;
      } else if (hour === 8) {
          // Anchor Point: Simulation branches off here
          metMean = histVal;
          carvMean = histVal;
          // No variance at the anchor point
          metRuns = Array(config.runs).fill(histVal);
          carvRuns = Array(config.runs).fill(histVal);
      } else {
          // Hour 9 corresponds to CF index 0 (Index 8 in general array minus 8 offset?)
          const cfIndex = i - 8;
          
          if (cfIndex < cf1Raw.length) {
            metMean = cf1Raw[cfIndex];
            carvMean = cf2Raw[cfIndex];
          } else {
            metMean = histVal;
            carvMean = histVal;
          }

          const varianceScale = caseType === CaseType.BP ? 0.2 : 1.0;
          
          metRuns = Array(config.runs).fill(0).map(() => metMean! + (Math.random() - 0.5) * (config.variance * varianceScale));
          carvRuns = Array(config.runs).fill(0).map(() => carvMean! + (Math.random() - 0.5) * (config.variance * varianceScale));
      }

      data.push({
          hour: hour,
          history: histVal,
          metoprolol_mean: metMean,
          carvedilol_mean: carvMean,
          metoprolol_runs: metRuns,
          carvedilol_runs: carvRuns
      });
  }

  return data;
};

const InfoModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
      <div className="bg-indigo-600 p-6 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FlaskConical className="w-6 h-6" />
            Study Protocol & Guide
          </h2>
          <p className="text-indigo-100 text-sm mt-1">DT-ACIM: Digital Twin for Acute Care Intervention</p>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
          <X className="w-6 h-6" />
        </button>
      </div>
      
      <div className="p-6 overflow-y-auto text-slate-700 space-y-6">
        <section>
          <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            System Purpose
          </h3>
          <p className="text-sm leading-relaxed">
            This tool uses a probabilistic <strong>Digital Twin</strong> model to simulate counterfactual patient outcomes. 
            It allows clinicians to compare the projected physiological trajectory of a specific patient under different 
            pharmacological interventions (specifically Beta-Blockers) alongside standard care.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-6">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">Study Population</h4>
            <p className="text-sm">
              T2DM (Type 2 Diabetes) + Hypertension patients exhibiting acute dysregulation. Based on GEMINI trial datasets.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
            <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">Key Terminology (RAS)</h4>
            <p className="text-sm">
              <strong>RAS</strong> = Renin-Angiotensin System Blockers (ACEi or ARBs). 
              <br/><span className="text-xs text-slate-500 mt-1 block">Standard background therapy for all simulation arms.</span>
            </p>
          </div>
        </section>

        <section>
          <h3 className="font-bold text-slate-900 mb-2">Intervention Protocol (Hour 8)</h3>
          <p className="text-sm leading-relaxed mb-3">
            The simulation observes patient history from Hour 1-8 (Pre-intervention). At Hour 8, the model branches into two counterfactuals:
          </p>
          <ul className="text-sm space-y-2 list-disc pl-5">
            <li>
              <span className="font-semibold text-blue-600">RAS + Metoprolol</span>: Cardioselective β1-blocker.
            </li>
            <li>
              <span className="font-semibold text-green-600">RAS + Carvedilol</span>: Non-selective α1/β-blocker with insulin-sensitizing properties.
            </li>
          </ul>
        </section>
      </div>

      <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
        <button 
          onClick={onClose}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Access Simulation
        </button>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [currentCase, setCurrentCase] = useState<CaseType>(CaseType.GLUCOSE);
  const [data, setData] = useState<SimulationPoint[]>([]);
  const [activeTreatments, setActiveTreatments] = useState<TreatmentType[]>([TreatmentType.METOPROLOL, TreatmentType.CARVEDILOL]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [variance, setVariance] = useState(30);
  const [showInfo, setShowInfo] = useState(true);

  // Use useCallback to define the simulation runner
  const runSimulation = useCallback(() => {
    setIsSimulating(true);
    setAiAnalysis(""); 
    // Reduced timeout for snappier UI when dragging slider
    setTimeout(() => {
      const newData = generateData(currentCase, { runs: 20, variance: variance });
      setData(newData);
      setIsSimulating(false);
    }, 200);
  }, [variance, currentCase]);

  // EFFECT: Automatically run simulation when Case OR Variance changes
  useEffect(() => {
    runSimulation();
  }, [runSimulation]); // Now depends on runSimulation which changes when variance changes

  const toggleTreatment = (t: TreatmentType) => {
    setActiveTreatments(prev => 
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  const handleAIAnalysis = async () => {
    if (data.length === 0) return;
    setIsAnalyzing(true);
    const result = await analyzeSimulation(data, activeTreatments, CASE_CONFIGS[currentCase]);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const activeConfig = CASE_CONFIGS[currentCase];

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-800 font-sans">
      
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      {/* Sidebar */}
      <aside className="w-18 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-20 shadow-[2px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-2 bg-indigo-600 rounded-lg shadow-md mb-2">
          <Activity className="text-white w-6 h-6" />
        </div>
        
        <nav className="flex flex-col gap-4 w-full px-2">
          <button 
            onClick={() => setShowInfo(true)}
            className="flex flex-col items-center gap-1 p-2 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors group"
            title="Study Guide & Protocol"
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-[9px] font-medium">Guide</span>
          </button>
          
          <div className="w-full h-px bg-slate-100 my-1"></div>

          <button className="flex flex-col items-center gap-1 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors" title="Simulations">
            <BrainCircuit className="w-5 h-5" />
            <span className="text-[9px] font-medium">Sim</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors" title="Reports">
            <FileText className="w-5 h-5" />
            <span className="text-[9px] font-medium">Rpt</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors" title="Settings">
            <Settings className="w-5 h-5" />
            <span className="text-[9px] font-medium">Set</span>
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        {/* Header - Renamed to DT-ACIM */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 z-10 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                DT-ACIM
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase tracking-wide">Beta</span>
              </h1>
              <span className="text-xs text-slate-500 font-medium hidden md:block leading-none mt-1">
                Digital Twin–Anchored Acute Care Intervention Model
              </span>
            </div>
            
            <div className="h-8 w-px bg-slate-200 mx-2"></div>

            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button 
                onClick={() => setCurrentCase(CaseType.GLUCOSE)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${currentCase === CaseType.GLUCOSE ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Syringe className="w-3.5 h-3.5" />
                Glucose Study
              </button>
              <button 
                onClick={() => setCurrentCase(CaseType.BP)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2 ${currentCase === CaseType.BP ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <HeartPulse className="w-3.5 h-3.5" />
                Hemodynamics
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="font-bold text-slate-900">Patient ID: {activeConfig.patientId}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono">GEMINI-COHORT-A</span>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5">Primary Dx: {activeConfig.primaryCondition}</span>
             </div>
             <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
                <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">MD</div>
             </div>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-y-auto bg-slate-50/50">
          
          <div className="col-span-8 flex flex-col gap-6">
            
            {/* Chart Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 min-h-[500px] flex flex-col overflow-hidden relative">
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
                <div>
                   <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-indigo-500" />
                    Longitudinal Projection (13 Hours)
                  </h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Visualizing counterfactual trajectories against observed history.
                  </p>
                </div>
               
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-[10px] font-medium text-slate-600">Observed</span>
                    <span className="w-px h-3 bg-slate-300 mx-1"></span>
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span className="w-2 h-2 rounded-full bg-green-500 -ml-1"></span>
                    <span className="text-[10px] font-medium text-slate-600">Simulated (DT)</span>
                  </div>
                  <button 
                    onClick={runSimulation}
                    disabled={isSimulating}
                    className="text-xs flex items-center gap-1.5 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-md transition-colors font-medium border border-transparent hover:border-indigo-100"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
                    {isSimulating ? 'Processing...' : 'Recalculate'}
                  </button>
                </div>
              </div>
              <div className="flex-1 w-full p-2 relative">
                <SimulationChart 
                  data={data} 
                  activeTreatments={activeTreatments} 
                  unit={activeConfig.unit}
                  yDomain={activeConfig.yAxisDomain}
                />
              </div>
            </div>

            {/* AI Insight Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-indigo-100 p-5 relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none">
                  <BrainCircuit className="w-24 h-24 text-indigo-600" />
               </div>

               <div className="flex justify-between items-start mb-3 relative z-10">
                 <div className="flex items-center gap-3">
                   <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-md ring-1 ring-indigo-200">
                     <BrainCircuit className="w-4 h-4" />
                   </div>
                   <div>
                      <h3 className="font-bold text-slate-800 text-sm">Decision Support Engine</h3>
                      <p className="text-[10px] text-slate-500">Generative analysis of simulated trajectories</p>
                   </div>
                 </div>
                 <button 
                    onClick={handleAIAnalysis}
                    disabled={isAnalyzing || data.length === 0}
                    className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium px-4 py-2 rounded-lg transition-all shadow-sm flex items-center gap-2"
                 >
                    {isAnalyzing && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
                    {isAnalyzing ? 'Analyzing Digital Twin...' : 'Generate Clinical Report'}
                 </button>
               </div>

               <div className="relative z-10 min-h-[80px] text-sm mt-2">
                 {aiAnalysis ? (
                   <div className="animate-in fade-in duration-500 bg-slate-50 p-4 rounded-lg border border-slate-100">
                     <div className="text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                       {aiAnalysis}
                     </div>
                     <div className="mt-3 pt-3 border-t border-slate-200 text-[10px] text-slate-400 flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        AI-generated insights should be verified against standard clinical guidelines.
                     </div>
                   </div>
                 ) : (
                   <div className="h-full py-4 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">
                      <span className="italic text-xs">Waiting for analysis request...</span>
                   </div>
                 )}
               </div>
            </div>
          </div>

          <div className="col-span-4 flex flex-col gap-6">
            
            {/* Scenarios Control */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 text-sm">Intervention Protocols</h3>
                <div className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 font-mono">
                  Hour 8
                </div>
              </div>
              
              <div className="mb-4 bg-blue-50/50 p-2.5 rounded border border-blue-100">
                 <p className="text-[10px] text-blue-800 leading-snug flex gap-2">
                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Protocol Note:</strong> All arms include background <strong>RAS Blockers</strong> (Renin-Angiotensin System inhibitors).
                    </span>
                 </p>
              </div>
              
              <div className="space-y-3">
                <label className={`group flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${activeTreatments.includes(TreatmentType.METOPROLOL) ? 'border-blue-200 bg-blue-50/30 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${activeTreatments.includes(TreatmentType.METOPROLOL) ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                      {activeTreatments.includes(TreatmentType.METOPROLOL) && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">RAS + Metoprolol</span>
                      <span className="text-[10px] text-slate-400">Cardioselective β-blocker</span>
                    </div>
                  </div>
                  <input type="checkbox" className="hidden" checked={activeTreatments.includes(TreatmentType.METOPROLOL)} onChange={() => toggleTreatment(TreatmentType.METOPROLOL)} />
                </label>

                <label className={`group flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${activeTreatments.includes(TreatmentType.CARVEDILOL) ? 'border-green-200 bg-green-50/30 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}>
                   <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${activeTreatments.includes(TreatmentType.CARVEDILOL) ? 'border-green-500 bg-green-500' : 'border-slate-300'}`}>
                      {activeTreatments.includes(TreatmentType.CARVEDILOL) && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">RAS + Carvedilol</span>
                      <span className="text-[10px] text-slate-400">Non-selective α/β-blocker</span>
                    </div>
                  </div>
                  <input type="checkbox" className="hidden" checked={activeTreatments.includes(TreatmentType.CARVEDILOL)} onChange={() => toggleTreatment(TreatmentType.CARVEDILOL)} />
                </label>
              </div>

              {/* Stochastic Variance Control */}
              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-700">Model Uncertainty</span>
                    <div className="group relative">
                      <HelpCircle className="w-3 h-3 text-slate-400 cursor-help" />
                      <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-800 text-white text-[10px] p-2.5 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 leading-tight">
                        Adjusts the stochastic variance in the Monte Carlo simulation (N=20 runs) to visualize potential patient response range.
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    σ: {variance}%
                  </span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="50" 
                  value={variance} 
                  onChange={(e) => setVariance(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500"
                />
              </div>
            </div>

            {/* Stats Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex-1 flex flex-col">
              <h3 className="font-bold text-slate-800 text-sm mb-4">Projected Outcome (13h)</h3>
              
              <div className="space-y-3 flex-1">
                 <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-600">History (Observed)</span>
                      <span className="text-[9px] text-slate-400">Actual patient data</span>
                    </div>
                    <span className="text-sm font-bold text-red-500 font-mono">
                      {data.length > 0 ? Math.round(data[data.length-1].history!) : '--'} <span className="text-[10px] font-normal text-slate-400 font-sans">{activeConfig.unit}</span>
                    </span>
                 </div>

                 {activeTreatments.includes(TreatmentType.METOPROLOL) && (
                   <div className="flex justify-between items-center p-3 bg-blue-50/20 rounded-lg border border-blue-100">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-blue-700">Metoprolol (Sim)</span>
                        <span className="text-[9px] text-blue-400">Counterfactual A</span>
                      </div>
                      <span className="text-sm font-bold text-slate-700 font-mono">
                        {data.length > 0 ? Math.round(data[data.length-1].metoprolol_mean!) : '--'} <span className="text-[10px] font-normal text-slate-400 font-sans">{activeConfig.unit}</span>
                      </span>
                   </div>
                 )}

                 {activeTreatments.includes(TreatmentType.CARVEDILOL) && (
                   <div className="flex justify-between items-center p-3 bg-green-50/20 rounded-lg border border-green-100">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-green-700">Carvedilol (Sim)</span>
                        <span className="text-[9px] text-green-400">Counterfactual B</span>
                      </div>
                      <span className="text-sm font-bold text-slate-700 font-mono">
                        {data.length > 0 ? Math.round(data[data.length-1].carvedilol_mean!) : '--'} <span className="text-[10px] font-normal text-slate-400 font-sans">{activeConfig.unit}</span>
                      </span>
                   </div>
                 )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 text-center leading-tight">
                  Disclaimer: Educational simulation only.<br/>Not for active clinical decision making.
                </p>
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
