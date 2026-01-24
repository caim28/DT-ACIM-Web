import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  BrainCircuit, 
  RefreshCw, 
  Settings, 
  User, 
  FileText, 
  ChevronRight,
  TrendingDown,
  HeartPulse,
  Syringe,
  Info
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

const App: React.FC = () => {
  const [currentCase, setCurrentCase] = useState<CaseType>(CaseType.GLUCOSE);
  const [data, setData] = useState<SimulationPoint[]>([]);
  const [activeTreatments, setActiveTreatments] = useState<TreatmentType[]>([TreatmentType.METOPROLOL, TreatmentType.CARVEDILOL]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [variance, setVariance] = useState(30);

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
      
      {/* Sidebar - Simplified */}
      <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-20">
        <div className="p-2 bg-indigo-600 rounded-lg shadow-sm">
          <Activity className="text-white w-5 h-5" />
        </div>
        <nav className="flex flex-col gap-6 w-full items-center mt-4">
          <button className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors">
            <BrainCircuit className="w-5 h-5" />
          </button>
          <button className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-2 rounded-lg transition-colors">
            <User className="w-5 h-5" />
          </button>
          <button className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-2 rounded-lg transition-colors">
            <FileText className="w-5 h-5" />
          </button>
          <button className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 p-2 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        {/* Header - Renamed to DT-ACIM */}
        <header className="bg-white border-b border-slate-200 h-14 flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                DT-ACIM
              </h1>
              <span className="text-[10px] text-slate-400 font-medium hidden md:block leading-none">Digital Twin–Anchored Acute Care Intervention Model</span>
            </div>
            
            <div className="h-6 w-px bg-slate-200"></div>

            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button 
                onClick={() => setCurrentCase(CaseType.GLUCOSE)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${currentCase === CaseType.GLUCOSE ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Syringe className="w-3 h-3" />
                Glucose
              </button>
              <button 
                onClick={() => setCurrentCase(CaseType.BP)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${currentCase === CaseType.BP ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <HeartPulse className="w-3 h-3" />
                Diastolic BP
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
             <span>Patient: <strong>{activeConfig.patientId}</strong></span>
             <span className="h-4 w-px bg-slate-200 mx-1"></span>
             <span>Condition: <strong>{activeConfig.primaryCondition}</strong></span>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-y-auto bg-slate-50/50">
          
          <div className="col-span-8 flex flex-col gap-6">
            
            {/* Chart Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 min-h-[500px] flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-white">
                <div>
                   <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-indigo-500" />
                    {activeConfig.label} Projection
                  </h2>
                </div>
               
                <button 
                  onClick={runSimulation}
                  disabled={isSimulating}
                  className="text-xs flex items-center gap-1.5 text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-md transition-colors font-medium border border-transparent hover:border-indigo-100"
                >
                  <RefreshCw className={`w-3 h-3 ${isSimulating ? 'animate-spin' : ''}`} />
                  {isSimulating ? 'Running...' : 'Update Simulation'}
                </button>
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
            <div className="bg-white rounded-xl shadow-sm border border-indigo-100 p-5 relative overflow-hidden">
               <div className="flex justify-between items-start mb-3 relative z-10">
                 <div className="flex items-center gap-3">
                   <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-md">
                     <BrainCircuit className="w-4 h-4" />
                   </div>
                   <h3 className="font-semibold text-slate-800 text-sm">Clinical Interpretation</h3>
                 </div>
                 <button 
                    onClick={handleAIAnalysis}
                    disabled={isAnalyzing || data.length === 0}
                    className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium px-3 py-1.5 rounded-md transition-all shadow-sm flex items-center gap-2"
                 >
                    {isAnalyzing && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>}
                    {isAnalyzing ? 'Analyzing...' : 'Generate Analysis'}
                 </button>
               </div>

               <div className="relative z-10 min-h-[80px] text-sm">
                 {aiAnalysis ? (
                   <div className="animate-in fade-in duration-500">
                     <div className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                       {aiAnalysis}
                     </div>
                   </div>
                 ) : (
                   <div className="h-full flex items-center text-slate-400 italic text-xs">
                      Simulation complete. Request AI analysis for treatment recommendations.
                   </div>
                 )}
               </div>
            </div>
          </div>

          <div className="col-span-4 flex flex-col gap-6">
            
            {/* Scenarios Control */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-4">Intervention Protocols</h3>
              
              <div className="space-y-2">
                <label className={`group flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${activeTreatments.includes(TreatmentType.METOPROLOL) ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100 hover:border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${activeTreatments.includes(TreatmentType.METOPROLOL) ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                      {activeTreatments.includes(TreatmentType.METOPROLOL) && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm font-medium text-slate-700">RAS + Metoprolol</span>
                  </div>
                  <input type="checkbox" className="hidden" checked={activeTreatments.includes(TreatmentType.METOPROLOL)} onChange={() => toggleTreatment(TreatmentType.METOPROLOL)} />
                </label>

                <label className={`group flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${activeTreatments.includes(TreatmentType.CARVEDILOL) ? 'border-green-200 bg-green-50/30' : 'border-slate-100 hover:border-slate-200'}`}>
                   <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${activeTreatments.includes(TreatmentType.CARVEDILOL) ? 'border-green-500 bg-green-500' : 'border-slate-300'}`}>
                      {activeTreatments.includes(TreatmentType.CARVEDILOL) && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-sm font-medium text-slate-700">RAS + Carvedilol</span>
                  </div>
                  <input type="checkbox" className="hidden" checked={activeTreatments.includes(TreatmentType.CARVEDILOL)} onChange={() => toggleTreatment(TreatmentType.CARVEDILOL)} />
                </label>
              </div>

              {/* Stochastic Variance Control - Now Reactive */}
              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-500">Stochastic Variance</span>
                    <div className="group relative">
                      <Info className="w-3 h-3 text-slate-400 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Adjusts the randomness in Monte Carlo simulations (background lines) to visualize uncertainty in patient response.
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">{variance}%</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="50" 
                  value={variance} 
                  onChange={(e) => setVariance(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                />
              </div>
            </div>

            {/* Stats Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex-1">
              <h3 className="font-semibold text-slate-800 text-sm mb-4">Projected Outcome (13h)</h3>
              
              <div className="space-y-3">
                 <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-xs font-medium text-slate-500">Original Trend</span>
                    <span className="text-sm font-bold text-red-500">
                      {data.length > 0 ? Math.round(data[data.length-1].history!) : '--'} <span className="text-[10px] font-normal text-slate-400">{activeConfig.unit}</span>
                    </span>
                 </div>

                 {activeTreatments.includes(TreatmentType.METOPROLOL) && (
                   <div className="flex justify-between items-center p-3 bg-blue-50/30 rounded-lg border border-blue-100">
                      <span className="text-xs font-medium text-blue-600">Metoprolol</span>
                      <span className="text-sm font-bold text-slate-700">
                        {data.length > 0 ? Math.round(data[data.length-1].metoprolol_mean!) : '--'} <span className="text-[10px] font-normal text-slate-400">{activeConfig.unit}</span>
                      </span>
                   </div>
                 )}

                 {activeTreatments.includes(TreatmentType.CARVEDILOL) && (
                   <div className="flex justify-between items-center p-3 bg-green-50/30 rounded-lg border border-green-100">
                      <span className="text-xs font-medium text-green-600">Carvedilol</span>
                      <span className="text-sm font-bold text-slate-700">
                        {data.length > 0 ? Math.round(data[data.length-1].carvedilol_mean!) : '--'} <span className="text-[10px] font-normal text-slate-400">{activeConfig.unit}</span>
                      </span>
                   </div>
                 )}
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
};

export default App;