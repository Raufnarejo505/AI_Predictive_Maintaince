import React from 'react';
import { useBackendStore } from '../store/backendStore';

export const HealthIndicator: React.FC = () => {
  const status = useBackendStore((state) => state.status);
  
  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-emerald-500';
      case 'offline':
        return 'bg-rose-500';
      case 'checking':
        return 'bg-amber-500 animate-pulse';
      default:
        return 'bg-slate-500';
    }
  };
  
  const getStatusText = () => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'checking':
        return 'Checking...';
      default:
        return 'Unknown';
    }
  };
  
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span className="text-xs text-slate-400">{getStatusText()}</span>
    </div>
  );
};

