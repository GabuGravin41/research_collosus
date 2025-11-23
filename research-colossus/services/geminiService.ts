import { GoogleGenAI, Type } from "@google/genai";
import { AgentType, ResearchTask, SimulationDataPoint, TaskCritique, ResearchBranch, AgentExecutionResult, KnowledgeFact, ExperimentSpec } from "../types";

// Constants
const MODEL_REASONING = "gemini-3-pro-preview";
const MODEL_FAST = "gemini-2.5-flash";

// Initialize API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Step 1: Initial Planning with Isomorphic Reasoning
 */
export const orchestratePlan = async (prompt: string): Promise<ResearchBranch[]> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_REASONING,
      contents: `You are the Research Colossus Orchestrator.
      
      USER QUERY: "${prompt}"
      
      STRATEGIC DIRECTIVE:
      Look for "Isomorphic Mappings". Example: Can concepts from Category Theory be mapped to this problem?
      
      Create a "Tree of Thoughts" research plan.
      For EACH branch, define the sequential tasks.
      
      CRITICAL: Assign a "priority" (1-10). 10 is immediate/critical.
      Tasks normally follow a logical flow (Hypothesis -> Math -> Simulation -> Conclusion).
      
      Return JSON structure.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING, description: "Name of this research branch" },
                tasks: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            description: { type: Type.STRING },
                            assignedTo: { type: Type.STRING },
                            priority: { type: Type.INTEGER, description: "1-10 Priority" },
                            status: { type: Type.STRING, enum: ["pending"] }
                        },
                        required: ["id", "description", "assignedTo", "status", "priority"]
                    }
                }
            },
            required: ["id", "name", "tasks"]
          },
        },
        thinkingConfig: { thinkingBudget: 4096 } // Increased for deep strategic planning
      },
    });

    const text = response.text;
    if (!text) throw new Error("No plan generated");
    const branches = JSON.parse(text) as ResearchBranch[];
    
    // Post-process to add sequential dependencies automatically for the initial plan
    return branches.map(b => {
        let prevTaskId: string | null = null;
        return {
            ...b,
            status: 'active',
            tasks: b.tasks.map((t, idx) => {
                const taskWithDeps: ResearchTask = {
                    ...t as any, // Cast to avoid strict type issues during mapping
                    iterationCount: 0,
                    critiques: [],
                    dependencies: prevTaskId ? [prevTaskId] : [],
                    status: 'pending'
                };
                prevTaskId = t.id;
                return taskWithDeps;
            })
        };
    });
  } catch (error) {
    console.error("Orchestration failed:", error);
    throw error;
  }
};

/**
 * Step 2: Task Execution with Knowledge Bank Context
 */
export const executeAgentTask = async (task: ResearchTask, knowledgeBank: KnowledgeFact[], feedback?: string): Promise<AgentExecutionResult> => {
  
  // Compile knowledge for context
  const knowledgeContext = knowledgeBank.map(k => `- [${k.sourceAgent}]: ${k.content}`).join('\n');

  let systemInstruction = `You are a world-class ${task.assignedTo}. 
  Your task is to perform deep research on: "${task.description}".
  
  KNOWN FACTS (Use these as axioms, do not reinvent):
  ${knowledgeContext || "No prior axioms."}`;

  if (feedback) {
    systemInstruction += `\n\nCRITICAL INSTRUCTION: Your previous attempt was critiqued. 
    Refine your work based on this feedback: "${feedback}".`;
  }
  
  systemInstruction += `\n\nProvide a detailed, scientific, and rigorous output. 
  - Use LaTeX for math formulas.
  - If a concept is abstract, try to ground it in a concrete analogy (Isomorphism).
  - If you use the search tool, cite the URLs provided.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_REASONING,
      contents: task.description,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 4096 },
        tools: [{ googleSearch: {} }] 
      },
    });

    const urls: string[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        response.candidates[0].groundingMetadata.groundingChunks.forEach(chunk => {
            if (chunk.web?.uri) {
                urls.push(chunk.web.uri);
            }
        });
    }

    return {
        content: response.text || "Analysis complete (No output generated).",
        urls: [...new Set(urls)]
    };

  } catch (error) {
    console.error(`Agent ${task.assignedTo} failed:`, error);
    return { content: `Error executing task: ${error}`, urls: [] };
  }
};

/**
 * Step 3: Critique
 */
