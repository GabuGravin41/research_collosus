
export enum AgentStatus {
  IDLE = 'IDLE',
  THINKING = 'THINKING',
  WORKING = 'WORKING',
  REVIEWING = 'REVIEWING',
  REFINING = 'REFINING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum AgentType {
  ORCHESTRATOR = 'Orchestrator',
  MANAGER = 'Research Manager',
  PHYSICIST = 'Theoretical Physicist',
  CHEMIST = 'Computational Chemist',
  MATHEMATICIAN = 'Mathematician',
  SIMULATOR = 'Simulation Engine',
  CRITIC = 'Peer Reviewer',
  ARCHITECT = 'System Architect'
}

export interface AgentLog {
  id: string;
  timestamp: number;
  agentName: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'data' | 'critic';
  branchId?: string;
}

export interface SimulationDataPoint {
  x: number | string;
  [key: string]: number | string | undefined; 
}

export interface TaskCritique {
  score: number;
  feedback: string;
  approved: boolean;
}

export interface KnowledgeFact {
    id: string;
    content: string;
    sourceAgent: AgentType;
    timestamp: number;
    confidence: number; // 0-100
}

export interface Attachment {
  name: string;
  content: string;
}

export interface ExperimentSpec {
  title: string;
  complexity: 'LOW' | 'HIGH' | 'EXTREME';
  requirements: string[]; // e.g. "8x H100 GPUs", "PyTorch 2.1"
  codeSnippet: string; // The heavy code (not run locally)
  hypothesis: string;
  expectedOutcome: string;
}

export interface ResearchTask {
  id: string;
  description: string;
  assignedTo: AgentType;
  status: 'pending' | 'active' | 'reviewing' | 'refining' | 'done' | 'blocked';
  priority: number; // 1 (Low) to 10 (Critical)
  dependencies: string[]; // IDs of tasks that must finish first
  result?: string;
  groundingUrls?: string[]; 
  iterationCount: number;
  critiques: TaskCritique[];
  
  // Notebook capability (Local/Toy)
  pythonCode?: string; 
  simulationData?: SimulationDataPoint[];
  simulationScenarios?: string[]; 

  // Heavy Compute Capability (Spec)
  experimentSpec?: ExperimentSpec;
}

export interface ResearchBranch {
  id: string;
  name: string;
  tasks: ResearchTask[];
  status: 'active' | 'paused' | 'completed' | 'discarded';
}

export interface ResearchState {
  isActive: boolean;
  originalPrompt: string;
  branches: ResearchBranch[]; 
  knowledgeBank: KnowledgeFact[]; // Shared memory
  logs: AgentLog[];
  finalSynthesis: string;
  progress: number;
  isPyodideReady: boolean;
  attachments: Attachment[];
  // executionQueue is removed in favor of dynamic priority calculation
}

export interface AgentExecutionResult {
  content: string;
  urls: string[];
}
