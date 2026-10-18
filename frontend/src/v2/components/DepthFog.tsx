import { V2_CONFIG } from '../config';

interface DepthFogProps {
  enabled: boolean;
}

export function DepthFog({ enabled }: DepthFogProps) {
  if (!enabled) return null;

  const { fog } = V2_CONFIG.depth;
  return <fog attach="fog" args={[fog.color, fog.near, fog.far]} />;
}
