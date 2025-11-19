
import React, { useEffect, useRef } from 'react';
import { GameStats } from '../types';

interface HUDProps {
  statsRef: React.MutableRefObject<GameStats>;
}

export const HUD: React.FC<HUDProps> = ({ statsRef }) => {
  // Refs for direct DOM updates to avoid React render cycles
  const scoreRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  
  // Mini-game refs
  const ringPanelRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const feathersRef = useRef<HTMLDivElement>(null);

  // AI Content Refs
  const missionRef = useRef<HTMLDivElement>(null);
  const loreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rAFId: number;
    let lastScore = -1;
    let lastAlt = -1;
    let lastSpeed = -1;
    
    let lastActive = false;
    let lastCombo = -1;
    let lastFeathers = -1;
    
    let lastMission = '';
    let lastLore = '';
    
    const update = () => {
      if (statsRef.current) {
        const { score, altitude, speed, isRingGameActive, combo, feathers, currentMission, currentZoneLore } = statsRef.current;
        
        // Score
        if (score !== lastScore) {
           if (scoreRef.current) scoreRef.current.innerText = score.toString();
           lastScore = score;
        }
        
        // Alt
        const displayAlt = Math.max(0, Math.round(altitude));
        if (displayAlt !== lastAlt) {
           if (altRef.current) altRef.current.innerText = displayAlt + " m";
           lastAlt = displayAlt;
        }
        
        // Speed
        const displaySpeed = Math.round(speed * 100);
        if (displaySpeed !== lastSpeed) {
           if (speedRef.current) speedRef.current.innerText = displaySpeed + " km/h";
           lastSpeed = displaySpeed;
        }
        
        // Speed Bar
        if (barRef.current) {
            const speedPercent = Math.min((speed / 2) * 100, 100);
            barRef.current.style.width = `${speedPercent}%`;
        }

        // AI Mission Update
        if (currentMission !== lastMission) {
            if (missionRef.current) {
                missionRef.current.innerText = currentMission || "No Active Mission";
                missionRef.current.style.opacity = currentMission ? '1' : '0.5';
                if (currentMission) {
                     missionRef.current.classList.add('animate-pulse');
                     setTimeout(() => missionRef.current?.classList.remove('animate-pulse'), 1000);
                }
            }
            lastMission = currentMission;
        }

        // AI Lore Update
        if (currentZoneLore !== lastLore) {
            if (loreRef.current) {
                loreRef.current.innerText = currentZoneLore || "";
                loreRef.current.style.opacity = currentZoneLore ? '1' : '0';
                loreRef.current.style.transform = currentZoneLore ? 'translateY(0)' : 'translateY(10px)';
            }
            lastLore = currentZoneLore;
        }

        // Ring Game HUD Logic
        if (ringPanelRef.current) {
            if (isRingGameActive !== lastActive) {
                ringPanelRef.current.style.opacity = isRingGameActive ? '1' : '0';
                ringPanelRef.current.style.transform = isRingGameActive ? 'translateY(0)' : 'translateY(-20px)';
                lastActive = isRingGameActive;
            }
            
            if (isRingGameActive) {
                if (combo !== lastCombo) {
                    if (comboRef.current) comboRef.current.innerText = `x${combo}`;
                    lastCombo = combo;
                }
                
                if (feathers !== lastFeathers) {
                    if (feathersRef.current) {
                        feathersRef.current.innerText = '🪶'.repeat(Math.max(0, feathers));
                    }
                    lastFeathers = feathers;
                }
            }
        }
      }
      rAFId = requestAnimationFrame(update);
    };
    
    update();
    
    return () => cancelAnimationFrame(rAFId);
  }, [statsRef]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none p-6 flex flex-col justify-between z-10">
      
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2">
         <div className="absolute w-[2px] h-full bg-white/40 left-1/2 -translate-x-1/2 rounded-full"></div>
         <div className="absolute h-[2px] w-full bg-white/40 top-1/2 -translate-y-1/2 rounded-full"></div>
      </div>

      {/* Mission Display (AI Powered) */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-md text-center pointer-events-none">
         <div 
            ref={missionRef} 
            className="text-lg md:text-xl text-yellow-300 font-bold font-mono drop-shadow-md transition-opacity duration-500 opacity-0 bg-black/20 backdrop-blur-sm py-2 px-6 rounded-full inline-block border border-white/10"
         >
         </div>
      </div>
      
      {/* Zone Lore Display (AI Powered) */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl text-center pointer-events-none">
         <div 
            ref={loreRef} 
            className="text-sm md:text-base text-white/90 font-serif italic drop-shadow-md transition-all duration-1000 opacity-0 transform translate-y-4 bg-indigo-900/30 backdrop-blur-md p-4 rounded-xl border border-white/5"
         >
         </div>
      </div>

      {/* Top Section: Score, Title, Stats, and Controls */}
      <div className="flex justify-between items-start w-full relative">
        {/* Left: Score */}
        <div className="flex flex-col gap-4">
            <div className="bg-black/30 backdrop-blur-md p-4 rounded-xl text-white border border-white/10 shadow-lg">
            <div className="text-xs uppercase tracking-widest text-blue-300 mb-1">Score</div>
            <div ref={scoreRef} className="text-4xl font-bold text-yellow-400 font-mono">0</div>
            </div>

            {/* Ring Game HUD Panel */}
            <div 
                ref={ringPanelRef} 
                className="bg-gradient-to-r from-indigo-900/80 to-purple-900/80 backdrop-blur-md p-4 rounded-xl text-white border border-white/20 shadow-xl transition-all duration-500 opacity-0 -translate-y-4"
            >
                <div className="text-xs uppercase tracking-widest text-pink-300 mb-2 border-b border-white/10 pb-1">Ring Run</div>
                <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center w-32">
                        <span className="text-xs text-gray-300">COMBO</span>
                        <span ref={comboRef} className="text-2xl font-black text-cyan-400 italic">x0</span>
                    </div>
                    <div className="flex justify-between items-center w-32">
                        <span className="text-xs text-gray-300">LIFE</span>
                        <span ref={feathersRef} className="text-lg tracking-widest">🪶🪶🪶</span>
                    </div>
                </div>
            </div>
        </div>
        
        {/* Persistent Title */}
        <h1 className="absolute left-1/2 -translate-x-1/2 top-2 text-4xl font-black text-white/90 tracking-tighter drop-shadow-lg italic">
          BIRD GAME 3
        </h1>
        
        {/* Right: Stats & Controls */}
        <div className="flex flex-col gap-2 items-end">
            {/* Stats */}
            <div className="bg-black/30 backdrop-blur-md p-4 rounded-xl text-white border border-white/10 shadow-lg flex flex-col gap-2 w-48">
               <div className="flex justify-between items-center">
                  <span className="text-xs uppercase tracking-widest text-gray-300">ALT</span>
                  <span ref={altRef} className="font-mono font-bold">0 m</span>
               </div>
               <div>
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs uppercase tracking-widest text-gray-300">SPD</span>
                    <span ref={speedRef} className="font-mono font-bold text-xs">0 km/h</span>
                 </div>
                 <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                   <div 
                      ref={barRef}
                      className="h-full bg-gradient-to-r from-blue-400 to-cyan-300"
                      style={{ width: '0%' }}
                    />
                 </div>
               </div>
            </div>

            {/* Persistent Controls Note */}
            <div className="bg-black/30 backdrop-blur-md p-3 rounded-xl text-white border border-white/10 shadow-lg w-48">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2 border-b border-white/10 pb-1">Controls</div>
                <ul className="text-[10px] font-mono space-y-1 text-gray-200">
                    <li className="flex justify-between"><span>Move</span><span className="text-yellow-400 font-bold">WASD</span></li>
                    <li className="flex justify-between"><span>Fly/Steer</span><span className="text-yellow-400 font-bold">Mouse</span></li>
                    <li className="flex justify-between"><span>Flap</span><span className="text-yellow-400 font-bold">L-CLICK / SPC</span></li>
                    <li className="flex justify-between"><span>Dive</span><span className="text-yellow-400 font-bold">R-CLICK</span></li>
                    <li className="flex justify-between"><span>Boost</span><span className="text-yellow-400 font-bold">SHIFT</span></li>
                    <li className="flex justify-between"><span>Reset</span><span className="text-yellow-400 font-bold">R</span></li>
                    <li className="flex justify-between"><span>Cursor</span><span className="text-yellow-400 font-bold">ESC</span></li>
                </ul>
            </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-white/30 text-xs">
        Procedural World Gen v1.2
      </div>
    </div>
  );
};
