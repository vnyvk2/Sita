import { appIcons } from '@assets/app_icons';
import { memo } from 'react';

export interface AppIconProps {
  /** 1-based index (1 to 20) */
  index: number;
  className?: string;
  alt?: string;
}

/**
 * Reusable App Icon component for Nora Allows rendering any of the 20 customizable icons with
 * custom Tailwind classes, sizes, and styles.
 *
 * Example: <AppIcon index={1} className="w-12 h-12 rounded-full hover:scale-105
 * transition-transform" />
 */
const AppIcon = memo(function AppIcon({ index, className = 'w-10 h-10', alt }: AppIconProps) {
  const clampedIndex = Math.max(1, Math.min(20, index)) - 1;
  const src = appIcons[clampedIndex];

  return (
    <img
      src={src}
      alt={alt ?? `App Icon ${index}`}
      className={`object-cover select-none ${className}`.trim()}
      loading="lazy"
    />
  );
});

AppIcon.displayName = 'AppIcon';
export default AppIcon;
