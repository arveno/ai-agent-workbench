import type { LucideIcon } from 'lucide-react';

interface AppIconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
}

export function AppIcon({ icon: Icon, size = 16, className }: AppIconProps) {
  return <Icon size={size} strokeWidth={1.8} className={className} aria-hidden="true" />;
}
