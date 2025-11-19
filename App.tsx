import React from 'react';
import { GameScene } from './components/GameScene';

const App: React.FC = () => {
  return (
    <div className="w-full h-screen overflow-hidden bg-blue-300">
      <GameScene />
    </div>
  );
};

export default App;
