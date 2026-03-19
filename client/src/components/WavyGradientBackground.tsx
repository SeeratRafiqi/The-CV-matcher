'use client';

import { motion } from 'framer-motion';

/**
 * Premium wavy gradient background inspired by dark blue/teal 3D-style hero layouts.
 * Renders animated organic shapes for depth; use behind main content.
 */
export function WavyGradientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {/* Base gradient */}
      <div
        className="absolute inset-0 opacity-40 dark:opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 70% 20%, hsl(195 70% 45% / 0.25) 0%, transparent 50%), radial-gradient(ellipse 60% 80% at 20% 80%, hsl(222 50% 35% / 0.2) 0%, transparent 50%), hsl(var(--background))',
        }}
      />
      {/* Animated blob 1 */}
      <motion.div
        className="absolute -right-[20%] -top-[10%] h-[60vmax] w-[60vmax] rounded-full opacity-20 dark:opacity-25"
        style={{
          background: 'radial-gradient(circle, hsl(195 60% 50% / 0.4) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -20, 20, 0],
          scale: [1, 1.05, 1, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
      />
      {/* Animated blob 2 */}
      <motion.div
        className="absolute -bottom-[30%] -left-[10%] h-[50vmax] w-[50vmax] rounded-full opacity-15 dark:opacity-20"
        style={{
          background: 'radial-gradient(circle, hsl(222 45% 40% / 0.35) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
        animate={{
          x: [0, -25, 15, 0],
          y: [0, 15, -25, 0],
          scale: [1, 1.1, 1, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
      />
      {/* Subtle wave strip */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-[40vh] opacity-10 dark:opacity-15"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, hsl(195 55% 45% / 0.3) 100%)',
          clipPath: 'ellipse(120% 100% at 50% 100%)',
        }}
        animate={{ opacity: [0.1, 0.15, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, repeatType: 'reverse' }}
      />
    </div>
  );
}
