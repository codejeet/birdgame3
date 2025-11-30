
import { useEffect, useRef } from 'react';
import { ControlsState } from '../types';

export function useControls(sensitivityMultiplier: number = 1.0) {
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
    mouseX: 0,
    mouseY: 0,
    mobileTap: false,
  });

  // Internal state to track virtual joystick position [-1, 1]
  const joystick = useRef({ x: 0, y: 0 });

  // Touch control state
  const touchState = useRef({
    startX: 0,
    startY: 0,
    isDragging: false,
    touchStartTime: 0,
    lastTapTime: 0,
    primaryTouchId: null as number | null,
  });

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
        const sensitivity = 0.002 * sensitivityMultiplier;
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

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;

      // First touch - establish primary touch for joystick
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const now = Date.now();

        touchState.current.primaryTouchId = touch.identifier;
        touchState.current.startX = touch.clientX;
        touchState.current.startY = touch.clientY;
        touchState.current.isDragging = false;
        touchState.current.touchStartTime = now;

        // Check for double tap (within 300ms)
        if (now - touchState.current.lastTapTime < 300) {
          // Double tap detected - trigger dive
          input.current.dive = true;
          touchState.current.lastTapTime = 0; // Reset to prevent triple tap
        } else {
          touchState.current.lastTapTime = now;
        }
      }
      // Second touch (or more) - trigger flap
      else if (e.touches.length >= 2) {
        input.current.flap = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;

      // Find the primary touch (joystick control)
      let primaryTouch = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchState.current.primaryTouchId) {
          primaryTouch = e.touches[i];
          break;
        }
      }

      if (!primaryTouch) return;

      const deltaX = primaryTouch.clientX - touchState.current.startX;
      const deltaY = primaryTouch.clientY - touchState.current.startY;

      // If moved more than 10 pixels, consider it a drag
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        touchState.current.isDragging = true;

        // Virtual joystick: map touch position relative to start
        // Scale based on screen size for sensitivity
        const sensitivity = 0.003 * sensitivityMultiplier;
        joystick.current.x += deltaX * sensitivity;
        joystick.current.y += deltaY * sensitivity;

        // Clamp values to -1 to 1 range
        joystick.current.x = Math.max(-1, Math.min(1, joystick.current.x));
        joystick.current.y = Math.max(-1, Math.min(1, joystick.current.y));

        input.current.mouseX = joystick.current.x;
        input.current.mouseY = joystick.current.y;

        // Update start position for next delta calculation
        touchState.current.startX = primaryTouch.clientX;
        touchState.current.startY = primaryTouch.clientY;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      // If all touches are released
      if (e.touches.length === 0) {
        // Check for TAP (Short duration, no drag)
        const now = Date.now();
        if (!touchState.current.isDragging && (now - touchState.current.touchStartTime < 250)) {
          input.current.mobileTap = true;
          setTimeout(() => { input.current.mobileTap = false; }, 100);
        }

        // Release all controls
        input.current.flap = false;
        input.current.dive = false;
        touchState.current.isDragging = false;
        touchState.current.primaryTouchId = null;
      }
      // If we still have one touch remaining (released the flap finger)
      else if (e.touches.length === 1) {
        input.current.flap = false;
        // Check if the remaining touch is our primary, if not, make it primary
        let foundPrimary = false;
        for (let i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === touchState.current.primaryTouchId) {
            foundPrimary = true;
            break;
          }
        }
        if (!foundPrimary) {
          // The primary touch was released, make the remaining touch the new primary
          const newPrimary = e.touches[0];
          touchState.current.primaryTouchId = newPrimary.identifier;
          touchState.current.startX = newPrimary.clientX;
          touchState.current.startY = newPrimary.clientY;
          touchState.current.isDragging = false;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [sensitivityMultiplier]);

  return input;
}
