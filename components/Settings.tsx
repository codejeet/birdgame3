import React, { useState, useEffect } from 'react';

export interface GameSettings {
  mouseSensitivity: number;
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1.0,
  musicVolume: 0.1,
  sfxVolume: 0.05,
  musicMuted: false,
  sfxMuted: false
};

export function loadSettings(): GameSettings {
  try {
    const saved = localStorage.getItem('birdgame-settings');
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: GameSettings) {
  try {
    localStorage.setItem('birdgame-settings', JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: GameSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, onSettingsChange }) => {
  const [settings, setSettings] = useState<GameSettings>(loadSettings());

  useEffect(() => {
    if (isOpen) {
      setSettings(loadSettings());
    }
  }, [isOpen]);

  const handleChange = (key: keyof GameSettings, value: number | boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange(newSettings);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-b from-slate-900 to-slate-800 p-10 rounded-3xl border border-white/20 text-center shadow-2xl backdrop-blur-md transform transition-all max-w-2xl w-full">
        <h2 className="text-5xl font-black text-white mb-8 tracking-wider drop-shadow-lg italic">SETTINGS</h2>
        
        <div className="space-y-6 text-left">
          {/* Mouse Sensitivity */}
          <div className="bg-black/20 p-4 rounded-xl border border-white/10">
            <label className="block text-white font-bold mb-3 text-lg">
              Flying Mouse Sensitivity: {settings.mouseSensitivity.toFixed(2)}x
            </label>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.1"
              value={settings.mouseSensitivity}
              onChange={(e) => handleChange('mouseSensitivity', parseFloat(e.target.value))}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Slow</span>
              <span>Fast</span>
            </div>
          </div>

          {/* Music Volume */}
          <div className="bg-black/20 p-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <label className="text-white font-bold text-lg">
                Music Volume: {Math.round(settings.musicVolume * 100)}%
              </label>
              <button
                onClick={() => handleChange('musicMuted', !settings.musicMuted)}
                className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                  settings.musicMuted 
                    ? 'bg-red-600 hover:bg-red-500 text-white' 
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {settings.musicMuted ? '🔇 Muted' : '🔊 On'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.musicVolume}
              onChange={(e) => handleChange('musicVolume', parseFloat(e.target.value))}
              disabled={settings.musicMuted}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider disabled:opacity-50"
            />
            <p className="text-xs text-gray-400 mt-2">🎵 Lofi beats stream - continuous chill vibes</p>
          </div>

          {/* SFX Volume */}
          <div className="bg-black/20 p-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <label className="text-white font-bold text-lg">
                SFX Volume: {Math.round(settings.sfxVolume * 100)}%
              </label>
              <button
                onClick={() => handleChange('sfxMuted', !settings.sfxMuted)}
                className={`px-4 py-2 rounded-lg font-bold transition-colors ${
                  settings.sfxMuted 
                    ? 'bg-red-600 hover:bg-red-500 text-white' 
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {settings.sfxMuted ? '🔇 Muted' : '🔊 On'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.sfxVolume}
              onChange={(e) => handleChange('sfxVolume', parseFloat(e.target.value))}
              disabled={settings.sfxMuted}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer slider disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <button
            onClick={() => {
              const defaults = DEFAULT_SETTINGS;
              setSettings(defaults);
              saveSettings(defaults);
              onSettingsChange(defaults);
            }}
            className="flex-1 px-8 py-4 bg-transparent border-2 border-white/30 text-white hover:bg-white/10 font-bold rounded-xl transition-all text-lg uppercase tracking-widest"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-8 py-4 bg-yellow-400 hover:bg-yellow-300 text-black font-bold rounded-xl transition-all transform hover:scale-105 hover:shadow-lg text-lg uppercase tracking-widest"
          >
            Close
          </button>
        </div>
        
        <p className="mt-6 text-white/50 text-xs">Press ESC to open/close settings</p>
      </div>
    </div>
  );
};

