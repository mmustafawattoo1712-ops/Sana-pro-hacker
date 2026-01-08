
import React, { useState, useEffect } from 'react';
import SanaAssistant from './components/SanaAssistant';

const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Simulate initial loading
    const timer = setTimeout(() => setIsInitializing(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h1 className="text-xl font-light tracking-widest text-emerald-400">SANA</h1>
      </div>
    );
  }

  // SanaAssistant now incorporates the lock/unlock logic internally
  // Using 100dvh ensures it fits perfectly on mobile screens ignoring address bars
  return (
    <div className="h-[100dvh] w-full bg-neutral-950 overflow-hidden relative">
      <SanaAssistant />
    </div>
  );
};

export default App;
