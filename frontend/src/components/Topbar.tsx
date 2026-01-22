import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { useAIStatus, useMQTTStatus } from "../hooks/useLiveData";
import { StatusBadge } from "./StatusBadge";

export default function Topbar() {
    const { user, logout } = useAuth();
    const { data: aiStatus, isLoading: aiLoading } = useAIStatus();
    const { data: mqttStatus, isLoading: mqttLoading } = useMQTTStatus();
    const [lastSync, setLastSync] = React.useState(new Date());

    React.useEffect(() => {
        const interval = setInterval(() => {
            setLastSync(new Date());
        }, 10000); // Update every 10 seconds
        return () => clearInterval(interval);
    }, []);

    const getRoleBadgeColor = (role: string) => {
        switch (role?.toLowerCase()) {
            case "admin":
                return "bg-purple-50 text-purple-700 border-purple-200";
            case "engineer":
                return "bg-blue-50 text-blue-700 border-blue-200";
            default:
                return "bg-slate-50 text-slate-700 border-slate-200";
        }
    };

    const aiStatusText = aiStatus?.status === "healthy" || aiStatus?.status === "operational" 
        ? "Healthy" 
        : aiStatus?.status || "Unknown";
    const mqttStatusText = mqttStatus?.connected ? "Connected" : "Disconnected";

    return (
        <div className="bg-white/90 border-b border-slate-200 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    {/* Left Section */}
                    <div className="flex items-center gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-purple-500">
                                Predictive Maintenance
                            </h2>
                            <p className="text-xs text-slate-500">Operations Command Center</p>
                        </div>
                        <div className="h-8 w-px bg-slate-200" />
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Last sync: {lastSync.toLocaleTimeString()}</span>
                        </div>
                    </div>

                    {/* Right Section */}
                    <div className="flex items-center gap-4">
                        {/* Status Indicators */}
                        <div className="flex items-center gap-2">
                            {aiLoading ? (
                                <div className="h-7 w-20 bg-slate-100 rounded-lg animate-pulse" />
                            ) : (
                                <div className="px-3 py-1.5 rounded-lg text-xs border bg-white border-slate-200">
                                    <span className="text-slate-500 mr-1">AI:</span>
                                    <StatusBadge status={aiStatusText} size="sm" />
                                </div>
                            )}
                            {mqttLoading ? (
                                <div className="h-7 w-24 bg-slate-100 rounded-lg animate-pulse" />
                            ) : (
                                <div className="px-3 py-1.5 rounded-lg text-xs border bg-white border-slate-200">
                                    <span className="text-slate-500 mr-1">MQTT:</span>
                                    <StatusBadge status={mqttStatusText} size="sm" />
                                </div>
                            )}
                        </div>

                        {/* User Info */}
                        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                            <div className="text-right">
                                <p className="text-sm font-medium text-slate-900">
                                    {user?.full_name || user?.email || "User"}
                                </p>
                                <span
                                    className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${getRoleBadgeColor(
                                        user?.role || ""
                                    )}`}
                                >
                                    {user?.role?.toUpperCase() || "VIEWER"}
                                </span>
                            </div>
                            <button
                                onClick={logout}
                                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-purple-50 hover:border-purple-200 transition-all text-sm font-medium"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

