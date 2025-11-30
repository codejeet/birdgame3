
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { GameSettings } from './Settings';

export interface AudioHandle {
    playFlap: () => void;
    playRingCollect: () => void;
    playRingMiss: () => void;
    playGameStart: () => void;
    playGameOver: () => void;
}

interface AudioControllerProps {
    isPaused: boolean;
    settings: GameSettings;
}

// Chunked lofi stream files (split for git compatibility)
const LOFI_PARTS = [
    '/music/lofi-part-00.mp3',
    '/music/lofi-part-01.mp3',
    '/music/lofi-part-02.mp3',
    '/music/lofi-part-03.mp3',
    '/music/lofi-part-04.mp3',
    '/music/lofi-part-05.mp3',
    '/music/lofi-part-06.mp3',
    '/music/lofi-part-07.mp3',
    '/music/lofi-part-08.mp3',
];

// Pick a random starting part on module load (persists for session)
const INITIAL_PART = Math.floor(Math.random() * LOFI_PARTS.length);

export const AudioController = forwardRef<AudioHandle, AudioControllerProps>(({ isPaused, settings }, ref) => {
    const bgmRef = useRef<HTMLAudioElement | null>(null);
    const currentPartRef = useRef(INITIAL_PART);
    const hasInteractedRef = useRef(false);
    
    // Multiple chirp sounds for variety
    const chirpRefs = useRef<HTMLAudioElement[]>([]);

    // SFX Refs
    const ringCollectRef = useRef<HTMLAudioElement | null>(null);
    const gameStartRef = useRef<HTMLAudioElement | null>(null);

    // Play next part in the lofi stream
    const playNextPart = useCallback(() => {
        if (!bgmRef.current) return;
        
        currentPartRef.current = (currentPartRef.current + 1) % LOFI_PARTS.length;
        const nextPart = LOFI_PARTS[currentPartRef.current];
        
        bgmRef.current.src = nextPart;
        bgmRef.current.load();
        
        if (hasInteractedRef.current && !isPaused) {
            bgmRef.current.play().catch(() => {});
        }
        
        console.log(`🎵 Playing lofi part ${currentPartRef.current + 1}/${LOFI_PARTS.length}`);
    }, [isPaused]);

    useImperativeHandle(ref, () => ({
        playFlap: () => {
            // Flap SFX removed as per request
        },
        playRingCollect: () => {
            if (ringCollectRef.current && !settings.sfxMuted) {
                ringCollectRef.current.currentTime = 0;
                ringCollectRef.current.play().catch(() => { });
            }
        },
        playRingMiss: () => {
            // Removed
        },
        playGameStart: () => {
            if (gameStartRef.current && !settings.sfxMuted) {
                gameStartRef.current.currentTime = 0;
                gameStartRef.current.play().catch(() => { });
            }
        },
        playGameOver: () => {
            // Removed
        }
    }));

    useEffect(() => {
        // Create audio element for streaming lofi parts
        const audio = new Audio();
        
        // Enable streaming - don't wait for full file to load
        audio.preload = 'none';
        // Start at random part for variety each session
        audio.src = LOFI_PARTS[INITIAL_PART];
        audio.volume = settings.musicMuted ? 0 : settings.musicVolume;
        
        // When current part ends, play the next one
        const handleEnded = () => {
            playNextPart();
        };
        audio.addEventListener('ended', handleEnded);
        
        bgmRef.current = audio;

        // Multiple bird chirp SFX for variety and ambience
        const chirpUrls = [
            'https://assets.mixkit.co/active_storage/sfx/2434/2434-preview.mp3', // Bird chirp
            'https://assets.mixkit.co/active_storage/sfx/2473/2473-preview.mp3', // Forest birds
            'https://assets.mixkit.co/active_storage/sfx/2472/2472-preview.mp3', // Morning birds
        ];
        
        chirpRefs.current = chirpUrls.map(url => {
            const audio = new Audio(url);
            audio.volume = settings.sfxMuted ? 0 : settings.sfxVolume * 0.8; // Prominent volume
            return audio;
        });

        // Ring SFX
        ringCollectRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
        ringCollectRef.current.volume = settings.sfxMuted ? 0 : settings.sfxVolume;

        gameStartRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
        gameStartRef.current.volume = settings.sfxMuted ? 0 : settings.sfxVolume * 0.625;

        // Attempt auto-play, or wait for interaction
        const tryPlay = () => {
            if (bgmRef.current && !isPaused) {
                bgmRef.current.play().then(() => {
                    hasInteractedRef.current = true;
                    console.log(`🎵 Lofi stream started (part ${INITIAL_PART + 1}/${LOFI_PARTS.length})`);
                }).catch(() => {
                    console.log('🎵 Audio autoplay prevented, waiting for interaction.');
                });
            }
        };

        tryPlay();

        const unlockAudio = () => {
            hasInteractedRef.current = true;
            if (bgmRef.current && bgmRef.current.paused && !isPaused) {
                bgmRef.current.play().then(() => {
                    console.log(`🎵 Lofi stream started (part ${INITIAL_PART + 1}/${LOFI_PARTS.length})`);
                }).catch(() => { });
            }
            // Also prime SFX
            chirpRefs.current.forEach(chirp => chirp.load());
            if (ringCollectRef.current) ringCollectRef.current.load();

            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };

        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);

        return () => {
            if (bgmRef.current) {
                bgmRef.current.removeEventListener('ended', handleEnded);
                bgmRef.current.pause();
                bgmRef.current.src = '';
            }
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    }, []);

    // Handle Pause State
    useEffect(() => {
        if (!bgmRef.current) return;
        if (isPaused) {
            bgmRef.current.pause();
        } else if (hasInteractedRef.current) {
            bgmRef.current.play().catch(() => { });
        }
    }, [isPaused]);
    
    // Handle Settings Changes
    useEffect(() => {
        if (bgmRef.current) {
            bgmRef.current.volume = settings.musicMuted ? 0 : settings.musicVolume;
        }
        chirpRefs.current.forEach(chirp => {
            chirp.volume = settings.sfxMuted ? 0 : settings.sfxVolume * 0.8;
        });
        if (ringCollectRef.current) {
            ringCollectRef.current.volume = settings.sfxMuted ? 0 : settings.sfxVolume;
        }
        if (gameStartRef.current) {
            gameStartRef.current.volume = settings.sfxMuted ? 0 : settings.sfxVolume * 0.625;
        }
    }, [settings]);

    // Ambient Chirps Loop - More frequent and varied
    useEffect(() => {
        // Primary chirp interval - every 4-8 seconds
        const primaryInterval = setInterval(() => {
            if (!isPaused && !settings.sfxMuted && chirpRefs.current.length > 0) {
                // 70% chance to chirp
                if (Math.random() < 0.7) {
                    const randomChirp = chirpRefs.current[Math.floor(Math.random() * chirpRefs.current.length)];
                    randomChirp.currentTime = 0;
                    randomChirp.play().catch(() => { });
                }
            }
        }, 4000 + Math.random() * 4000);
        
        // Secondary chirp interval - occasional overlapping chirps for richness
        const secondaryInterval = setInterval(() => {
            if (!isPaused && !settings.sfxMuted && chirpRefs.current.length > 0) {
                // 40% chance for secondary chirp
                if (Math.random() < 0.4) {
                    const randomChirp = chirpRefs.current[Math.floor(Math.random() * chirpRefs.current.length)];
                    randomChirp.currentTime = 0;
                    randomChirp.play().catch(() => { });
                }
            }
        }, 7000 + Math.random() * 5000);
        
        return () => {
            clearInterval(primaryInterval);
            clearInterval(secondaryInterval);
        };
    }, [isPaused, settings.sfxMuted]);

    return null;
});
