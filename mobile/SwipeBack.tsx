import React, { useMemo, useRef } from "react";
import { PanResponder, View } from "react-native";

export type SwipeBackProps = { enabled: boolean; onBack: () => void; screenKey: string; children: React.ReactNode };

// Start at the edge so sliders, text selection and horizontal controls retain their gestures.
export function SwipeBack({ enabled, onBack, screenKey, children }: SwipeBackProps) {
  const current = useRef({ enabled, onBack, screenKey });
  current.current = { enabled, onBack, screenKey };
  const startedOn = useRef("");
  const cancelled = useRef(false);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => {
      startedOn.current = current.current.screenKey;
      cancelled.current = false;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (Math.abs(g.dy) > 12 && Math.abs(g.dy) > g.dx || g.numberActiveTouches > 1) cancelled.current = true;
      return current.current.enabled && !cancelled.current && g.x0 <= 40 && g.dx > 12 && g.dx > Math.abs(g.dy) * 2;
    },
    onPanResponderMove: (_, g) => { if (g.numberActiveTouches > 1) cancelled.current = true; },
    onPanResponderRelease: (_, g) => {
      if (!cancelled.current && current.current.enabled && startedOn.current === current.current.screenKey && g.dx >= 72 && g.dx > Math.abs(g.dy) * 2) current.current.onBack();
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => { cancelled.current = true; },
  }), []);
  return <View style={{ flex: 1 }} {...responder.panHandlers}>{children}</View>;
}
