import React, { useRef } from "react";
import type { SwipeBackProps } from "./SwipeBack";

export function SwipeBack({ enabled, onBack, screenKey, children }: SwipeBackProps) {
  const start = useRef<{ x: number; y: number; screen: string } | null>(null);
  return <div data-testid="swipe-back" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative", touchAction: enabled ? "pan-y pinch-zoom" : "auto" }}
    onTouchStart={event => {
      const touch = event.touches[0];
      const target = event.target as HTMLElement;
      start.current = enabled && event.touches.length === 1 && touch.clientX - event.currentTarget.getBoundingClientRect().left <= 40
        && !target.closest('input, textarea, select, [role="slider"], [contenteditable="true"]')
        ? { x: touch.clientX, y: touch.clientY, screen: screenKey } : null;
    }}
    onTouchMove={event => {
      const initial = start.current;
      if (!initial) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || Math.abs(touch.clientY - initial.y) > 12 && Math.abs(touch.clientY - initial.y) > touch.clientX - initial.x) start.current = null;
    }}
    onTouchCancel={() => { start.current = null; }}
    onTouchEnd={event => {
      const initial = start.current;
      start.current = null;
      if (!initial || !enabled || initial.screen !== screenKey || event.touches.length) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - initial.x;
      if (dx >= 72 && dx > Math.abs(touch.clientY - initial.y) * 2) onBack();
    }}
  >{children}</div>;
}
