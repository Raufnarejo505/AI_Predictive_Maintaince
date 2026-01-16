import React, { useState, useEffect } from 'react';
import api from '../api';
import { CircleMeter } from './CircleMeter';

interface SensorMonitor {
  name: string;
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  timestamp: string;
  sensorId?: string;
}

interface SensorMonitorsProps {
  refreshInterval?: number;
}

export const SensorMonitors: React.FC<SensorMonitorsProps> = ({ refreshInterval = 2000 }) => {
  const [monitors, setMonitors] = useState<Record<string, SensorMonitor>>({
    temperature: { name: 'Temperature', value: 0, unit: '°C', status: 'normal', timestamp: '' },
    vibration: { name: 'Vibration', value: 0, unit: 'mm/s RMS', status: 'normal', timestamp: '' },
    pressure: { name: 'Pressure', value: 0, unit: 'bar', status: 'normal', timestamp: '' },
    motor_current: { name: 'Motor Current', value: 0, unit: 'A', status: 'normal', timestamp: '' },
    wear_index: { name: 'Wear Index', value: 0, unit: '', status: 'normal', timestamp: '' },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSensorData = async () => {
    try {
      // Fetch latest sensor data for all sensors
      const response = await api.get('/sensor-data/logs?limit=50');
      const sensorData = response.data || [];
      
      if (!Array.isArray(sensorData)) {
        console.warn('Sensor data is not an array:', sensorData);
        setIsFallback(false);
        return;
      }

      if (sensorData.length === 0) {
        setIsFallback(false); // Not fallback, just no data yet
        return;
      }

      setIsFallback(false);

      // Map sensor types/categories/aliases to our monitor keys
      const typeMapping: Record<string, string> = {
        // Temperature mappings
        'temperature': 'temperature',
        'opcua_temperature': 'temperature',
        'temp': 'temperature',
        // Vibration mappings
        'vibration': 'vibration',
        'opcua_vibration': 'vibration',
        'vib': 'vibration',
        // Pressure mappings
        'pressure': 'pressure',
        'opcua_pressure': 'pressure',
        'press': 'pressure',
        // Motor Current mappings
        'motor_current': 'motor_current',
        'opcua_motor_current': 'motor_current',
        'motorcurrent': 'motor_current',
        'current': 'motor_current',
        // Wear Index mappings
        'wear_index': 'wear_index',
        'opcua_wear_index': 'wear_index',
        'wear': 'wear_index',
        'wearindex': 'wear_index',
      };

      // Find latest value for each sensor type
      const latestValues: Record<string, SensorMonitor> = { ...monitors };

      sensorData.forEach((sensor: any) => {
        // Get sensor type from multiple possible sources (prioritize metadata for OPC UA)
        const sensorType = (sensor.metadata?.alias?.toLowerCase() || 
                           sensor.metadata?.category?.toLowerCase() ||
                           sensor.metadata?.sensor_type?.toLowerCase() ||
                           sensor.metadata?.sensor_name?.toLowerCase()?.replace(/\s+/g, '_') ||
                           sensor.sensor?.sensor_type?.toLowerCase() ||
                           sensor.sensor?.name?.toLowerCase()?.replace(/\s+/g, '_') ||
                           '').trim();

        // Find matching monitor key - check exact match first, then partial
        let monitorKey: string | undefined = typeMapping[sensorType];
        
        if (!monitorKey) {
          // Try partial matching
          for (const [key, value] of Object.entries(typeMapping)) {
            if (sensorType.includes(key) || key.includes(sensorType)) {
              monitorKey = value;
              break;
            }
          }
        }

        if (monitorKey && latestValues[monitorKey]) {
          const value = parseFloat(sensor.value) || 0;
          const timestamp = sensor.timestamp || sensor.created_at;
          
          // Only update if this is newer data or we don't have data yet
          if (!latestValues[monitorKey].timestamp || 
              new Date(timestamp) > new Date(latestValues[monitorKey].timestamp)) {
            
            // Determine status based on value thresholds (adjustable per sensor type)
            let status: 'normal' | 'warning' | 'critical' = 'normal';
            if (monitorKey === 'temperature') {
              // Temperature thresholds: >80°C critical, >70°C warning
              status = value > 80 ? 'critical' : value > 70 ? 'warning' : 'normal';
            } else if (monitorKey === 'vibration') {
              // Vibration thresholds: >6 mm/s critical, >4 mm/s warning
              status = value > 6 ? 'critical' : value > 4 ? 'warning' : 'normal';
            } else if (monitorKey === 'pressure') {
              // Pressure thresholds: >180 bar critical, >150 bar warning
              status = value > 180 ? 'critical' : value > 150 ? 'warning' : 'normal';
            } else if (monitorKey === 'motor_current') {
              // Motor current thresholds: >22A critical, >18A warning
              status = value > 22 ? 'critical' : value > 18 ? 'warning' : 'normal';
            } else if (monitorKey === 'wear_index') {
              // Wear index thresholds: >80% critical, >60% warning
              status = value > 80 ? 'critical' : value > 60 ? 'warning' : 'normal';
            }

            // Get unit from sensor or metadata, but use default if not available
            let unit = sensor.metadata?.sensor_unit || 
                       sensor.metadata?.unit || 
                       sensor.sensor?.unit || '';
            
            // Override with correct units based on monitor type
            if (monitorKey === 'vibration' && !unit.includes('mm/s')) {
              unit = 'mm/s RMS';
            } else if (monitorKey === 'wear_index') {
              unit = ''; // Unitless as per requirement
            } else if (!unit) {
              unit = monitors[monitorKey].unit; // Use default unit
            }
            
            latestValues[monitorKey] = {
              name: monitors[monitorKey].name,
              value: value,
              unit: unit,
              status: status,
              timestamp: timestamp,
              sensorId: sensor.sensor_id,
            };
          }
        }
      });

      setMonitors(latestValues);
    } catch (error: any) {
      // Silently handle errors - don't show error messages to user
      // Just log for debugging
      if (error?.response?.status === 401) {
        console.warn('Authentication required for sensor data');
      } else if (error?.response?.status === 403) {
        console.warn('Access denied for sensor data');
      } else {
        console.warn('Error fetching sensor monitors:', error?.response?.status || error?.message);
      }
      // Don't set error message or fallback - just keep existing state
      setErrorMessage(null);
      setIsFallback(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSensorData();
    const interval = setInterval(fetchSensorData, refreshInterval);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'border-red-500 bg-red-500/10';
      case 'warning':
        return 'border-yellow-500 bg-yellow-500/10';
      default:
        return 'border-green-500 bg-green-500/10';
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      default:
        return 'text-green-400';
    }
  };

  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '🟡';
      default:
        return '🟢';
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-slate-700 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  // If no data, show empty state without error messages
  if (!isLoading && Object.values(monitors).every(m => m.value === 0 && !m.timestamp)) {
    return (
      <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Sensor Monitors</h2>
        <div className="text-slate-400 text-sm">Waiting for OPC UA data...</div>
        <div className="text-slate-500 text-xs mt-2">
          Make sure OPC UA source is activated and simulator is running.
        </div>
      </div>
    );
  }

  // Determine min/max for each monitor type
  const getMinMax = (monitorName: string): { min: number; max: number } => {
    switch (monitorName.toLowerCase()) {
      case 'temperature':
        return { min: 0, max: 100 };
      case 'vibration':
        return { min: 0, max: 10 };
      case 'pressure':
        return { min: 0, max: 200 };
      case 'motor current':
        return { min: 0, max: 30 };
      case 'wear index':
        return { min: 0, max: 100 };
      default:
        return { min: 0, max: 100 };
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(monitors).map(([key, monitor]) => {
          const { min, max } = getMinMax(monitor.name);
          return (
            <CircleMeter
              key={key}
              label={monitor.name}
              value={monitor.value > 0 ? monitor.value : 0}
              unit={monitor.unit}
              min={min}
              max={max}
              status={monitor.status}
              size={180}
            />
          );
        })}
      </div>
      <div className="mt-4 text-xs text-slate-500 text-center">
        Updating every {refreshInterval / 1000}s from OPC UA sources
        {Object.values(monitors).some(m => m.timestamp) && (
          <span className="ml-2">
            • Last update: {new Date(Math.max(...Object.values(monitors).filter(m => m.timestamp).map(m => new Date(m.timestamp).getTime()))).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
};
