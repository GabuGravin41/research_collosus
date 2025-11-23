
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import { SimulationDataPoint } from '../types';
import { Activity } from 'lucide-react';

interface SimulationViewerProps {
  data: SimulationDataPoint[];
  scenarios?: string[];
  title?: string;
  isActive: boolean;
}

const COLORS = ['#00f0ff', '#ff0055', '#ffbd00', '#00ff9d'];

const SimulationViewer: React.FC<SimulationViewerProps> = ({ data, scenarios, title, isActive }) => {
  const keys = scenarios && scenarios.length > 0 
    ? scenarios 
    : (data.length > 0 ? Object.keys(data[0]).filter(k => k !== 'x' && k !== 'label') : ['y']);

  if (!data || data.length === 0) {
    return (
      <div className="h-full w-full min-h-[200px] bg-colossus-800 rounded-lg border border-colossus-700 flex flex-col items-center justify-center text-gray-500 gap-4 p-6 relative overflow-hidden">
         {/* Background abstract grid */}
         <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
         
         <div className={`p-4 rounded-full bg-colossus-700 ${isActive ? 'animate-pulse' : ''}`}>
            <Activity className="w-8 h-8 text-colossus-accent" />
         </div>
         <p className="text-sm font-mono uppercase tracking-widest">Simulation Engine Offline</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-[200px] bg-colossus-800 rounded-lg border border-colossus-700 flex flex-col overflow-hidden">
      <div className="bg-colossus-900 px-4 py-2 border-b border-colossus-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-colossus-success" />
          <span className="text-gray-200 font-semibold font-mono uppercase tracking-wider truncate max-w-[150px]">
            {title || 'Comparative Simulation'}
          </span>
        </div>
        <span className="text-xs text-colossus-accent font-mono animate-pulse hidden sm:inline">LIVE RENDER</span>
      </div>
      
      <div className="flex-1 p-4 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              {COLORS.map((color, idx) => (
                <linearGradient key={idx} id={`color${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#33334d" />
            <XAxis 
              dataKey="x" 
              stroke="#6b7280" 
              tick={{fill: '#6b7280', fontSize: 10}}
              tickLine={{stroke: '#33334d'}}
            />
            <YAxis 
              stroke="#6b7280" 
              tick={{fill: '#6b7280', fontSize: 10}}
              tickLine={{stroke: '#33334d'}}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0a0a0f', borderColor: '#33334d', color: '#fff', fontSize: '12px' }}
            />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            {keys.map((key, idx) => (
              <Area 
                key={key}
                type="monotone" 
                dataKey={key} 
                stroke={COLORS[idx % COLORS.length]} 
                fillOpacity={1} 
                fill={`url(#color${idx % COLORS.length})`} 
                strokeWidth={2}
                name={key}
                animationDuration={2000}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SimulationViewer;
