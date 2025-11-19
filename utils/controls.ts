
import { useEffect, useRef } from 'react';
import { ControlsState } from '../types';

export function useControls() {
  const input = useRef<ControlsState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    rollLeft: false,
    rollRight: false,
    boost: false,
    flap: false,
    dive: false,
    reset: false,
    mouseDown: false,
    mouseX: 0,
    mouseY: 0,
  });

  // Internal state to track virtual joystick position [-1, 1]
  const joystick = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': input.current.forward = true; break;
        case 'KeyS': input.current.backward = true; break;
        case 'KeyA': input.current.left = true; break;
        case 'KeyD': input.current.right = true; break;
        case 'KeyQ': input.current.rollLeft = true; break;
        case 'KeyE': input.current.rollRight = true; break;
        case 'ShiftLeft': 
        case 'ShiftRight': input.current.boost = true; break;
        case 'Space': input.current.flap = true; break;
        case 'KeyR': input.current.reset = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': input.current.forward = false; break;
        case 'KeyS': input.current.backward = false; break;
        case 'KeyA': input.current.left = false; break;
        case 'KeyD': input.current.right = false; break;
        case 'KeyQ': input.current.rollLeft = false; break;
        case 'KeyE': input.current.rollRight = false; break;
        case 'ShiftLeft': 
        case 'ShiftRight': input.current.boost = false; break;
        case 'Space': input.current.flap = false; break;
        case 'KeyR': input.current.reset = false; break;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement) {
        // Pointer Lock Mode: Accumulate delta movement
        const sensitivity = 0.002;
        joystick.current.x += e.movementX * sensitivity;
        joystick.current.y += e.movementY * sensitivity;
      } else {
        // Standard Mode: Absolute position
        joystick.current.x = (e.clientX / window.innerWidth) * 2 - 1;
        joystick.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      }

      // Clamp values to -1 to 1 range
      joystick.current.x = Math.max(-1, Math.min(1, joystick.current.x));
      joystick.current.y = Math.max(-1, Math.min(1, joystick.current.y));

      input.current.mouseX = joystick.current.x;
      input.current.mouseY = joystick.current.y;
    };

    const handleMouseDown = (e: MouseEvent) => {
      // 0: Left, 2: Right
      if (e.button === 0) input.current.flap = true;
      if (e.button === 2) input.current.dive = true;
      input.current.mouseDown = true;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) input.current.flap = false;
      if (e.button === 2) input.current.dive = false;
      input.current.mouseDown = false;
    };

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  return input;
}
