import React from 'react';
import { HunterDashboard } from './components/HunterDashboard';
import { motion, AnimatePresence } from 'motion/react';

function App() {
  return (
    <div className="min-h-screen bg-slate-950 selection:bg-blue-500/30 selection:text-blue-200">
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <HunterDashboard />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default App;
