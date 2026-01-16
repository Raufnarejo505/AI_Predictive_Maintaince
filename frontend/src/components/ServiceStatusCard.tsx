import React from "react";
import { useAIStatus, useMQTTStatus } from "../hooks/useLiveData";

interface ServiceStatusCardProps {
    label: string;
}

export default function ServiceStatusCard({ label }: ServiceStatusCardProps) {
    const { data: aiStatus } = useAIStatus();
    const { data: mqttStatus } = useMQTTStatus();

    const getStatus = () => {
        if (label === "AI Service") {
            const status = aiStatus?.status || "Unknown";
            const isHealthy = status === "healthy" || status === "operational";
            return {
                status: isHealthy ? "Healthy" : status,
                color: isHealthy
                    ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200"
                    : "bg-rose-500/20 border-rose-400/40 text-rose-200",
            };
        } else if (label === "MQTT") {
            const connected = mqttStatus?.connected || false;
            return {
                status: connected ? "Connected" : "Disconnected",
                color: connected
                    ? "bg-sky-500/20 border-sky-400/40 text-sky-200"
                    : "bg-rose-500/20 border-rose-400/40 text-rose-200",
            };
        }
        return { status: "Unknown", color: "bg-slate-500/20 border-slate-400/40 text-slate-200" };
    };

    const { status, color } = getStatus();

    return (
        <div className={`px-5 py-3 rounded-2xl border ${color} text-sm font-medium backdrop-blur`}>
            <p className="text-xs uppercase tracking-[0.3em] opacity-70 mb-1">{label}</p>
            <p className="text-lg font-semibold">{status}</p>
        </div>
    );
}











