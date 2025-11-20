
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

export interface AudioHandle {
    playFlap: () => void;
    playRingCollect: () => void;
    playRingMiss: () => void;
    playGameStart: () => void;
    playGameOver: () => void;
}

interface AudioControllerProps {
    isPaused: boolean;
}

export const AudioController = forwardRef<AudioHandle, AudioControllerProps>(({ isPaused }, ref) => {
    const bgmRef = useRef<HTMLAudioElement | null>(null);
    const chirpRef = useRef<HTMLAudioElement | null>(null);

    // SFX Refs
    const ringCollectRef = useRef<HTMLAudioElement | null>(null);
    const gameStartRef = useRef<HTMLAudioElement | null>(null);

    useImperativeHandle(ref, () => ({
        playFlap: () => {
            // Flap SFX removed as per request
        },
        playRingCollect: () => {
            if (ringCollectRef.current) {
                ringCollectRef.current.currentTime = 0;
                ringCollectRef.current.play().catch(() => { });
            }
        },
        playRingMiss: () => {
            // Removed
        },
        playGameStart: () => {
            if (gameStartRef.current) {
                gameStartRef.current.currentTime = 0;
                gameStartRef.current.play().catch(() => { });
            }
        },
        playGameOver: () => {
            // Removed
        }
    }));

    useEffect(() => {
        // Chill Lofi Music
        bgmRef.current = new Audio('https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3');
        bgmRef.current.loop = true;
        bgmRef.current.volume = 0.3;

        // Chirp SFX (Ambience)
        chirpRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2434/2434-preview.mp3');
        chirpRef.current.volume = 0.15;

        // Ring SFX
        ringCollectRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); // Arcade bonus
        ringCollectRef.current.volume = 0.4;

        gameStartRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'); // Re-use good sound for start
        gameStartRef.current.volume = 0.25;


        // Attempt auto-play, or wait for interaction
        const tryPlay = () => {
            if (bgmRef.current && !isPaused) {
                bgmRef.current.play().catch((e) => {
                    // Autoplay prevented
                    console.log("Audio autoplay prevented, waiting for interaction.");
                });
            }
        };

        tryPlay();

        const unlockAudio = () => {
            if (bgmRef.current && bgmRef.current.paused && !isPaused) {
                bgmRef.current.play().catch(() => { });
            }
            // Also prime SFX
            if (chirpRef.current) chirpRef.current.load();
            if (ringCollectRef.current) ringCollectRef.current.load();

            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };

        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);

        return () => {
            bgmRef.current?.pause();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
    }, []);

    // Handle Pause State
    useEffect(() => {
        if (!bgmRef.current) return;
        if (isPaused) {
            bgmRef.current.pause();
        } else {
            // Only resume if we have interacted or it was playing before
            bgmRef.current.play().catch(() => { });
        }
    }, [isPaused]);

    // Ambient Chirps Loop
    useEffect(() => {
        const interval = setInterval(() => {
            // 40% chance to chirp every 10 seconds if not paused
            if (!isPaused && chirpRef.current && Math.random() > 0.6) {
                chirpRef.current.currentTime = 0;
                chirpRef.current.play().catch(() => { });
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [isPaused]);

    return null;
});
