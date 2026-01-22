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
                    ? "bg-emerald-50 border-emerald-200 text-[#1F2937]"
                    : "bg-rose-50 border-rose-200 text-[#1F2937]",
            };
        } else if (label === "MQTT") {
            const connected = mqttStatus?.connected || false;
            return {
                status: connected ? "Connected" : "Disconnected",
                color: connected
                    ? "bg-purple-50 border-purple-200 text-[#1F2937]"
                    : "bg-rose-50 border-rose-200 text-[#1F2937]",
            };
        }
        return { status: "Unknown", color: "bg-purple-50 border-purple-200 text-[#1F2937]" };
    };

    const { status, color } = getStatus();

    return (
        <div className={`px-5 py-3 rounded-2xl border ${color} text-sm font-medium shadow-sm`}>
            <p className="text-xs uppercase tracking-[0.3em] text-[#9CA3AF] mb-1">{label}</p>
            <p className="text-lg font-semibold text-[#1F2937]">{status}</p>
        </div>
    );
}











