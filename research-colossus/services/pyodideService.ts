declare global {
  interface Window {
    loadPyodide: any;
  }
}

let pyodideInstance: any = null;

export const initPyodide = async (): Promise<boolean> => {
  try {
    if (!pyodideInstance) {
      console.log("Initializing Pyodide...");
      pyodideInstance = await window.loadPyodide();
      console.log("Pyodide Loaded. Loading Numpy...");
      await pyodideInstance.loadPackage("numpy");
      console.log("Numpy Loaded.");
    }
    return true;
  } catch (e) {
    console.error("Failed to load Pyodide", e);
    return false;
  }
};

export const runPythonSimulation = async (code: string): Promise<any[]> => {
  if (!pyodideInstance) {
    throw new Error("Pyodide not initialized");
  }

  try {
    // We wrap the code to ensure it catches the output safely.
    // The model is instructed to create a variable `simulation_data`.
    // We assume the code is self-contained.
    
    console.log("Executing Python Code...");
    await pyodideInstance.runPythonAsync(code);
    
    // Extract the global variable
    const data = pyodideInstance.globals.get('simulation_data');
    
    if (!data) {
        console.warn("No 'simulation_data' variable found in Python scope.");
        return [];
    }
    
    // Convert Python list/dict to JS
    const jsData = data.toJs();
    
    // Cleanup
    data.destroy();
    
    return jsData;
  } catch (error) {
    console.error("Python Execution Error:", error);
    throw error;
  }
};