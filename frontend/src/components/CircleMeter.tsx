import React from 'react';

interface CircleMeterProps {
  label: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  status?: 'normal' | 'warning' | 'critical';
  size?: number;
}

export const CircleMeter: React.FC<CircleMeterProps> = ({
  label,
  value,
  unit,
  min = 0,
  max = 100,
  status = 'normal',
  size = 200,
}) => {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  // Reduce radius slightly to ensure circle fits inside box with padding
  const radius = (size - 50) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getStatusColor = () => {
    switch (status) {
      case 'critical':
        return '#ef4444'; // red-500
      case 'warning':
        return '#f59e0b'; // amber-500
      default:
        return '#22d3ee'; // cyan-400
    }
  };

  const getStatusBgColor = () => {
    switch (status) {
      case 'critical':
        return 'bg-red-500/10 border-red-500/30';
      case 'warning':
        return 'bg-yellow-500/10 border-yellow-500/30';
      default:
        return 'bg-cyan-500/10 border-cyan-500/30';
    }
  };

  return (
    <div className={`relative ${getStatusBgColor()} border-2 rounded-2xl p-4 transition-all duration-300 overflow-hidden`}>
      <div className="flex flex-col items-center h-full">
        <h3 className="text-sm font-medium text-slate-300 uppercase tracking-wide mb-3">
          {label}
        </h3>
        
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            className="transform -rotate-90"
            style={{ display: 'block' }}
          >
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(148, 163, 184, 0.2)"
              strokeWidth="12"
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={getStatusColor()}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500 ease-out"
            />
          </svg>
          
          {/* Value display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-4xl font-bold text-white mb-1">
              {value.toFixed(value < 1 ? 2 : value < 10 ? 1 : 0)}
            </div>
            <div className="text-sm text-slate-400">{unit}</div>
            <div className={`text-xs mt-2 px-2 py-1 rounded ${
              status === 'critical' ? 'bg-red-500/20 text-red-300' :
              status === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
              'bg-green-500/20 text-green-300'
            }`}>
              {status.toUpperCase()}
            </div>
          </div>
        </div>
        
        {/* Min/Max labels */}
        <div className="flex justify-between w-full mt-3 text-xs text-slate-500">
          <span>Min: {min}</span>
          <span>Max: {max}</span>
        </div>
      </div>
    </div>
  );
};
