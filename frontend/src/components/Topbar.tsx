import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { useAIStatus, useMQTTStatus } from "../hooks/useLiveData";
import { StatusBadge } from "./StatusBadge";
import { useT } from "../i18n/I18nProvider";

export default function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
    const { user, logout } = useAuth();
    const t = useT();
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
        ? t("status.healthy")
        : aiStatus?.status
        ? aiStatus.status
        : t("status.unknown");
    const mqttStatusText = mqttStatus?.connected ? t("status.connected") : t("status.disconnected");

    return (
        <div className="bg-white/90 border-b border-slate-200 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    {/* Left Section */}
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        {onMenuClick ? (
                            <button
                                type="button"
                                aria-label="Menü öffnen"
                                onClick={onMenuClick}
                                className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white hover:bg-purple-50 transition-colors"
                            >
                                <svg className="w-5 h-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 6h16" />
                                    <path d="M4 12h16" />
                                    <path d="M4 18h16" />
                                </svg>
                            </button>
                        ) : null}
                        <div>
                            <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-purple-500">
                                {t("app.name")}
                            </h2>
                            <p className="text-xs text-slate-500">{t("app.tagline")}</p>
                        </div>
                        <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{t("topbar.lastSync")}: {lastSync.toLocaleTimeString()}</span>
                        </div>
                    </div>

                    {/* Right Section */}
                    <div className="flex items-center gap-3 sm:gap-4">
                        {/* Status Indicators */}
                        <div className="hidden sm:flex items-center gap-2">
                            {aiLoading ? (
                                <div className="h-7 w-20 bg-slate-100 rounded-lg animate-pulse" />
                            ) : (
                                <div className="px-3 py-1.5 rounded-lg text-xs border bg-white border-slate-200">
                                    <span className="text-slate-500 mr-1">{t("topbar.statusAi")}:</span>
                                    <StatusBadge status={aiStatusText} size="sm" />
                                </div>
                            )}
                            {mqttLoading ? (
                                <div className="h-7 w-24 bg-slate-100 rounded-lg animate-pulse" />
                            ) : (
                                <div className="px-3 py-1.5 rounded-lg text-xs border bg-white border-slate-200">
                                    <span className="text-slate-500 mr-1">{t("topbar.statusMqtt")}:</span>
                                    <StatusBadge status={mqttStatusText} size="sm" />
                                </div>
                            )}
                        </div>

                        {/* User Info */}
                        <div className="flex items-center gap-3 sm:pl-4 sm:border-l sm:border-slate-200">
                            <div className="text-right">
                                <p className="text-sm font-medium text-slate-900">
                                    {user?.full_name || user?.email || t("topbar.user")}
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
                                {t("topbar.logout")}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

