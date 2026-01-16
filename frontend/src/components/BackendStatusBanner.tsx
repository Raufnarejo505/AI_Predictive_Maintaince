import React from 'react';
import { useBackendStore } from '../store/backendStore';

export const BackendStatusBanner: React.FC = () => {
  const status = useBackendStore((state) => state.status);
  const lastCheck = useBackendStore((state) => state.lastCheck);
  
  if (status === 'online' || status === 'checking') {
    return null;
  }
  
  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    const secondsAgo = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    const minutesAgo = Math.floor(secondsAgo / 60);
    return `${minutesAgo}m ago`;
  };
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600/90 backdrop-blur-sm border-b border-amber-500/50">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-amber-200 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-amber-50">
              Backend Offline - Showing fallback data
            </span>
            {lastCheck && (
              <span className="text-xs text-amber-200/80">
                (Last check: {formatTime(lastCheck)})
              </span>
            )}
          </div>
          <div className="text-xs text-amber-200/80">
            Auto-recovery enabled
          </div>
        </div>
      </div>
    </div>
  );
};