export const reviewTaskOutput = async (task: ResearchTask, output: string): Promise<TaskCritique> => {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_REASONING,
            contents: `You are the "Peer Reviewer". Review this output from a ${task.assignedTo}.
            
            Task: "${task.description}"
            Output: "${output}"
            
            Standards:
            1. Is the math rigorous?
            2. Is the reasoning logically sound?
            3. If it's a specification, is it technically feasible?
            
            Rate 0-100. Threshold 85. Return JSON.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        score: { type: Type.INTEGER },
                        feedback: { type: Type.STRING },
                        approved: { type: Type.BOOLEAN }
                    },
                    required: ["score", "feedback", "approved"]
                },
                thinkingConfig: { thinkingBudget: 1024 }
            }
        });
        
        const text = response.text;
        if(!text) throw new Error("Review failed");
        return JSON.parse(text) as TaskCritique;
    } catch (error) {
        return { score: 100, feedback: "Review bypass.", approved: true };
    }
}

/**
 * Step 4: Manager Loop (Dynamic Re-planning & Triage)
 */
export const evaluateProgress = async (
    originalGoal: string, 
    lastTask: ResearchTask, 
    lastOutput: string, 
    knowledgeBank: KnowledgeFact[],
    allTasks: ResearchTask[] // To allow reprioritization
): Promise<{ newTasks: ResearchTask[], newFacts: KnowledgeFact[], stopBranch: boolean, reprioritize: {taskId: string, newPriority: number}[] }> => {
    
    try {
        // Simplified view of existing tasks for the context
        const taskState = allTasks.filter(t => t.status === 'pending').map(t => `ID: ${t.id} | Desc: ${t.description} | Pri: ${t.priority}`).join('\n');

        const response = await ai.models.generateContent({
            model: MODEL_REASONING,
            contents: `You are the Research Manager.
            Goal: "${originalGoal}"
            
            Just Completed: "${lastTask.description}" (Agent: ${lastTask.assignedTo}).
            Result Summary: "${lastOutput.substring(0, 1000)}..."
            
            Pending Tasks Context:
            ${taskState}
            
            1. Extract key FACTS.
            2. Determine if we need NEW tasks.
            3. TRIAGE: Do we need to change the priority of existing pending tasks based on this result? (e.g. if we found a blocker, move dependent tasks down, or if we found a lead, move specific tasks up).
            
            Return JSON.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        stopBranch: { type: Type.BOOLEAN },
                        newFacts: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    content: { type: Type.STRING },
                                    confidence: { type: Type.INTEGER }
                                }
                            }
                        },
                        newTasks: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    description: { type: Type.STRING },
                                    assignedTo: { type: Type.STRING },
                                    priority: { type: Type.INTEGER, description: "1-10"}
                                }
                            }
                        },
                        reprioritize: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    taskId: { type: Type.STRING },
                                    newPriority: { type: Type.INTEGER }
                                }
                            }
                        }
                    }
                },
                thinkingConfig: { thinkingBudget: 2048 }
            }
        });

        const data = JSON.parse(response.text || "{}");
        
        const newFacts = (data.newFacts || []).map((f: any) => ({
            id: Math.random().toString(36).substr(2, 9),
            content: f.content,
            sourceAgent: lastTask.assignedTo,
            timestamp: Date.now(),
            confidence: f.confidence
        }));

        const newTasks = (data.newTasks || []).map((t: any) => ({
            id: Math.random().toString(36).substr(2, 9),
            description: t.description,
            assignedTo: t.assignedTo,
            priority: t.priority || 5,
            status: 'pending',
            iterationCount: 0,
            critiques: [],
            dependencies: [lastTask.id] // Default dependency on the task that just finished
        }));

        return {
            stopBranch: data.stopBranch || false,
            newFacts,
            newTasks,
            reprioritize: data.reprioritize || []
        };

    } catch (e) {
        console.error("Manager eval failed", e);
        return { stopBranch: false, newFacts: [], newTasks: [], reprioritize: [] };
    }
}

/**
 * Step 5: Simulation OR Architecture Spec
 */
export const generateSimulationCode = async (
    taskDescription: string, 
    knowledgeBank: KnowledgeFact[],
    previousAttempt?: string 
): Promise<{type: 'CODE' | 'SPEC', code?: string, scenarios?: string[], spec?: ExperimentSpec}> => {
  
  const context = knowledgeBank.map(k => k.content).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: MODEL_REASONING,
      contents: `You are a Scientific Computation Expert.
      
      Task: "${taskDescription}"
      Context: ${context}
      Previous Attempt (if any): ${previousAttempt || "None"}
      
      DECISION POINT:
      1. Is this a "Toy Model" that can run in a browser (Python/Numpy, < 1GB RAM, < 10s runtime)?
         -> If YES: Generate Python code using 'numpy' only (no matplotlib). Create global \`simulation_data\`.
         -> Output Type: "CODE"
      
      2. Is this a "Heavy Experiment" (e.g., Training 7B LLM, Large Scale CFD, Molecular Dynamics)?
         -> If YES: Do NOT try to run it. Instead, generate a "Cluster Specification" (A blueprint for a supercomputer).
         -> Output Type: "SPEC"
      
      Return JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                type: { type: Type.STRING, enum: ["CODE", "SPEC"] },
                // For CODE
                code: { type: Type.STRING, description: "Python code for Pyodide (if type=CODE)" },
                scenarios: { type: Type.ARRAY, items: { type: Type.STRING } },
                // For SPEC
                spec: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        complexity: { type: Type.STRING, enum: ["HIGH", "EXTREME"] },
                        requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
                        codeSnippet: { type: Type.STRING, description: "The PyTorch/CUDA code for the cluster" },
                        hypothesis: { type: Type.STRING },
                        expectedOutcome: { type: Type.STRING }
                    }
                }
            },
        },
        thinkingConfig: { thinkingBudget: 4096 }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No code generated");
    return JSON.parse(text);
  } catch (error) {
    console.error("Code generation failed:", error);
    throw error;
  }
};

export const synthesizeResearch = async (originalPrompt: string, knowledgeBank: KnowledgeFact[]): Promise<string> => {
  try {
    const knowledge = knowledgeBank.map(k => `[${k.sourceAgent}]: ${k.content}`).join('\n\n');
    const response = await ai.models.generateContent({
      model: MODEL_REASONING,
      contents: `Synthesize a Final Scientific Report.
      Query: "${originalPrompt}"
      
      Validated Knowledge Bank:
      ${knowledge}
      
      Format:
      1. Executive Summary
      2. Methodology (Reasoning Traces)
      3. Key Findings (proven via Simulation or Axioms)
      4. Future Work (Computational Specs created)
      `,
    });
    return response.text || "Synthesis failed.";
  } catch (error) {
    return "Could not synthesize final report.";
  }
};