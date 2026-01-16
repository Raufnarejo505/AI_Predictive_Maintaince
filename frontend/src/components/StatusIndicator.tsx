import React from "react";

interface StatusIndicatorProps {
    status: "healthy" | "warning" | "critical" | "online" | "offline" | "degraded" | "maintenance";
    size?: "sm" | "md" | "lg";
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, size = "md" }) => {
    const statusMap: Record<string, { emoji: string; color: string }> = {
        healthy: { emoji: "🟢", color: "text-emerald-400" },
        online: { emoji: "🟢", color: "text-emerald-400" },
        warning: { emoji: "🟡", color: "text-amber-400" },
        degraded: { emoji: "🟡", color: "text-amber-400" },
        critical: { emoji: "🔴", color: "text-rose-400" },
        offline: { emoji: "🔴", color: "text-rose-400" },
        maintenance: { emoji: "🔵", color: "text-blue-400" },
    };

    const statusKey = status?.toLowerCase() || "offline";
    const statusInfo = statusMap[statusKey] || { emoji: "⚪", color: "text-slate-400" };

    const sizeClasses = {
        sm: "text-xs",
        md: "text-base",
        lg: "text-lg",
    };

    return (
        <span className={`inline-block ${sizeClasses[size]} ${statusInfo.color}`} role="img" aria-label={status}>
            {statusInfo.emoji}
        </span>
    );
};

