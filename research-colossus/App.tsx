
import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, Play, Pause, Atom, Network, Database,
  AlertTriangle, Search, Square, RefreshCw,
  Menu, X, BarChart2, Paperclip, FileText,
  Mic, MicOff
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore – types provided via global.d.ts
import remarkMath from 'remark-math';
// @ts-ignore – types provided via global.d.ts
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import { AgentType, ResearchState, AgentLog, ResearchTask, KnowledgeFact, ExperimentSpec, ResearchBranch, Attachment } from './types';
import { 
  fetchResearchState,
  startResearch,
  toggleBranchPause,
  type BackendStateResponse,
  transcribeSpeech,
} from './services/backendClient';
import LogStream from './components/LogStream';
import SimulationViewer from './components/SimulationViewer';
import { TaskTree } from './components/TaskTree';
import NotebookCell from './components/NotebookCell';
import SpecViewer from './components/SpecViewer';

const INITIAL_STATE: ResearchState = {
  isActive: false,
  originalPrompt: '',
  branches: [],
  knowledgeBank: [],
  logs: [],
  finalSynthesis: '',
  progress: 0,
  // In backend mode this just means "system ready"
  isPyodideReady: true,
  attachments: [],
};

const App: React.FC = () => {
  const [state, setState] = useState<ResearchState>(INITIAL_STATE);
  const [userInput, setUserInput] = useState('');
  const [kbFilter, setKbFilter] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  
  // Mobile State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileDataOpen, setMobileDataOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isListeningLocal, setIsListeningLocal] = useState(false);
  const [backendSttAvailable, setBackendSttAvailable] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.finalSynthesis, state.logs.length, state.knowledgeBank.length, state.branches]);

  const handleStartResearch = async () => {
    if (!userInput.trim() && state.attachments.length === 0) return;
    try {
      const id = await startResearch(userInput, state.attachments);
      setSessionId(id);
      setState({ ...INITIAL_STATE, isActive: true, originalPrompt: userInput, isPyodideReady: true });
      setSpeechError(null);
    } catch (error: any) {
      console.error(error);
      const message = error?.message || String(error);
      
      // Show user-friendly error message
      if (message.includes("Quota") || message.includes("quota")) {
        setSpeechError("Gemini API quota exhausted. Please wait or upgrade your plan.");
      } else {
        setSpeechError("Failed to start research. Please try again.");
      }
      
      setState(prev => ({ ...prev, isActive: false }));
    }
  };

  const handleEmergencyStop = () => {
      setState(prev => ({ ...prev, isActive: false }));
  };

  const mapBackendToState = (backend: BackendStateResponse) => {
    const branches: ResearchBranch[] = backend.branches.map(b => ({
      id: String(b.id),
      name: b.name,
      status: (b.status as ResearchBranch['status']) || 'active',
      tasks: b.tasks.map((t: any): ResearchTask => ({
        id: String(t.id),
        description: t.description,
        assignedTo: t.assigned_to as AgentType,
        status: t.status === 'running' ? 'active' : (t.status as ResearchTask['status']) || 'pending',
        priority: t.priority,
        dependencies: (t.dependencies || []) as string[],
        result: t.result || undefined,
        groundingUrls: undefined,
        iterationCount: 0,
        critiques: [],
        pythonCode: t.python_code || undefined,
        simulationData: undefined,
        simulationScenarios: undefined,
        experimentSpec: t.experiment_spec as ExperimentSpec | undefined,
      })),
    }));

    const logs: AgentLog[] = backend.logs.map(log => ({
      id: String(log.id),
      timestamp: new Date(log.timestamp).getTime(),
      agentName: log.agent_name,
      message: log.message,
      type: log.type as AgentLog['type'],
      branchId: undefined,
    }));

    const knowledgeBank: KnowledgeFact[] = backend.knowledge.map(k => ({
      id: String(k.id),
      content: k.content,
      sourceAgent: k.source_agent as AgentType,
      timestamp: new Date(k.created_at).getTime(),
      confidence: k.confidence,
    }));

    const totalTasks = branches.reduce((acc, b) => acc + b.tasks.length, 0);
    const doneTasks = branches.reduce(
      (acc, b) => acc + b.tasks.filter(t => t.status === 'done').length,
      0
    );
    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const session = backend.session;

    setState(prev => ({
      ...prev,
      isActive: session.status === 'pending' || session.status === 'running',
      originalPrompt: session.original_prompt,
      branches,
      logs,
      knowledgeBank,
      finalSynthesis: session.final_synthesis || '',
      progress,
      isPyodideReady: true,
      attachments: prev.attachments,
    }));
  };

  const handleToggleBranch = async (branchId: string) => {
    if (!sessionId) return;
    try {
      await toggleBranchPause(Number(branchId));
      const backendState = await fetchResearchState(sessionId);
      mapBackendToState(backendState);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReRunSimulation = async (_taskId: string, _branchId: string, _newCode: string) => {
    // No-op in backend mode for now; simulations are handled by the backend.
    return;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const attachment: Attachment = { name: file.name, content };
      setState(prev => ({ ...prev, attachments: [...prev.attachments, attachment] }));
    };
    reader.readAsText(file);
    // reset input so the same file can be re-selected if needed
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setState(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const toggleVoiceInput = async () => {
    const micActive = isRecording || isListeningLocal;

    // Stop any active recording / local recognition
    if (micActive) {
      if (isRecording) {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
          try {
            recorder.stop();
          } catch (e) {
            console.warn('Failed to stop recorder', e);
          }
        }
        setIsRecording(false);
      }
      if (isListeningLocal && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        setIsListeningLocal(false);
      }
      return;
    }

    setSpeechError(null);

    // If backend STT is exhausted or unavailable, fall back to browser STT
    if (!backendSttAvailable) {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setSpeechError('Speech recognition is not supported in this browser.');
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsListeningLocal(true);
        };

        recognition.onend = () => {
          setIsListeningLocal(false);
        };

        recognition.onerror = (event: any) => {
          console.error('Local speech error:', event.error);
          setIsListeningLocal(false);
          setSpeechError('Local speech recognition failed. Try again or type your prompt.');
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            setUserInput(prev => {
              const trimmed = prev.trim();
              return trimmed ? `${trimmed} ${transcript}` : transcript;
            });
          }
        };

        recognition.start();
      } catch (e) {
        console.error('Failed to start local speech recognition', e);
        setSpeechError('Could not start local speech recognition.');
      }

      return;
    }

    // Backend STT path using MediaRecorder + Gemini STT
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setSpeechError('Microphone not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = event => {
        console.error('MediaRecorder error', event.error);
        setSpeechError('Recording error. Try again.');
        setIsRecording(false);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);

        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        try {
          const transcript = await transcribeSpeech(blob);
          setUserInput(prev => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${transcript}` : transcript;
          });
          setSpeechError(null);
        } catch (e: any) {
          console.error('Transcription failed', e);
          if (e && e.status === 429) {
            setBackendSttAvailable(false);
            setSpeechError(
              'Backend speech quota exhausted. Falling back to browser speech recognition.'
            );
          } else {
            setSpeechError('Transcription failed. Try again or type your prompt.');
          }
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('getUserMedia failed', err);
      setSpeechError('Mic permission denied or unavailable.');
    }
  };

  // Poll backend for updates while a session is active
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const loop = async () => {
      while (!cancelled) {
        try {
          const backendState = await fetchResearchState(sessionId);
          mapBackendToState(backendState);
          const status = backendState.session.status;
          if (status !== 'pending' && status !== 'running') {
            break;
          }
        } catch (e) {
          console.error(e);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    };

    loop();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const getActiveSimulation = () => {
      for (const branch of state.branches) {
          for (const task of branch.tasks) {
              if (task.simulationData && task.simulationData.length > 0) {
                  return { data: task.simulationData, scenarios: task.simulationScenarios, title: task.description };
              }
          }
      }
      return { data: [], scenarios: [], title: '' };
  };

  const { data: simData, scenarios: simScenarios, title: simTitle } = getActiveSimulation();

  const filteredKnowledge = state.knowledgeBank.filter(k => 
      k.content.toLowerCase().includes(kbFilter.toLowerCase()) || 
      k.sourceAgent.toLowerCase().includes(kbFilter.toLowerCase())
  );

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-colossus-900 text-gray-200 overflow-hidden relative">
      
      {/* MOBILE HEADER */}
      <div className="md:hidden h-14 bg-colossus-800 border-b border-colossus-700 flex items-center justify-between px-4 z-20 shrink-0">
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-gray-400 hover:text-white">
              <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-white tracking-tight flex items-center gap-2">
              <Network className="w-4 h-4 text-colossus-accent" /> COLOSSUS
          </span>
          <button onClick={() => setMobileDataOpen(true)} className="p-2 text-gray-400 hover:text-colossus-accent relative">
              <BarChart2 className="w-6 h-6" />
              {simData.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-colossus-accent rounded-full animate-pulse" />}
          </button>
      </div>

      {/* LEFT SIDEBAR (Navigation/Tasks) */}
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
          <div className="fixed inset-0 bg-black/80 z-30 md:hidden backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}
      
      <div className={`
          fixed inset-y-0 left-0 z-40 w-4/5 max-w-xs bg-colossus-800 border-r border-colossus-700 transform transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:w-80 md:flex md:flex-col md:z-auto
          ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="hidden md:flex p-5 border-b border-colossus-700 items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-colossus-accent to-blue-600 rounded-md flex items-center justify-center shadow-lg shadow-colossus-accent/20">
            <Network className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white">COLOSSUS</h1>
            <div className="flex items-center gap-2">
                <p className="text-[10px] font-mono text-colossus-accent uppercase">Scheduler v6.1</p>
                {state.isPyodideReady ? (
                    <span className="w-2 h-2 bg-green-500 rounded-full" title="Runtime Ready"></span>
                ) : (
                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" title="Booting Runtime..."></span>
                )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:hidden p-4 border-b border-colossus-700">
             <span className="text-sm font-bold text-gray-400 uppercase">Navigation</span>
             <button onClick={() => setMobileMenuOpen(false)}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="mb-6">
             <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Priority Graph</h3>
             <TaskTree branches={state.branches} onToggleBranch={handleToggleBranch} />
           </div>

           {state.knowledgeBank.length > 0 && (
               <div className="flex flex-col h-1/2 min-h-[200px]">
                   <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                       <div className="flex items-center gap-2">
                           <Database className="w-3 h-3" /> Knowledge Bank
                       </div>
                       <span className="text-[10px]">{filteredKnowledge.length} axioms</span>
                   </h3>
                   <div className="relative mb-2">
                       <input 
                         type="text" 
                         placeholder="Filter..." 
                         value={kbFilter}
                         onChange={(e) => setKbFilter(e.target.value)}
                         className="w-full bg-colossus-900 border border-colossus-700 rounded text-xs py-1 px-2 pl-7 focus:outline-none focus:border-colossus-accent text-gray-300"
                       />
                       <Search className="w-3 h-3 text-gray-500 absolute left-2 top-1.5" />
                   </div>
                   <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                       {filteredKnowledge.map(fact => (
                           <div key={fact.id} className="bg-colossus-900/50 p-2 rounded border border-colossus-700/50 text-[10px] text-gray-400">
                               <div className="flex justify-between mb-1">
                                   <span className="text-colossus-accent font-bold">[{fact.sourceAgent.split(' ')[0]}]</span>
                               </div>
                               <p className="line-clamp-3">{fact.content}</p>
                           </div>
                       ))}
                   </div>
               </div>
           )}
        </div>
        
        {/* Footer Stats */}
        <div className="p-4 border-t border-colossus-700 bg-colossus-900/50">
          <div className="flex justify-between text-xs mb-2 text-gray-400 font-mono">
             <span>SYSTEM LOAD</span>
             <span>ACTIVE</span>
          </div>
          <div className="h-1.5 w-full bg-colossus-700 rounded-full overflow-hidden">
            {state.isActive && (
                <div className="h-full bg-colossus-accent animate-pulse w-full origin-left"></div>
            )}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 h-[calc(100vh-3.5rem)] md:h-screen">
        {/* Input Header with Attachments */}
        <div className="min-h-[5rem] md:min-h-[6rem] border-b border-colossus-700 bg-colossus-800/50 backdrop-blur-sm flex flex-col justify-center px-4 md:px-6 gap-3 py-3 z-10">
          
          {/* Attachments List */}
          {state.attachments.length > 0 && !state.isActive && (
            <div className="flex flex-wrap gap-2 mb-1">
              {state.attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="bg-colossus-700 text-xs text-gray-300 px-2 py-1 rounded flex items-center gap-2 border border-colossus-600"
                >
                  <FileText className="w-3 h-3 text-colossus-accent" />
                  <span className="max-w-[100px] truncate" title={file.name}>
                    {file.name}
                  </span>
                  <button
                    onClick={() => removeAttachment(idx)}
                    className="hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4">
            <div className="flex-1 relative flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
                accept=".txt,.md,.py,.js,.ts,.json,.csv,.ipynb"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={state.isActive}
                className={`p-2.5 rounded-md border transition-colors ${
                  state.isActive
                    ? 'bg-colossus-900 border-colossus-800 text-gray-600'
                    : 'bg-colossus-900 border-colossus-700 text-gray-400 hover:text-colossus-accent hover:border-colossus-600'
                }`}
                title="Attach Context (File)"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                onClick={toggleVoiceInput}
                disabled={state.isActive}
                className={`p-2.5 rounded-md border transition-colors ${
                  isRecording
                    ? 'bg-red-900/30 border-red-500/50 text-red-400 animate-pulse'
                    : 'bg-colossus-900 border-colossus-700 text-gray-400 hover:text-colossus-accent hover:border-colossus-600'
                }`}
                title="Voice Input (backend speech-to-text)"
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !state.isActive && handleStartResearch()}
                placeholder={
                  state.attachments.length > 0
                    ? 'Instruct Colossus on how to use the attached context...'
                    : 'Enter complex objective or attach data...'
                }
                className="w-full bg-colossus-900 border border-colossus-700 rounded-md px-4 py-2.5 pl-4 text-sm focus:outline-none focus:border-colossus-accent text-gray-100 placeholder-gray-600 transition-colors"
                disabled={state.isActive}
              />
            </div>

            {speechError && !state.isActive && (
              <p className="text-xs text-red-400 md:ml-2">{speechError}</p>
            )}

            {state.isActive ? (
              <button
                onClick={handleEmergencyStop}
                className="h-10 px-4 md:px-6 rounded-md font-medium text-sm flex items-center justify-center gap-2 transition-all bg-red-900/80 text-red-200 hover:bg-red-800 border border-red-700/50 w-full md:w-auto"
              >
                <Square className="w-4 h-4 fill-current" />
                STOP VIEW
              </button>
            ) : (
              <button
                onClick={handleStartResearch}
                disabled={!userInput && state.attachments.length === 0}
                className="h-10 px-4 md:px-6 rounded-md font-medium text-sm flex items-center justify-center gap-2 transition-all w-full md:w-auto bg-colossus-accent text-colossus-900 hover:bg-cyan-300 shadow-lg shadow-colossus-accent/10"
              >
                <Play className="w-4 h-4" />
                INITIATE
              </button>
            )}
          </div>
        </div>

        {/* Content Split */}
        <div className="flex-1 flex overflow-hidden relative">
          
          {/* Center: Research Feed */}
          <div className="flex-1 flex flex-col border-r border-colossus-700 md:max-w-4xl w-full">
             <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 custom-scrollbar" ref={scrollRef}>
               {!state.isActive && state.branches.length === 0 && (
                 <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-4 px-6 text-center">
                    <Atom className="w-12 h-12 md:w-16 md:h-16 opacity-20 animate-spin-slow" />
                    <p className="text-sm font-mono">AWAITING COMPLEX DIRECTIVE</p>
                    <p className="text-xs text-gray-700 max-w-md leading-5">
                        Colossus v6.1 Scheduler Online.
                    </p>
                 </div>
               )}

               {state.branches.map((branch) => (
                   <div key={branch.id} className={`space-y-6 transition-opacity duration-500 ${branch.status === 'paused' ? 'opacity-50 grayscale-[0.5]' : 'opacity-100'}`}>
                       {branch.tasks.map(task => task.result && (
                           <div key={task.id} className="animate-fade-in-up group">
                               <div className="flex items-center gap-2 md:gap-3 mb-2 flex-wrap">
                                   <span className={`px-2 py-1 rounded text-xs font-mono ${branch.status === 'paused' ? 'bg-gray-800 text-gray-500' : 'bg-colossus-700 text-gray-400'}`}>{branch.name}</span>
                                   <span className="text-colossus-accent font-bold text-sm">{task.assignedTo}</span>
                                   {task.priority > 8 && (
                                        <span className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded border border-red-700">CRITICAL</span>
                                   )}
                               </div>
                               
                               <div className="prose prose-invert prose-sm max-w-none text-gray-300 bg-colossus-800/30 p-4 md:p-6 rounded-lg border border-colossus-700/50 shadow-xl break-words">
                                   <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                     {task.result}
                                   </ReactMarkdown>
                                   
                                   {task.pythonCode && (
                                       <NotebookCell 
                                          code={task.pythonCode} 
                                          onRun={(code) => handleReRunSimulation(task.id, branch.id, code)}
                                          readOnly={branch.status === 'paused'}
                                       />
                                   )}

                                   {task.experimentSpec && <SpecViewer spec={task.experimentSpec} />}

                                   {task.groundingUrls && task.groundingUrls.length > 0 && (
                                       <div className="mt-4 pt-4 border-t border-gray-700/50">
                                           <p className="text-xs font-bold text-gray-500 mb-2">References:</p>
                                           <ul className="list-disc list-inside text-xs text-blue-400 space-y-1">
                                               {task.groundingUrls.map((url, idx) => (
                                                   <li key={idx} className="truncate hover:text-blue-300">
                                                       <a href={url} target="_blank" rel="noreferrer">{url}</a>
                                                   </li>
                                               ))}
                                           </ul>
                                       </div>
                                   )}
                               </div>
                           </div>
                       ))}
                   </div>
               ))}

               {state.finalSynthesis && (
                 <div className="border-t-4 border-colossus-accent pt-8 mt-12 pb-20">
                    <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center gap-3">
                      <Atom className="w-6 h-6 text-colossus-accent" />
                      Final Research Synthesis
                    </h2>
                    <div className="prose prose-invert max-w-none text-gray-200 bg-gradient-to-b from-colossus-800 to-colossus-900 p-4 md:p-8 rounded-xl border border-colossus-600 shadow-2xl break-words">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {state.finalSynthesis}
                      </ReactMarkdown>
                    </div>
                 </div>
               )}
             </div>
          </div>

          {/* RIGHT PANEL (Viz & Logs) - Drawer on Mobile */}
          {/* Mobile Overlay */}
          {mobileDataOpen && (
              <div className="fixed inset-0 bg-black/80 z-30 md:hidden backdrop-blur-sm" onClick={() => setMobileDataOpen(false)} />
          )}

          <div className={`
              fixed inset-y-0 right-0 z-40 w-4/5 max-w-md bg-colossus-900 border-l border-colossus-700 transform transition-transform duration-300 ease-in-out flex flex-col
              md:relative md:translate-x-0 md:w-96 md:flex md:z-auto
              ${mobileDataOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}
          `}>
             {/* Mobile Close Button */}
             <div className="flex items-center justify-between md:hidden p-4 border-b border-colossus-700">
                 <span className="text-sm font-bold text-gray-400 uppercase">Data & Logs</span>
                 <button onClick={() => setMobileDataOpen(false)}><X className="w-5 h-5" /></button>
             </div>

             <div className="h-1/2 p-4 border-b border-colossus-700 flex flex-col min-h-[250px]">
               <SimulationViewer 
                 data={simData} 
                 scenarios={simScenarios}
                 title={simTitle}
                 isActive={state.isActive} 
               />
             </div>
             <div className="h-1/2 p-4 flex-1 overflow-hidden flex flex-col min-h-[250px]">
               <LogStream logs={state.logs} />
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;
