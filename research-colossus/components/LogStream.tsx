import React, { useEffect, useRef } from 'react';
import { AgentLog } from '../types';
import { Terminal, AlertCircle, CheckCircle, Info, BrainCircuit } from 'lucide-react';

interface LogStreamProps {
  logs: AgentLog[];
}

const LogStream: React.FC<LogStreamProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getIcon = (type: AgentLog['type']) => {
    switch (type) {
      case 'error': return <AlertCircle className="w-4 h-4 text-colossus-danger" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-colossus-success" />;
      case 'info': return <Info className="w-4 h-4 text-colossus-accent" />;
      case 'data': return <BrainCircuit className="w-4 h-4 text-purple-400" />;
      default: return <Terminal className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-colossus-800 rounded-lg border border-colossus-700 overflow-hidden font-mono text-xs">
      <div className="bg-colossus-900 px-4 py-2 border-b border-colossus-700 flex items-center gap-2">
        <Terminal className="w-4 h-4 text-colossus-accent" />
        <span className="text-gray-400 font-semibold uppercase tracking-wider">System Logs</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {logs.length === 0 && (
          <div className="text-gray-600 italic text-center mt-10">System idle. Awaiting input...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 animate-fade-in">
            <span className="text-gray-500 whitespace-nowrap">
              [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
            </span>
            <div className="mt-0.5">{getIcon(log.type)}</div>
            <div>
              <span className={`font-bold mr-2 ${
                log.agentName === 'ORCHESTRATOR' ? 'text-yellow-400' : 'text-colossus-accent'
              }`}>
                {log.agentName}:
              </span>
              <span className="text-gray-300">{log.message}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default LogStream;