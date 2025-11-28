import React from 'react';

interface RaceResult {
  id: string;
  name: string;
  rank: number;
  checkpoints: number;
  isLocal: boolean;
}

interface VictoryScreenProps {
  results: RaceResult[];
  onClose: () => void;
}

export const VictoryScreen: React.FC<VictoryScreenProps> = ({ results, onClose }) => {
  const winner = results.find(r => r.rank === 1);
  const localPlayer = results.find(r => r.isLocal);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <div className="bg-gradient-to-b from-yellow-900 to-orange-900 p-10 rounded-3xl border border-yellow-500/30 text-center shadow-2xl max-w-lg w-full relative overflow-hidden">
        
        {/* Background shine effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-yellow-400/10 to-transparent animate-pulse pointer-events-none"></div>

        <div className="relative z-10">
          <h2 className="text-5xl font-black text-white mb-2 tracking-wider drop-shadow-lg italic">RACE FINISHED!</h2>
          
          <div className="text-2xl text-yellow-300 mb-8 font-bold">
            Winner: {winner?.name || 'Unknown'}
          </div>

          <div className="bg-black/30 rounded-xl p-4 mb-8 max-h-60 overflow-y-auto custom-scrollbar">
            <div className="text-xs uppercase tracking-widest text-orange-300 mb-3 border-b border-white/10 pb-2">Final Standings</div>
            <div className="space-y-3">
              {results.sort((a, b) => a.rank - b.rank).map((player) => (
                <div 
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    player.isLocal ? 'bg-yellow-600/40 border border-yellow-500/50' : 'bg-black/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center font-black text-sm
                      ${player.rank === 1 ? 'bg-yellow-400 text-black' : 
                        player.rank === 2 ? 'bg-gray-300 text-black' :
                        player.rank === 3 ? 'bg-orange-700 text-white' : 'bg-gray-700 text-gray-400'}
                    `}>
                      {player.rank}
                    </div>
                    <span className={`font-medium ${player.isLocal ? 'text-white' : 'text-gray-300'}`}>
                      {player.name} {player.isLocal && '(You)'}
                    </span>
                  </div>
                  <span className="text-orange-400 font-mono font-bold text-sm">
                    {player.checkpoints} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          <button
            onClick={() => {
              onClose();
              // Force reload to ensure clean state if needed, or rely on GameScene cleanup
              // For now, just close, but GameScene should handle resetting mode
            }}
            className="px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl transition-all transform hover:scale-105 shadow-lg text-lg uppercase tracking-widest"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};

