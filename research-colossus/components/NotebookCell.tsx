import React, { useState } from 'react';
import { Play, RefreshCw, Save, Code as CodeIcon } from 'lucide-react';

interface NotebookCellProps {
  code: string;
  onRun: (newCode: string) => Promise<void>;
  readOnly?: boolean;
}

const NotebookCell: React.FC<NotebookCellProps> = ({ code: initialCode, onRun, readOnly }) => {
  const [code, setCode] = useState(initialCode);
  const [isRunning, setIsRunning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    await onRun(code);
    setIsRunning(false);
    setIsEditing(false);
  };

  return (
    <div className="mt-4 border border-gray-800 rounded-md overflow-hidden bg-[#0d0d12] shadow-lg">
      {/* Toolbar */}
      <div className="bg-[#1a1a24] px-3 py-2 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <CodeIcon className="w-3 h-3" />
            <span>Jupyter Cell (Python/NumPy)</span>
        </div>
        {!readOnly && (
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-xs px-2 py-1 hover:bg-gray-700 rounded text-gray-300 transition-colors"
                >
                    {isEditing ? 'View Mode' : 'Edit Source'}
                </button>
                <button 
                    onClick={handleRun}
                    disabled={isRunning}
                    className={`text-xs flex items-center gap-1 px-3 py-1 rounded font-bold transition-all ${
                        isRunning 
                        ? 'bg-gray-700 text-gray-500 cursor-wait' 
                        : 'bg-colossus-accent text-colossus-900 hover:bg-cyan-300'
                    }`}
                >
                    {isRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    RUN
                </button>
            </div>
        )}
      </div>

      {/* Editor/Viewer */}
      <div className="relative group">
          {isEditing ? (
              <textarea 
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-64 bg-[#0a0a0f] text-green-400 font-mono text-xs p-4 focus:outline-none resize-y"
                spellCheck={false}
              />
          ) : (
              <pre className="w-full max-h-64 overflow-y-auto bg-[#0a0a0f] text-green-400 font-mono text-xs p-4">
                  {code}
              </pre>
          )}
          {!isEditing && (
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                 <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-1 rounded">Read-only view</span>
              </div>
          )}
      </div>
    </div>
  );
};

export default NotebookCell;