import React from 'react';
import { ExperimentSpec } from '../types';
import { Server, Code, Database, Cpu, Zap } from 'lucide-react';

interface SpecViewerProps {
  spec: ExperimentSpec;
}

const SpecViewer: React.FC<SpecViewerProps> = ({ spec }) => {
  return (
    <div className="bg-[#0d1117] border border-colossus-700 rounded-lg overflow-hidden font-mono text-sm shadow-2xl my-4">
      {/* Header */}
      <div className="bg-[#161b22] p-4 border-b border-colossus-700 flex justify-between items-start">
        <div>
            <div className="flex items-center gap-2 text-colossus-accent mb-1">
                <Server className="w-4 h-4" />
                <span className="font-bold tracking-widest uppercase">HPC CLUSTER SPECIFICATION</span>
            </div>
            <h3 className="text-lg font-bold text-white">{spec.title}</h3>
        </div>
        <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Complexity Class</span>
            <span className={`text-xs font-bold px-2 py-1 rounded mt-1 ${
                spec.complexity === 'EXTREME' ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'
            }`}>
                {spec.complexity}
            </span>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Requirements */}
        <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Cpu className="w-3 h-3" /> System Requirements
            </h4>
            <ul className="space-y-2">
                {spec.requirements.map((req, i) => (
                    <li key={i} className="flex items-center gap-2 text-gray-300 bg-[#21262d] px-3 py-2 rounded border border-[#30363d]">
                        <Zap className="w-3 h-3 text-yellow-500" />
                        {req}
                    </li>
                ))}
            </ul>
            
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-6 mb-3 flex items-center gap-2">
                <Database className="w-3 h-3" /> Expected Outcome
            </h4>
            <p className="text-gray-400 text-xs leading-relaxed italic border-l-2 border-gray-700 pl-3">
                "{spec.expectedOutcome}"
            </p>
        </div>

        {/* Code Snippet (The Blueprint) */}
        <div className="relative">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Code className="w-3 h-3" /> Kernel / Model Arch
            </h4>
            <div className="bg-[#0a0a0f] p-4 rounded border border-[#30363d] h-64 overflow-y-auto text-xs text-blue-300 leading-5">
                <pre>{spec.codeSnippet}</pre>
            </div>
            <div className="absolute top-10 right-4">
                 <span className="text-[10px] text-gray-600 uppercase bg-[#0a0a0f] px-2 py-1 rounded">Python / CUDA</span>
            </div>
        </div>
      </div>
      
      <div className="bg-[#161b22] p-3 border-t border-colossus-700 text-center">
          <p className="text-[10px] text-gray-500">
              This specification was generated because the computation exceeds local browser capabilities. 
              Export this blueprint to a GPU cluster for execution.
          </p>
      </div>
    </div>
  );
};

export default SpecViewer;