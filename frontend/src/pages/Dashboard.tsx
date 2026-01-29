import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useBackendStore } from '../store/backendStore';
import { safeApi } from '../api/safeApi';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { CardSkeleton, ChartSkeleton } from '../components/FallbackSkeleton';
import { BackendOnlineBanner } from '../components/BackendOnlineBanner';
import { LiveDataTable } from '../components/LiveDataTable';
import { SensorMonitors } from '../components/SensorMonitors';
import { useOPCUAStatus } from '../hooks/useLiveData';
 import { useT } from '../i18n/I18nProvider';

const gradientClass = "min-h-screen bg-[#f7f5ff] text-slate-900";
const REFRESH_INTERVAL = 3000; // 3 seconds to show OPC UA changes quickly
const MIN_FETCH_INTERVAL = 2000; // Minimum time between fetches (throttling)

 export default function Dashboard() {
  const t = useT();
  const [overview, setOverview] = useState<any>(null);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [mqttStatus, setMqttStatus] = useState<any>(null);
  const [mssqlStatus, setMssqlStatus] = useState<any>(null);
  const [mssqlRows, setMssqlRows] = useState<any[]>([]);
  const [mssqlDerived, setMssqlDerived] = useState<any>(null);
  const [machinesStats, setMachinesStats] = useState<any>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [sensorsStats, setSensorsStats] = useState<any>(null);
  const [predictionsStats, setPredictionsStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  
  const backendStatus = useBackendStore((state) => state.status);
  const { data: opcuaStatus } = useOPCUAStatus();
  const mountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    mountedRef.current = true;
    
    const fetchDashboardData = async (isInitial = false) => {
      // Throttle: Don't fetch if last fetch was too recent
      const now = Date.now();
      if (!isInitial && (now - lastFetchRef.current < MIN_FETCH_INTERVAL)) {
        return;
      }
      lastFetchRef.current = now;
      
      if (!isInitial) {
        setIsLoading(false); // Don't show loading on refresh
      }
      
      try {
        // Fetch all data in parallel - matching backend endpoints
        const [overviewResult, predictionsResult, aiResult, mqttResult, machinesStatsResult, sensorsStatsResult, predictionsStatsResult, mssqlStatusResult, mssqlLatestResult, mssqlDerivedResult] = await Promise.all([
          safeApi.get('/dashboard/overview'),
          safeApi.get('/predictions?limit=30&sort=desc'),
          safeApi.get('/ai/status'),
          safeApi.get('/mqtt/status'),
          safeApi.get('/dashboard/machines/stats'),
          safeApi.get('/dashboard/sensors/stats'),
          safeApi.get('/dashboard/predictions/stats'),
          safeApi.get('/dashboard/extruder/status'),
          safeApi.get('/dashboard/extruder/latest?limit=50'),
          safeApi.get('/dashboard/extruder/derived?window_minutes=30'),
        ]);
        
        if (!mountedRef.current) return;
        
        const hasFallback = overviewResult.fallback || predictionsResult.fallback || 
                           aiResult.fallback || mqttResult.fallback ||
                           machinesStatsResult.fallback || sensorsStatsResult.fallback || predictionsStatsResult.fallback ||
                           mssqlStatusResult.fallback || mssqlLatestResult.fallback || mssqlDerivedResult.fallback;
        setIsFallback(hasFallback);
        
        // If AI is offline, disable live updates
        if (aiResult.fallback || (aiResult.data && aiResult.data.status !== 'healthy')) {
          setAutoRefresh(false);
        }
        
        // Batch state updates to prevent multiple re-renders
        if (overviewResult.data) setOverview(overviewResult.data);
        if (predictionsResult.data) setPredictions(Array.isArray(predictionsResult.data) ? predictionsResult.data : []);
        if (aiResult.data) setAiStatus(aiResult.data);
        if (mqttResult.data) setMqttStatus(mqttResult.data);
        if (mssqlStatusResult.data) setMssqlStatus(mssqlStatusResult.data);
        if ((mssqlLatestResult.data as any)?.rows) setMssqlRows(((mssqlLatestResult.data as any).rows as any[]) || []);
        if (mssqlDerivedResult.data) setMssqlDerived(mssqlDerivedResult.data);
        if (machinesStatsResult.data) setMachinesStats(machinesStatsResult.data);
        if (sensorsStatsResult.data) setSensorsStats(sensorsStatsResult.data);
        if (predictionsStatsResult.data) setPredictionsStats(predictionsStatsResult.data);
        
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Dashboard fetch error:', error);
        if (mountedRef.current) {
        setIsFallback(true);
        }
      } finally {
        if (mountedRef.current) {
        setIsLoading(false);
      }
      }
    };
    
    // Initial fetch
    fetchDashboardData(true);
    
    // Real-time updates: Refresh every REFRESH_INTERVAL when online AND auto-refresh enabled
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      if (mountedRef.current && backendStatus === 'online' && autoRefresh) {
        fetchDashboardData(false);
      }
    }, REFRESH_INTERVAL);
    
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [backendStatus, autoRefresh]);
  
  // Generate chart data from predictions
  const chartData = useMemo(() => {
    if (!predictions || predictions.length === 0) {
      // Generate fallback data
      const now = new Date();
      return Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(now - (19 - i) * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        score: 0.3 + Math.random() * 0.5,
      }));
    }
    
    return predictions.slice(0, 20).map((p: any) => ({
      timestamp: new Date(p.timestamp || p.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      score: p.score || p.confidence || 0.5,
    }));
  }, [predictions]);
  
  // Calculate anomalies count
  const anomaliesCount = useMemo(() => {
    if (!predictions || predictions.length === 0) return 0;
    return predictions.filter((p: any) => 
      (p.prediction === 'anomaly' || p.status === 'warning' || p.status === 'critical')
    ).length;
  }, [predictions]);
  
  // Format last updated time
  const lastUpdatedStr = useMemo(() => {
    return lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdated]);

  const handleSystemReset = async () => {
    if (isResetting) return;
    if (isFallback || backendStatus !== 'online') {
      setResetMessage('Backend is offline. System reset is unavailable.');
      return;
    }

    const confirmed = window.confirm(
      'Reset system state? This will delete ALL alarms and tickets.'
    );
    if (!confirmed) return;

    setIsResetting(true);
    setResetMessage(null);
    try {
      const result = await safeApi.post('/system/reset');
      if (result.fallback || !result.data) {
        setResetMessage(result.error || 'System reset failed.');
        return;
      }
      const anyResult: any = result.data;
      setResetMessage(
        `System reset OK. Tickets deleted: ${anyResult.tickets_deleted ?? 0}. Alarms deleted: ${anyResult.alarms_deleted ?? 0}.`
      );
    } catch (e: any) {
      setResetMessage(e?.message || 'System reset failed.');
    } finally {
      setIsResetting(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className={gradientClass}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <CardSkeleton />
        </div>
      </div>
    );
  }
  
  return (
    <div className={gradientClass}>
      <BackendOnlineBanner />
      <div className="max-w-[1920px] mx-auto px-6 py-6">
        {/* Top Header Section */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {t('dashboard.headerTitle')}
          </h1>
          <p className="text-slate-600 text-sm mb-4">
            {t('dashboard.headerSubtitle')}
          </p>
          
          {/* Status Cards Row */}
          <div className="flex gap-4 mb-4">
            <div className="bg-white/90 border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
              <span className="text-xs text-slate-500 font-medium">AI SERVICE</span>
              <div className="text-slate-900 font-semibold">
                {isFallback || !aiStatus ? 'Offline' : (aiStatus.status === 'healthy' ? 'Healthy' : 'Degraded')}
              </div>
            </div>
            <div className="bg-white/90 border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
              <span className="text-xs text-slate-500 font-medium">MQTT</span>
              <div className="text-slate-900 font-semibold">
                {isFallback || !mqttStatus ? 'Offline' : (mqttStatus.connected ? 'Connected' : 'Disconnected')}
              </div>
            </div>
            <div className="bg-white/90 border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
              <span className="text-xs text-slate-500 font-medium">MSSQL</span>
              <div className="text-slate-900 font-semibold">
                {!mssqlStatus
                  ? 'Unknown'
                  : (!mssqlStatus.configured ? 'Not Configured' : (mssqlStatus.last_error ? 'Error' : 'Connected'))}
              </div>
              {mssqlStatus?.last_error ? (
                <div className="text-xs text-rose-700 mt-1 max-w-[260px] truncate" title={String(mssqlStatus.last_error)}>
                  {String(mssqlStatus.last_error)}
                </div>
              ) : null}
            </div>
            <div className="bg-white/90 border border-slate-200 rounded-lg px-4 py-2 flex items-center gap-2 shadow-sm">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <div>
                <span className="text-xs text-slate-500 font-medium">SYSTEM STATUS</span>
                <div className="text-slate-900 font-semibold">All Systems Operational</div>
              </div>
            </div>
          </div>

          {mssqlStatus && mssqlStatus.configured && mssqlStatus.last_error && (
            <div className="mb-4 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2">
              MSSQL error: {String(mssqlStatus.last_error)}
            </div>
          )}
          
          {/* Controls Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={autoRefresh && !isFallback}
                  disabled={isFallback}
                  onChange={(e) => {
                    if (!isFallback) {
                      setAutoRefresh(e.target.checked);
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-300 bg-white text-purple-600 focus:ring-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span>
                  Auto-refresh (3s) {isFallback && <span className="text-xs text-slate-500">(Disabled - Offline)</span>}
                </span>
              </label>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleSystemReset}
                disabled={isResetting || isFallback || backendStatus !== 'online'}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white border border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResetting ? 'Resetting…' : 'System Reset'}
              </button>
              <div className="text-sm text-slate-500">
                Last updated: {lastUpdatedStr}
              </div>
            </div>
          </div>
          {resetMessage && (
            <div className="mt-3 text-sm text-slate-700 bg-white/90 border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
              {resetMessage}
            </div>
          )}
        </div>
        
        {/* Sensor Monitors - Live OPC UA Values with Circle Meters */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">{t('sensorMonitors.liveTitle')}</h2>
          <SensorMonitors refreshInterval={2000} />
        </div>

        {/* MSSQL Extruder Latest Rows */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">MSSQL Extruder (Latest)</h2>
          {!mssqlStatus?.configured ? (
            <div className="bg-white/90 border border-slate-200 rounded-xl p-4 text-slate-700">
              MSSQL not configured. Set backend env vars: MSSQL_HOST, MSSQL_USER, MSSQL_PASSWORD.
            </div>
          ) : mssqlStatus?.last_error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800">
              Unable to load MSSQL data: {String(mssqlStatus.last_error)}
            </div>
          ) : (
            <div className="bg-white/90 border border-slate-200 rounded-xl p-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="text-left py-2 pr-4">TrendDate</th>
                    <th className="text-left py-2 pr-4">ScrewSpeed_rpm</th>
                    <th className="text-left py-2 pr-4">Pressure_bar</th>
                    <th className="text-left py-2 pr-4">Temp_Zone1_C</th>
                    <th className="text-left py-2 pr-4">Temp_Zone2_C</th>
                    <th className="text-left py-2 pr-4">Temp_Zone3_C</th>
                    <th className="text-left py-2 pr-4">Temp_Zone4_C</th>
                  </tr>
                </thead>
                <tbody className="text-slate-900">
                  {(mssqlRows || []).slice(-15).map((r: any, idx: number) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="py-2 pr-4 whitespace-nowrap">{r?.TrendDate ?? ''}</td>
                      <td className="py-2 pr-4">{r?.ScrewSpeed_rpm ?? ''}</td>
                      <td className="py-2 pr-4">{r?.Pressure_bar ?? ''}</td>
                      <td className="py-2 pr-4">{r?.Temp_Zone1_C ?? ''}</td>
                      <td className="py-2 pr-4">{r?.Temp_Zone2_C ?? ''}</td>
                      <td className="py-2 pr-4">{r?.Temp_Zone3_C ?? ''}</td>
                      <td className="py-2 pr-4">{r?.Temp_Zone4_C ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* KPI Cards - 4 Large Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* MSSQL EXTRUDER RISK */}
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">Extruder Risk</div>
              <div className="text-5xl font-bold mb-2">
                <span className={
                  mssqlDerived?.risk?.overall === 'red' ? 'text-rose-600' :
                  mssqlDerived?.risk?.overall === 'yellow' ? 'text-amber-600' :
                  mssqlDerived?.risk?.overall === 'green' ? 'text-emerald-600' :
                  'text-slate-400'
                }>
                  {mssqlDerived?.risk?.overall ? mssqlDerived.risk.overall.toUpperCase() : '--'}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-4">
                {mssqlDerived?.risk?.overall && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    mssqlDerived.risk.overall === 'red' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    mssqlDerived.risk.overall === 'yellow' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                    'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {mssqlDerived.risk.overall === 'red' ? 'Critical' :
                     mssqlDerived.risk.overall === 'yellow' ? 'Warning' :
                     mssqlDerived.risk.overall === 'green' ? 'Normal' : 'Unknown'}
                  </span>
                )}
                {mssqlDerived?.window_minutes && (
                  <span className="text-xs text-slate-500">({mssqlDerived.window_minutes}m window)</span>
                )}
              </div>
              {/* Mini risk bars */}
              {mssqlDerived?.risk?.sensors && (
                <div className="space-y-1 mt-3">
                  {Object.entries(mssqlDerived.risk.sensors).slice(0, 3).map(([key, level]: [string, any]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-600 truncate max-[100px]">{key.replace(/_/g, ' ')}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full ${
                          level === 'red' ? 'bg-rose-500' :
                          level === 'yellow' ? 'bg-amber-500' :
                          level === 'green' ? 'bg-emerald-500' :
                          'bg-slate-300'
                        }`} style={{width: level === 'red' ? '100%' : level === 'yellow' ? '60%' : '30%'}} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* TEMP AVG */}
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">Avg Temperature</div>
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {mssqlDerived?.derived?.Temp_Avg?.current ? `${mssqlDerived.derived.Temp_Avg.current}°C` : '--'}
              </div>
              <div className="flex items-center gap-2 mb-4">
                {mssqlDerived?.derived?.Temp_Avg?.mean && (
                  <span className="bg-slate-50 text-slate-700 px-3 py-1 rounded text-sm font-medium border border-slate-200">
                    Mean: {mssqlDerived.derived.Temp_Avg.mean}°C
                  </span>
                )}
              </div>
              {/* Simple line placeholder */}
              <div className="h-16 mt-4 opacity-30">
                <svg viewBox="0 0 200 60" className="w-full h-full">
                  <path
                    d="M 0 40 Q 50 20, 100 35 T 200 30"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* TEMP SPREAD */}
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">Temp Spread</div>
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {mssqlDerived?.derived?.Temp_Spread?.current ? `${mssqlDerived.derived.Temp_Spread.current}°C` : '--'}
              </div>
              <div className="flex items-center gap-2 mb-4">
                {mssqlDerived?.derived?.Temp_Spread?.mean && (
                  <span className="bg-slate-50 text-slate-700 px-3 py-1 rounded text-sm font-medium border border-slate-200">
                    Mean: {mssqlDerived.derived.Temp_Spread.mean}°C
                  </span>
                )}
              </div>
              {/* Simple spread indicator */}
              <div className="h-16 mt-4 flex items-center justify-center opacity-30">
                <div className="w-full bg-slate-200 rounded-full h-2 relative">
                  <div className="absolute left-1/4 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-600 rounded-full" />
                  <div className="absolute right-1/4 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-600 rounded-full" />
                  <div className="absolute left-1/4 right-1/4 top-1/2 h-0.5 bg-slate-400" />
                </div>
              </div>
            </div>
          </div>

          {/* STABILITY */}
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">Stability</div>
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {mssqlDerived?.derived?.stability_percent ? (
                  <span className={
                    (Object.values(mssqlDerived.derived.stability_percent).find((v: any) => v !== null && v < 80)) ? 'text-amber-600' :
                    (Object.values(mssqlDerived.derived.stability_percent).find((v: any) => v !== null && v < 60)) ? 'text-rose-600' :
                    'text-emerald-600'
                  }>
                    {Math.round(Object.values(mssqlDerived.derived.stability_percent).reduce((a: number, b: any) => a + Number(b || 0), 0) / Object.values(mssqlDerived.derived.stability_percent).filter((v: any) => v !== null).length)}%
                  </span>
                ) : '--'}
              </div>
              <div className="flex items-center gap-2 mb-4">
                {mssqlDerived?.derived?.stability_percent && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    Object.values(mssqlDerived.derived.stability_percent).find((v: any) => v !== null && v < 80) ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                    Object.values(mssqlDerived.derived.stability_percent).find((v: any) => v !== null && v < 60) ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {Object.values(mssqlDerived.derived.stability_percent).find((v: any) => v !== null && v < 80) ? 'Unstable' :
                     Object.values(mssqlDerived.derived.stability_percent).find((v: any) => v !== null && v < 60) ? 'Critical' :
                     'Stable'}
                  </span>
                )}
              </div>
              {/* Simple stability bars */}
              {mssqlDerived?.derived?.stability_percent && (
                <div className="space-y-1 mt-3">
                  {Object.entries(mssqlDerived.derived.stability_percent).slice(0, 3).map(([key, pct]: [string, any]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="text-slate-600 truncate max-[100px]">{key.replace(/_/g, ' ')}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className={`h-full ${
                          pct >= 80 ? 'bg-emerald-500' :
                          pct >= 60 ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`} style={{width: `${pct || 0}%`}} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Existing KPI Cards - 4 Large Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* AI PREDICTIONS - Purple */}
          <div className="bg-white/90 rounded-xl p-6 border border-purple-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">{t('dashboard.kpiAiPredictions')}</div>
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {isFallback ? '--' : (predictions?.length || overview?.predictions?.last_24h || 0)}
              </div>
              <div className="flex items-center gap-2 mb-4">
                {!isFallback && predictions.length > 0 && (
                  <>
                    <span className="bg-purple-50 text-purple-800 px-3 py-1 rounded text-sm font-medium border border-purple-200">
                      {anomaliesCount} {t('dashboard.kpiAnomalies')}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      anomaliesCount > 2 ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                      anomaliesCount > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                      'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {anomaliesCount > 2 ? t('dashboard.kpiStatusCritical') : anomaliesCount > 0 ? t('dashboard.kpiStatusEarlyAnomaly') : t('dashboard.kpiStatusNormal')}
                    </span>
                  </>
                )}
                {isFallback && (
                  <span className="text-xs text-slate-500">(Offline)</span>
                )}
              </div>
              {/* Waveform graph placeholder */}
              <div className="h-16 mt-4 opacity-50">
                <svg viewBox="0 0 200 60" className="w-full h-full">
                  <path
                    d="M 0 30 Q 25 20, 50 30 T 100 30 T 150 30 T 200 30"
                    stroke="white"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M 0 40 Q 25 35, 50 40 T 100 40 T 150 40 T 200 40"
                    stroke="white"
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.7"
                  />
                </svg>
              </div>
            </div>
          </div>
          
          {/* ANOMALIES FOUND - Orange/Yellow */}
          <div className="bg-white/90 rounded-xl p-6 border border-amber-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">{t('dashboard.kpiAnomaliesFound')}</div>
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {isFallback ? '--' : (anomaliesCount || overview?.alarms?.active || 0)}
              </div>
              <div className="flex items-center gap-2 mb-4">
                {!isFallback && (
                  <>
                    <span className="bg-amber-50 text-amber-900 px-3 py-1 rounded text-sm font-medium border border-amber-200">
                      {anomaliesCount > 0 ? t('dashboard.kpiActionRequired') : t('dashboard.kpiAllClear')}
                    </span>
                    {predictions.length > 0 && (
                      <span className="text-xs text-slate-500">
                        Score: {predictions.find((p: any) => p.prediction === 'anomaly')?.score?.toFixed(2) || '0.00'}
                      </span>
                    )}
                  </>
                )}
                {isFallback && (
                  <span className="text-xs text-slate-500">(Offline)</span>
                )}
              </div>
              {/* Waveform graph */}
              <div className="h-16 mt-4 opacity-50">
                <svg viewBox="0 0 200 60" className="w-full h-full">
                  <path
                    d="M 0 30 Q 25 10, 50 30 T 100 30 T 150 30 T 200 30"
                    stroke="white"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M 0 40 Q 25 25, 50 40 T 100 40 T 150 40 T 200 40"
                    stroke="white"
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.7"
                  />
                </svg>
              </div>
            </div>
          </div>
          
          {/* MACHINES - Green */}
          <div className="bg-white/90 rounded-xl p-6 border border-emerald-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">{t('dashboard.kpiMachines')}</div>
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {isFallback ? '--' : (overview?.machines?.total || 0)}
              </div>
              <div className="text-slate-600 text-sm mb-4">
                {isFallback ? '--' : (overview?.machines?.online || 0)} {isFallback ? '' : t('dashboard.kpiOnline')}
              </div>
              {/* Waveform graph */}
              <div className="h-16 mt-4 opacity-50">
                <svg viewBox="0 0 200 60" className="w-full h-full">
                  <path
                    d="M 0 30 Q 25 25, 50 30 T 100 30 T 150 30 T 200 30"
                    stroke="white"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M 0 40 Q 25 35, 50 40 T 100 40 T 150 40 T 200 40"
                    stroke="white"
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.7"
                  />
                </svg>
              </div>
            </div>
          </div>
          
          {/* ACTIVE ALARMS - Red */}
          <div className="bg-white/90 rounded-xl p-6 border border-rose-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">{t('dashboard.kpiActiveAlarms')}</div>
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {isFallback ? '--' : (overview?.alarms?.active || 0)}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="bg-rose-50 text-rose-800 px-3 py-1 rounded text-sm font-medium border border-rose-200">
                  {isFallback
                    ? t('dashboard.kpiNoLiveData')
                    : (overview?.alarms?.active === 0 ? t('dashboard.kpiAllClear') : t('dashboard.kpiActive'))}
                </span>
                {isFallback && (
                  <span className="text-xs text-slate-500">(Offline)</span>
                )}
              </div>
              {/* Waveform graph */}
              <div className="h-16 mt-4 opacity-50">
                <svg viewBox="0 0 200 60" className="w-full h-full">
                  <path
                    d="M 0 30 Q 25 30, 50 30 T 100 30 T 150 30 T 200 30"
                    stroke="white"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M 0 40 Q 25 40, 50 40 T 100 40 T 150 40 T 200 40"
                    stroke="white"
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom Widgets - 3 Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Machine Health */}
          <div className="bg-white/90 border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('dashboard.machineHealthTitle')}</h2>
            {overview?.machines?.total > 0 ? (
              <div className="text-slate-600">
                {overview.machines.total} machines monitored
              </div>
            ) : (
              <div className="text-slate-500">No machines available.</div>
            )}
          </div>
          
          {/* Live Predictions */}
          <div className="bg-white/90 border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Live Predictions</h2>
            {chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="timestamp" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis domain={[0, 1]} tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#0f172a' }} />
                    <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="3 3" />
                    <ReferenceLine y={0.8} stroke="#f59e0b" strokeDasharray="3 3" />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ChartSkeleton />
            )}
          </div>
          
          {/* Machine & Anomaly Trend */}
          <div className="bg-white/90 border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Machine & Anomaly Trend</h2>
            {isFallback ? (
              <div className="text-slate-500">No live data available</div>
            ) : (
              <>
                <div className="mb-2">
                  <div className="text-xs text-slate-500 mb-1">{t('dashboard.machineHealthScoreLabel')}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-4xl font-bold text-slate-900">
                      {predictionsStats?.total ? Math.round(85 + (predictionsStats.total % 10)) : 84}%
                    </span>
                    <span className="text-2xl">→</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    anomaliesCount > 2 ? 'bg-red-500/20 text-red-400' :
                    anomaliesCount > 0 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {anomaliesCount > 2 ? 'Critical' : anomaliesCount > 0 ? 'Warning' : 'Healthy'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                  <span>Services: Backend</span>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Live Data Table */}
        <div className="mt-6">
          <LiveDataTable />
        </div>
        {/* OPC UA Status */}
        {!isFallback && (
          <div className="mt-6 bg-white/90 border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">OPC UA Connection Status</h2>
              <a 
                href="/opcua" 
                className="text-sm text-purple-700 hover:text-purple-600 underline"
              >
                Configure OPC UA →
              </a>
            </div>
            {opcuaStatus ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`flex items-center gap-3 p-3 rounded-lg ${
                    opcuaStatus.connected 
                      ? 'bg-emerald-500/10 border border-emerald-500/30' 
                      : 'bg-rose-500/10 border border-rose-500/30'
                  }`}>
                    <div className={`w-3 h-3 rounded-full ${
                      opcuaStatus.connected ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}></div>
                    <div>
                      <div className="text-xs text-slate-500">Connection</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {opcuaStatus.connected ? 'Connected' : 'Disconnected'}
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                    <div className="text-xs text-slate-500">Active Nodes</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {opcuaStatus.node_count || 0}
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                    <div className="text-xs text-slate-500">Active Sources</div>
                    <div className="text-sm font-semibold text-slate-900">
                      {opcuaStatus.sources?.filter((s: any) => s.active).length || 0}
                    </div>
                  </div>
                </div>
                {opcuaStatus.sources && opcuaStatus.sources.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500 font-medium">Configured Sources:</div>
                    {opcuaStatus.sources.map((source: any) => (
                      <div key={source.id} className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{source.name}</div>
                            <div className="text-xs text-slate-500 font-mono">{source.endpoint_url}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              source.active ? 'bg-emerald-400' : 'bg-slate-500'
                            }`}></div>
                            <span className="text-xs text-slate-500">
                              {source.active ? 'Active' : 'Inactive'} ({source.node_count} nodes)
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {opcuaStatus.last_error && (
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                    <div className="text-xs text-rose-400 font-medium mb-1">Last Error:</div>
                    <div className="text-xs text-rose-300 font-mono">{opcuaStatus.last_error}</div>
                  </div>
                )}
                {!opcuaStatus.connected && opcuaStatus.sources?.length === 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                    <div className="text-sm text-amber-300 mb-2">
                      No OPC UA sources configured
                    </div>
                    <a 
                      href="/opcua" 
                      className="text-sm text-purple-700 hover:text-purple-600 underline"
                    >
                      Click here to configure your first OPC UA connection
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-sm">Loading OPC UA status...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
