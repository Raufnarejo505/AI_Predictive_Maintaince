import React, { useState, useEffect, useRef } from 'react';
import { useBackendStore } from '../store/backendStore';
import { safeApi } from '../api/safeApi';
import { BackendOnlineBanner } from '../components/BackendOnlineBanner';
import { DashboardSkeleton } from '../components/LoadingSkeleton';
import { useT } from '../i18n/I18nProvider';

const gradientClass = "min-h-screen bg-[#f7f5ff] text-slate-900";
const REFRESH_INTERVAL = 3000; // 3 seconds refresh interval
const MIN_FETCH_INTERVAL = 2000; // Minimum time between fetches (throttling)

export default function Dashboard() {
  const t = useT();
  const [overview, setOverview] = useState<any>(null);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [mssqlStatus, setMssqlStatus] = useState<any>(null);
  const [mssqlRows, setMssqlRows] = useState<any[]>([]);
  const [mssqlDerived, setMssqlDerived] = useState<any>(null);
  const [machinesStats, setMachinesStats] = useState<any>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [sensorsStats, setSensorsStats] = useState<any>(null);
  const [predictionsStats, setPredictionsStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [selectedMachine] = useState<string>('Machine 1');
  const [selectedMaterial] = useState<string>('Material 1');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  
  const backendStatus = useBackendStore((state) => state.status);
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
        const [overviewResult, predictionsResult, aiResult, machinesStatsResult, sensorsStatsResult, predictionsStatsResult, mssqlStatusResult, mssqlLatestResult, mssqlDerivedResult] = await Promise.all([
          safeApi.get('/dashboard/overview'),
          safeApi.get('/predictions?limit=30&sort=desc'),
          safeApi.get('/ai/status'),
          safeApi.get('/dashboard/machines/stats'),
          safeApi.get('/dashboard/sensors/stats'),
          safeApi.get('/dashboard/predictions/stats'),
          safeApi.get('/dashboard/extruder/status'),
          safeApi.get('/dashboard/extruder/latest?limit=50'),
          safeApi.get('/dashboard/extruder/derived?window_minutes=30'),
        ]);
        
        if (!mountedRef.current) return;
        
        const hasFallback = overviewResult.fallback || predictionsResult.fallback || 
                           aiResult.fallback ||
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
        if (mssqlStatusResult.data) setMssqlStatus(mssqlStatusResult.data);
        if ((mssqlLatestResult.data as any)?.rows) setMssqlRows(((mssqlLatestResult.data as any).rows as any[]) || []);
        if (mssqlDerivedResult.data) setMssqlDerived(mssqlDerivedResult.data);
        if (machinesStatsResult.data) setMachinesStats(machinesStatsResult.data);
        if (sensorsStatsResult.data) setSensorsStats(sensorsStatsResult.data);
        if (predictionsStatsResult.data) setPredictionsStats(predictionsStatsResult.data);
        
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
    
    // Real-time updates: Refresh every REFRESH_INTERVAL when online
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      if (mountedRef.current && backendStatus === 'online') {
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
  }, [backendStatus]);

  // Calculate anomalies count
  const anomaliesCount = predictions?.filter((p: any) => p.prediction === 'anomaly').length || 0;
  
  if (isLoading) {
    return (
      <div className={gradientClass}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DashboardSkeleton />
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
          {/* Machine and Material Selection - Static Display */}
          <div className="bg-white/90 rounded-xl p-4 border border-slate-200 shadow-sm mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Produktionskonfiguration</h2>
                <p className="text-sm text-slate-600">Maschine und Material für die Überwachung</p>
              </div>
              <div className="flex gap-8">
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Maschine</label>
                  <div className="bg-white border border-slate-300 rounded-md px-4 py-2.5 text-sm font-medium text-slate-900 whitespace-nowrap text-center">
                    {selectedMachine}
                  </div>
                </div>
                <div className="min-w-[140px]">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Material</label>
                  <div className="bg-white border border-slate-300 rounded-md px-4 py-2.5 text-sm font-medium text-slate-900 whitespace-nowrap text-center">
                    {selectedMaterial}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                Extruder Überwachungsdashboard
              </h1>
              <p className="text-slate-600 text-sm">
                Predictive Maintenance für Kunststoffextrusion
              </p>
            </div>
          </div>
          
          {/* Status Cards Row */}
          <div className="flex gap-4 mb-4">
            <div className="bg-white/90 border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
              <span className="text-xs text-slate-500 font-medium">AI SERVICE</span>
              <div className="text-slate-900 font-semibold">
                {isFallback || !aiStatus ? 'Offline' : (aiStatus.status === 'healthy' ? 'Healthy' : 'Degraded')}
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
        </div>

        {/* KPI Cards Section */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          {/* Schneckendrehzahl */}
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">Schneckendrehzahl (ScrewSpeed_rpm)</div>
              <div className="text-5xl font-bold mb-2">
                <span className={
                  mssqlDerived?.risk?.sensors?.ScrewSpeed_rpm === 'red' ? 'text-rose-600' :
                  mssqlDerived?.risk?.sensors?.ScrewSpeed_rpm === 'yellow' ? 'text-amber-600' :
                  mssqlDerived?.risk?.sensors?.ScrewSpeed_rpm === 'green' ? 'text-emerald-600' :
                  'text-slate-400'
                }>
                  {mssqlRows?.[0]?.ScrewSpeed_rpm ? parseFloat(mssqlRows[0].ScrewSpeed_rpm).toFixed(1) : '--'}
                </span>
                <span className="text-2xl text-slate-500 ml-2">rpm</span>
              </div>
              <div className="text-xs text-slate-500 mb-1">
                <strong>Berechnung:</strong> Direkte Messung vom Drehzahlsensor
              </div>
              <div className="text-xs text-slate-500 mb-2">
                <strong>Referenz:</strong> Materialabhängiger optimaler Bereich aus Baseline-Daten
              </div>
              <div className="text-xs text-slate-600">
                {mssqlDerived?.risk?.sensors?.ScrewSpeed_rpm === 'green' && 
                  "🟢 Schneckendrehzahl stabil. Ruhiger Materialdurchsatz im optimalen Bereich für dieses Material."}
                {mssqlDerived?.risk?.sensors?.ScrewSpeed_rpm === 'yellow' && 
                  "🟠 Schneckendrehzahl weicht vom Referenzbereich ab. Mögliche Veränderung des Materialdurchsatzes oder beginnende Prozessinstabilität."}
                {mssqlDerived?.risk?.sensors?.ScrewSpeed_rpm === 'red' && 
                  "🔴 Schneckendrehzahl außerhalb des materialabhängigen Betriebsfensters. Risiko für Druckinstabilität, Qualitätsschwankungen oder Werkzeugbelastung."}
              </div>
            </div>
          </div>

          {/* Schmelzedruck */}
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">Schmelzedruck (Pressure_bar)</div>
              <div className="text-5xl font-bold mb-2">
                <span className={
                  mssqlDerived?.risk?.sensors?.Pressure_bar === 'red' ? 'text-rose-600' :
                  mssqlDerived?.risk?.sensors?.Pressure_bar === 'yellow' ? 'text-amber-600' :
                  mssqlDerived?.risk?.sensors?.Pressure_bar === 'green' ? 'text-emerald-600' :
                  'text-slate-400'
                }>
                  {mssqlRows?.[0]?.Pressure_bar ? parseFloat(mssqlRows[0].Pressure_bar).toFixed(1) : '--'}
                </span>
                <span className="text-2xl text-slate-500 ml-2">bar</span>
              </div>
              <div className="text-xs text-slate-500 mb-1">
                <strong>Berechnung:</strong> Direkte Messung vom Drucksensor im Extruder
              </div>
              <div className="text-xs text-slate-500 mb-2">
                <strong>Referenz:</strong> Materialabhängiger optimaler Druckbereich aus historischen Prozessdaten
              </div>
              <div className="text-xs text-slate-600">
                {mssqlDerived?.risk?.sensors?.Pressure_bar === 'green' && 
                  "🟢 Prozessdruck stabil. Gleichmäßiger Materialfluss ohne Anzeichen von Verstopfung oder Überlast."}
                {mssqlDerived?.risk?.sensors?.Pressure_bar === 'yellow' && 
                  "🟠 Abweichender Prozessdruck. Mögliche Änderungen in Materialviskosität, Temperaturverteilung oder beginnende Ablagerungen."}
                {mssqlDerived?.risk?.sensors?.Pressure_bar === 'red' && 
                  "🔴 Kritische Druckabweichung. Erhöhtes Risiko für Werkzeugüberlast, Materialabbau oder Produktionsstopp."}
              </div>
            </div>
          </div>

          {/* Durchschnittstemperatur */}
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">Durchschnittstemperatur (Temp_Avg)</div>
              <div className="text-5xl font-bold mb-2">
                <span className={
                  mssqlDerived?.risk?.overall === 'red' ? 'text-rose-600' :
                  mssqlDerived?.risk?.overall === 'yellow' ? 'text-amber-600' :
                  mssqlDerived?.risk?.overall === 'green' ? 'text-emerald-600' :
                  'text-slate-400'
                }>
                  {mssqlDerived?.derived?.Temp_Avg?.current?.toFixed(1) || '--'}
                </span>
                <span className="text-2xl text-slate-500 ml-2">°C</span>
              </div>
              <div className="text-xs text-slate-500 mb-1">
                <strong>Berechnung:</strong> (Zone1 + Zone2 + Zone3 + Zone4) ÷ 4
              </div>
              <div className="text-xs text-slate-500 mb-2">
                <strong>Referenz:</strong> Materialabhängiger optimaler Temperaturbereich aus Baseline-Daten
              </div>
              <div className="text-xs text-slate-600">
                {mssqlDerived?.derived?.Temp_Avg?.current && 
                  (mssqlDerived?.derived?.Temp_Avg?.current >= 180 && mssqlDerived?.derived?.Temp_Avg?.current <= 220) &&
                  "🟢 Gesamte Temperatur im optimalen Bereich. Gleichmäßige Plastifizierung sichergestellt."}
                {mssqlDerived?.derived?.Temp_Avg?.current && 
                  ((mssqlDerived?.derived?.Temp_Avg?.current < 180) || (mssqlDerived?.derived?.Temp_Avg?.current > 220)) &&
                  "🟠 Temperatur außerhalb des optimalen Bereichs. Anpassung der Heizzone empfohlen."}
                {mssqlDerived?.derived?.Temp_Avg?.current && 
                  ((mssqlDerived?.derived?.Temp_Avg?.current < 160) || (mssqlDerived?.derived?.Temp_Avg?.current > 240)) &&
                  "🔴 Kritische Temperaturabweichung. Risiko für Materialabbau oder unvollständige Plastifizierung."}
              </div>
            </div>
          </div>

          {/* Temperaturspreizung */}
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-sm font-medium text-slate-500 mb-2">Temperaturspreizung (Temp_Spread)</div>
              <div className="text-5xl font-bold mb-2">
                <span className={
                  (mssqlDerived?.derived?.Temp_Spread?.current || 0) > 8 ? 'text-rose-600' :
                  (mssqlDerived?.derived?.Temp_Spread?.current || 0) > 5 ? 'text-amber-600' :
                  'text-emerald-600'
                }>
                  {mssqlDerived?.derived?.Temp_Spread?.current?.toFixed(1) || '--'}
                </span>
                <span className="text-2xl text-slate-500 ml-2">°C</span>
              </div>
              <div className="text-xs text-slate-500 mb-1">
                <strong>Berechnung:</strong> Max(Zone1-4) - Min(Zone1-4)
              </div>
              <div className="text-xs text-slate-500 mb-2">
                <strong>Referenz:</strong> &le;5°C optimal, &le;8°C akzeptabel, &gt;8°C kritisch
              </div>
              <div className="text-xs text-slate-600">
                {(mssqlDerived?.derived?.Temp_Spread?.current || 0) <= 5 && 
                  "🟢 Homogene Temperaturverteilung. Saubere und gleichmäßige Plastifizierung."}
                {(mssqlDerived?.derived?.Temp_Spread?.current || 0) > 5 && (mssqlDerived?.derived?.Temp_Spread?.current || 0) <= 8 && 
                  "🟠 Temperaturzonen beginnen zu divergieren. Mögliche Heiz- oder Regelabweichungen."}
                {(mssqlDerived?.derived?.Temp_Spread?.current || 0) > 8 && 
                  "🔴 Starke Temperaturspreizung. Hohe Wahrscheinlichkeit für Prozessinstabilität, Sensor- oder Heizprobleme."}
              </div>
            </div>
          </div>
        </div>

        {/* Temperaturzonen */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Temperaturzonen (Zone 1–4)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {['Zone1_C', 'Zone2_C', 'Zone3_C', 'Zone4_C'].map((zone, index) => (
              <div key={zone} className="bg-white/90 rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="text-sm font-medium text-slate-500 mb-2">Zone {index + 1}</div>
                <div className="text-3xl font-bold mb-2">
                  <span className={
                    mssqlDerived?.risk?.sensors[`Temp_${zone}`] === 'red' ? 'text-rose-600' :
                    mssqlDerived?.risk?.sensors[`Temp_${zone}`] === 'yellow' ? 'text-amber-600' :
                    mssqlDerived?.risk?.sensors[`Temp_${zone}`] === 'green' ? 'text-emerald-600' :
                    'text-slate-400'
                  }>
                    {mssqlRows?.[0]?.[`Temp_${zone}`] ? parseFloat(mssqlRows[0][`Temp_${zone}`]).toFixed(1) : '--'}
                  </span>
                  <span className="text-lg text-slate-500 ml-1">°C</span>
                </div>
                <div className="text-xs text-slate-500 mb-1">
                  <strong>Berechnung:</strong> Direkte Messung von Temperatursensor Zone {index + 1}
                </div>
                <div className="text-xs text-slate-600">
                  {mssqlDerived?.risk?.sensors[`Temp_${zone}`] === 'green' && 
                    "🟢 Temperaturzone im materialgerechten Bereich. Saubere Erwärmung ohne Auffälligkeiten."}
                  {mssqlDerived?.risk?.sensors[`Temp_${zone}`] === 'yellow' && 
                    "🟠 Temperaturabweichung festgestellt. Mögliche Änderungen im Heizverhalten oder Materialfluss."}
                  {mssqlDerived?.risk?.sensors[`Temp_${zone}`] === 'red' && 
                    "🔴 Kritische Temperaturabweichung. Risiko für unvollständige Plastifizierung, Materialabbau oder Qualitätsprobleme."}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stabilität */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Stabilität (Time Spread / Fluktuation)</h2>
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-500 mb-4">
              <strong>Berechnung:</strong> stability_ratio = window_std / baseline_std
              <br />
              <span className="ml-2">window_std = Standardabweichung über gleitendem Fenster</span>
              <br />
              <span className="ml-2">baseline_std = Gelernte Basis-Standardabweichung</span>
            </div>
            <div className="text-xs text-slate-500 mb-4">
              <strong>Referenz:</strong>
              <br />
              <span className="ml-2">🟢 Optimal: stability_ratio ≤ 1.2</span>
              <br />
              <span className="ml-2">🟠 Akzeptabel: 1.2 &lt; stability_ratio ≤ 2.0</span>
              <br />
              <span className="ml-2">🔴 Kritisch: stability_ratio &gt; 2.0</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="text-sm font-medium text-slate-500 mb-2">Prozessstabilität</div>
                <div className="text-3xl font-bold mb-2">
                  <span className={
                    anomaliesCount > 2 ? 'text-rose-600' :
                    anomaliesCount > 0 ? 'text-amber-600' :
                    'text-emerald-600'
                  }>
                    {anomaliesCount > 2 ? '🔴 Stark schwankend' :
                     anomaliesCount > 0 ? '🟠 Erhöhte Varianz' :
                     '🟢 Geringe Varianz'}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  {anomaliesCount === 0 && 
                    "🟢 Prozess stabil. Keine ungewöhnlichen Schwankungen."}
                  {anomaliesCount > 0 && anomaliesCount <= 2 && 
                    "🟠 Erhöhte Prozessunruhe. Frühindikator für mögliche Abweichungen."}
                  {anomaliesCount > 2 && 
                    "🔴 Instabiler Prozess. Hohe Wahrscheinlichkeit für Qualitätsprobleme oder Störungen."}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-slate-500 mb-2">Anomalien in letzter Zeit</div>
                <div className="text-3xl font-bold mb-2">{anomaliesCount}</div>
                <div className="text-xs text-slate-600">
                  Anzahl der erkannten Abweichungen im Analysefenster
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prozessbewertung */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Prozessbewertung (Gesamttext)</h2>
          <div className="bg-white/90 rounded-xl p-6 border border-slate-200 shadow-sm">
            <div className="text-lg font-medium text-slate-900 mb-3">
              {mssqlDerived?.risk?.overall === 'green' && "🟢 GRÜNER PROZESSZUSTAND"}
              {mssqlDerived?.risk?.overall === 'yellow' && "🟠 ORANGER PROZESSZUSTAND"}
              {mssqlDerived?.risk?.overall === 'red' && "🔴 ROTER PROZESSZUSTAND"}
            </div>
            <div className="text-slate-700">
              {mssqlDerived?.risk?.overall === 'green' && 
                "Der Extrusionsprozess ist stabil. Alle wesentlichen Parameter liegen im materialabhängigen Referenzbereich. Kein Handlungsbedarf."}
              {mssqlDerived?.risk?.overall === 'yellow' && 
                "Der Prozess zeigt Abweichungen vom optimalen Betriebszustand. Empfehlung: Überwachung verstärken und mögliche Ursachen prüfen."}
              {mssqlDerived?.risk?.overall === 'red' && 
                "Kritischer Prozesszustand. Hohes Risiko für Chargenverlust oder Anlagenbelastung. Eingriff empfohlen."}
            </div>
          </div>
        </div>
        
        {/* Bottom Widgets - Removed */}
        
        {/* Live Data Table - Removed */}
        {/* OPC UA Status - Removed */}
      </div>
    </div>
  );
}