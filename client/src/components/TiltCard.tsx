'use client';

import { motion } from 'framer-motion';
import { useTilt3D } from '@/hooks/useTilt3D';
import { cn } from '@/lib/utils';

type TiltCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Max tilt in degrees (default 6) */
  maxTilt?: number;
  /** Extra shadow when tilted (default true) */
  elevateOnHover?: boolean;
};

/**
 * Wraps content in a 3D tilt effect on hover/move, like a floating panel.
 * Uses perspective and rotateX/rotateY from mouse position.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 6,
  elevateOnHover = true,
}: TiltCardProps) {
  const { ref, rotateX, rotateY, handleMove, handleLeave } = useTilt3D({
    max: maxTilt,
    stiffness: 250,
    damping: 25,
  });

  return (
    <motion.div
      ref={ref}
      className={cn('relative', className)}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{
        perspective: '1000px',
        transformStyle: 'preserve-3d',
      }}
    >
      <motion.div
        className="relative w-full"
        style={{
          rotateX,
          rotateY,
          transform: 'translateZ(0)',
          boxShadow: elevateOnHover
            ? '0 4px 14px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.04)'
            : undefined,
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
