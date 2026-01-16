/**
 * Offline/Service Status Indicator Component
 * Shows service health and offline mode status
 */
import React, { useState, useEffect } from "react";
import { ServiceHealthChecker, ServiceStatus } from "../utils/offlineMode";

export function OfflineIndicator() {
    const [status, setStatus] = useState<ServiceStatus>({
        backend: true,
        ai: true,
        mqtt: true,
        lastCheck: 0,
    });
    const [isChecking, setIsChecking] = useState(false);

    useEffect(() => {
        const checkServices = async () => {
            setIsChecking(true);
            const health = await ServiceHealthChecker.checkServices();
            setStatus(health);
            setIsChecking(false);
        };

        // Initial check
        checkServices();

        // Periodic checks every 30 seconds
        const interval = setInterval(checkServices, 30000);

        return () => clearInterval(interval);
    }, []);

    const isOffline = !status.backend;
    const allServicesUp = status.backend && status.ai && status.mqtt;

    return (
        <div className="fixed bottom-4 right-4 z-50">
            <div
                className={`px-4 py-2 rounded-lg shadow-lg border ${
                    isOffline
                        ? "bg-amber-900/90 border-amber-600 text-amber-100"
                        : allServicesUp
                        ? "bg-emerald-900/90 border-emerald-600 text-emerald-100"
                        : "bg-yellow-900/90 border-yellow-600 text-yellow-100"
                }`}
            >
                <div className="flex items-center gap-2 text-sm">
                    {isChecking ? (
                        <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                            <span>Checking services...</span>
                        </>
                    ) : isOffline ? (
                        <>
                            <span>⚠️</span>
                            <span>Offline Mode - Using cached/mock data</span>
                        </>
                    ) : (
                        <>
                            <span>✅</span>
                            <span>
                                Services:{" "}
                                {[
                                    status.backend && "Backend",
                                    status.ai && "AI",
                                    status.mqtt && "MQTT",
                                ]
                                    .filter(Boolean)
                                    .join(", ")}
                            </span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

