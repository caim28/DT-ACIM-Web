import React, { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { SimulationPoint, TreatmentType } from '../types';

interface SimulationChartProps {
  data: SimulationPoint[];
  activeTreatments: TreatmentType[];
  unit: string;
  yDomain: [number, number];
  illustrativeVariance: number;
}

const CustomTooltip = ({ active, payload, label, unit }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur border border-slate-200 p-3 shadow-xl rounded-lg text-xs z-50 min-w-[150px]">
        <p className="font-bold text-slate-700 mb-2 pb-1 border-b border-slate-100 flex justify-between">
          <span>Time</span>
          <span className="text-slate-400">Hour {label}</span>
        </p>
        {payload.map((entry: any, index: number) => {
           // Whitelist filtering: Only show the main trend lines, ignore background simulation noise
           const validKeys = ['history', 'postDecisionReference', 'metoprolol_mean', 'carvedilol_mean'];
           // Check if dataKey is a string and in our whitelist
           const isKeyString = typeof entry.dataKey === 'string';
           if (!isKeyString || !validKeys.includes(entry.dataKey)) return null;
           
           let name = entry.name;
           if (entry.dataKey === 'history') name = 'Observed History';
           if (entry.dataKey === 'postDecisionReference') name = 'Post-decision reference';
           if (entry.dataKey === 'postDecisionReference' && label === 8) return null;
           if (entry.dataKey === 'metoprolol_mean') name = 'RAS + Metoprolol';
           if (entry.dataKey === 'carvedilol_mean') name = 'RAS + Carvedilol';

           return (
            <div key={index} style={{ color: entry.color }} className="flex items-center justify-between gap-4 mb-1.5 last:mb-0">
              <span className="font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                {name}
              </span>
              <span className="font-mono font-bold text-slate-800">
                {Math.round(entry.value)} <span className="text-[10px] text-slate-400 font-normal">{unit}</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

const SimulationChart: React.FC<SimulationChartProps> = ({ data, activeTreatments, unit, yDomain, illustrativeVariance }) => {
  
  const simulationLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    const runCount = 0;

    // 1. Metoprolol (Blue)
    if (activeTreatments.includes(TreatmentType.METOPROLOL)) {
      // Individual Monte Carlo Runs - Background Noise
      for (let i = 0; i < runCount; i++) {
        lines.push(
          <Line
            key={`met-run-${i}`}
            type="monotone"
            dataKey={(point) => point.metoprolol_runs ? point.metoprolol_runs[i] : null}
            stroke="#3b82f6"
            strokeWidth={1}
            strokeOpacity={0.06} 
            dot={false}
            activeDot={false} // Disable hover effect for background lines
            legendType="none" // HIDE FROM LEGEND to fix "garbled text"
            isAnimationActive={false}
          />
        );
      }
      // Mean Line - The one we want to see in Legend
      lines.push(
        <Line
          key="met-mean"
          type="monotone"
          dataKey="metoprolol_mean"
          stroke="#2563eb" 
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0 }}
          name="RAS + Metoprolol"
        />
      );
    }

    // 2. Carvedilol (Green)
    if (activeTreatments.includes(TreatmentType.CARVEDILOL)) {
      for (let i = 0; i < runCount; i++) {
        lines.push(
          <Line
            key={`carv-run-${i}`}
            type="monotone"
            dataKey={(point) => point.carvedilol_runs ? point.carvedilol_runs[i] : null}
            stroke="#16a34a"
            strokeWidth={1}
            strokeOpacity={0.06}
            dot={false}
            activeDot={false} // Disable hover effect
            legendType="none" // HIDE FROM LEGEND
            isAnimationActive={false}
          />
        );
      }
      lines.push(
        <Line
          key="carv-mean"
          type="monotone"
          dataKey="carvedilol_mean"
          stroke="#16a34a" 
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0 }}
          name="RAS + Carvedilol"
        />
      );
    }

    return lines;
  }, [activeTreatments]);

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.map(point => ({ ...point, history: point.hour <= 8 ? point.history : null, postDecisionReference: point.hour >= 8 ? point.history : null }))} margin={{ top: 20, right: 20, left: 0, bottom: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis 
            dataKey="hour" 
            type="number"
            domain={[1, 13]}
            tickCount={13}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            interval={0}
            label={{ value: 'Hours since admission', position: 'insideBottom', offset: -5, fill: '#cbd5e1', fontSize: 10 }}
          />
          <YAxis 
            domain={yDomain}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={60}
            label={{ value: unit, angle: -90, position: 'insideLeft', offset: 10, fill: '#cbd5e1', fontSize: 10 }}
          />
          <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Legend 
            verticalAlign="top" 
            height={40}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '12px', fontWeight: 500, color: '#475569', paddingTop: '0px' }}
          />
          
          <ReferenceLine x={8} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: "Intervention", position: 'insideTopLeft', fill: '#94a3b8', fontSize: 11, dy: 5, dx: 5 }} />


          {/* Illustrative future ranges; internal lines stay within these bounds */}
          {activeTreatments.includes(TreatmentType.METOPROLOL) && (
            <Area type="monotone" dataKey={(point) => {
              if (point.metoprolol_mean == null) return null;
              const horizon = Math.max(0, Math.min(1, (point.hour - 8) / 5));
              const halfWidth = (unit === 'mmHg' ? (illustrativeVariance === 25 ? 1.4 : 5.2) : (illustrativeVariance === 25 ? 14 : 80)) * horizon;
              return [point.metoprolol_mean - halfWidth, point.metoprolol_mean + halfWidth];
            }} stroke="none" fill="#3b82f6" fillOpacity={0.17} legendType="none" isAnimationActive={false} />
          )}
          {activeTreatments.includes(TreatmentType.CARVEDILOL) && (
            <Area type="monotone" dataKey={(point) => {
              if (point.carvedilol_mean == null) return null;
              const horizon = Math.max(0, Math.min(1, (point.hour - 8) / 5));
              const halfWidth = (unit === 'mmHg' ? (illustrativeVariance === 25 ? 1.4 : 5.2) : (illustrativeVariance === 25 ? 14 : 80)) * horizon;
              return [point.carvedilol_mean - halfWidth, point.carvedilol_mean + halfWidth];
            }} stroke="none" fill="#16a34a" fillOpacity={0.14} legendType="none" isAnimationActive={false} />
          )}
          {/* Six evenly spaced, gently colored strands per pathway; no random zig-zags. */}
          {activeTreatments.includes(TreatmentType.METOPROLOL) && [-0.80, -0.53, -0.27, 0.27, 0.53, 0.80].map((fraction, idx) => (
            <Line key={`met-range-${idx}`} type="monotone" dataKey={(point) => {
              if (point.metoprolol_mean == null) return null;
              const horizon = Math.max(0, Math.min(1, (point.hour - 8) / 5));
              const halfWidth = (unit === 'mmHg' ? (illustrativeVariance === 25 ? 1.4 : 5.2) : (illustrativeVariance === 25 ? 14 : 80)) * horizon;
              return point.metoprolol_mean + fraction * halfWidth;
            }} stroke="#60a5fa" strokeWidth={1.05} strokeOpacity={0.48} dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
          ))}
          {activeTreatments.includes(TreatmentType.CARVEDILOL) && [-0.80, -0.53, -0.27, 0.27, 0.53, 0.80].map((fraction, idx) => (
            <Line key={`carv-range-${idx}`} type="monotone" dataKey={(point) => {
              if (point.carvedilol_mean == null) return null;
              const horizon = Math.max(0, Math.min(1, (point.hour - 8) / 5));
              const halfWidth = (unit === 'mmHg' ? (illustrativeVariance === 25 ? 1.4 : 5.2) : (illustrativeVariance === 25 ? 14 : 80)) * horizon;
              return point.carvedilol_mean + fraction * halfWidth;
            }} stroke="#4ade80" strokeWidth={1.05} strokeOpacity={0.44} dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
          ))}
          {simulationLines}

          {/* Observed History / Ground Truth - Rendered last to be on top */}
          <Line
            type="monotone"
            dataKey="history"
            stroke="#ef4444" 
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 0 }}
            name="Observed History"
            connectNulls={true}
          />

          {/* Post-decision reference deliberately distinct from observed patient history */}
          <Line
            type="monotone"
            dataKey="postDecisionReference"
            stroke="#ef4444"
            strokeWidth={2}
            strokeOpacity={0.58}
            strokeDasharray="6 5"
            dot={false}
            activeDot={false}
            legendType="none"
            isAnimationActive={false}
            name="Post-decision reference"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SimulationChart;