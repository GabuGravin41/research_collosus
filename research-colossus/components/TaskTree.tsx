
import React from 'react';
import { ResearchBranch, AgentType } from '../types';
import { 
  Atom, FlaskConical, Sigma, MonitorPlay, ShieldCheck, Microscope, 
  CheckCircle, Circle, GitBranch, Lock, AlertOctagon, Play, Pause
} from 'lucide-react';

interface TaskTreeProps {
  branches: ResearchBranch[];
  onToggleBranch: (branchId: string) => void;
}

export const TaskTree: React.FC<TaskTreeProps> = ({ branches, onToggleBranch }) => {
  
  const getAgentIcon = (type: string) => {
    switch (type) {
      case AgentType.PHYSICIST: return <Atom className="w-3 h-3 text-cyan-400" />;
      case AgentType.CHEMIST: return <FlaskConical className="w-3 h-3 text-emerald-400" />;
      case AgentType.MATHEMATICIAN: return <Sigma className="w-3 h-3 text-purple-400" />;
      case AgentType.SIMULATOR: return <MonitorPlay className="w-3 h-3 text-pink-400" />;
      case AgentType.CRITIC: return <ShieldCheck className="w-3 h-3 text-orange-400" />;
      default: return <Microscope className="w-3 h-3 text-gray-400" />;
    }
  };

  if (branches.length === 0) {
    return (
       <div className="text-sm text-gray-600 text-center py-10 border border-dashed border-colossus-700 rounded-lg">
         No active vectors.
       </div>
    );
  }

  return (
    <div className="space-y-6">
      {branches.map((branch, bIdx) => (
        <div key={branch.id} className={`relative pl-4 border-l-2 transition-colors ${branch.status === 'paused' ? 'border-gray-700 opacity-60' : 'border-colossus-700'}`}>
           {/* Branch Header */}
           <div className={`absolute -left-[9px] top-0 w-4 h-4 border-2 rounded-full flex items-center justify-center z-10 ${branch.status === 'paused' ? 'bg-gray-800 border-gray-600' : 'bg-colossus-800 border-colossus-accent'}`}>
              <GitBranch className={`w-2 h-2 ${branch.status === 'paused' ? 'text-gray-500' : 'text-colossus-accent'}`} />
           </div>
           
           <div className="flex items-center justify-between mb-3 pl-2 pr-2">
             <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${branch.status === 'paused' ? 'text-gray-500' : 'text-colossus-accent'}`}>
               <span>{branch.name}</span>
               <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                 branch.status === 'completed' ? 'bg-green-900 text-green-400 border-green-800' : 
                 branch.status === 'paused' ? 'bg-yellow-900/30 text-yellow-500 border-yellow-800/50' :
                 'bg-colossus-700 text-gray-400 border-colossus-600'
               }`}>
                   {branch.status}
               </span>
             </h3>
             
             {branch.status !== 'completed' && branch.status !== 'discarded' && (
               <button 
                  onClick={(e) => { e.stopPropagation(); onToggleBranch(branch.id); }}
                  className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                  title={branch.status === 'paused' ? "Resume Branch" : "Pause Branch"}
               >
                 {branch.status === 'paused' ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
               </button>
             )}
           </div>

           <div className="space-y-3 pl-2">
             {branch.tasks.map((task, tIdx) => {
                 return (
                   <div 
                     key={task.id}
                     className={`relative p-3 rounded-lg border transition-all duration-300 ${
                       task.status === 'active' || task.status === 'reviewing' || task.status === 'refining'
                         ? 'bg-colossus-700 border-colossus-accent shadow-md shadow-colossus-accent/10' 
                         : task.status === 'done'
                           ? 'bg-colossus-800/50 border-colossus-success/30 opacity-75'
                           : 'bg-colossus-800/30 border-colossus-700 opacity-60'
                     }`}
                   >
                      {/* Connector Line */}
                      {tIdx < branch.tasks.length - 1 && (
                        <div className="absolute left-1/2 bottom-[-12px] w-px h-3 bg-colossus-700 z-0"></div>
                      )}
    
                      <div className="flex items-center justify-between mb-2 relative z-10">
                        <div className="flex items-center gap-2">
                          {getAgentIcon(task.assignedTo)}
                          <span className="text-[10px] font-bold text-gray-300 uppercase">{task.assignedTo.split(' ')[0]}</span>
                        </div>
                        {task.status === 'active' && <div className="w-1.5 h-1.5 bg-colossus-accent rounded-full animate-pulse-fast" />}
                        {task.status === 'done' && <CheckCircle className="w-3 h-3 text-colossus-success" />}
                        {task.status === 'pending' && <Circle className="w-3 h-3 text-gray-600" />}
                        {task.status === 'blocked' && <Lock className="w-3 h-3 text-red-500" />}
                      </div>
                      
                      <p className="text-[11px] text-gray-400 leading-tight line-clamp-2 mb-1">
                        {task.description}
                      </p>
    
                      {/* Metadata Badges */}
                      <div className="flex gap-2 mt-1 flex-wrap items-center">
                          {/* Priority Badge */}
                          {task.priority >= 8 ? (
                              <span className="text-[9px] bg-red-900/40 text-red-400 px-1 py-0.5 rounded border border-red-700/30 flex items-center gap-1">
                                  <AlertOctagon className="w-2 h-2" /> CRITICAL
                              </span>
                          ) : task.priority >= 5 ? (
                              <span className="text-[9px] bg-colossus-700 text-blue-300 px-1 py-0.5 rounded border border-colossus-600">
                                  P{task.priority}
                              </span>
                          ) : (
                              <span className="text-[9px] bg-gray-800 text-gray-500 px-1 py-0.5 rounded">
                                  Low Prio
                              </span>
                          )}

                          {task.iterationCount > 0 && (
                              <span className="text-[9px] bg-purple-900/30 text-purple-300 px-1 py-0.5 rounded border border-purple-700/30">
                                  v{task.iterationCount + 1}
                              </span>
                          )}
                      </div>
                   </div>
                 );
             })}
           </div>
        </div>
      ))}
    </div>
  );
};
