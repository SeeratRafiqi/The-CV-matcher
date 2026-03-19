'use client';

import { useRef, useCallback } from 'react';
import { useMotionValue, useTransform, useSpring, type MotionValue } from 'framer-motion';

type Options = {
  /** Max tilt angle in degrees (default 8) */
  max?: number;
  /** Spring stiffness (default 200) */
  stiffness?: number;
  /** Spring damping (default 20) */
  damping?: number;
};

/**
 * Returns motion values for 3D tilt based on mouse position over the element.
 * Use with motion.div style={{ rotateX, rotateY, transformPerspective }}.
 */
export function useTilt3D(options: Options = {}) {
  const { max = 8, stiffness = 200, damping = 20 } = options;
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness, damping });
  const rotateY = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness, damping });

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      x.set(pointerX / width);
      y.set(pointerY / height);
    },
    [x, y]
  );

  const handleLeave = useCallback(() => {
    x.set(0.5);
    y.set(0.5);
  }, [x, y]);

  return { ref, rotateX, rotateY, handleMove, handleLeave };
}

export type Tilt3DReturn = ReturnType<typeof useTilt3D>;
