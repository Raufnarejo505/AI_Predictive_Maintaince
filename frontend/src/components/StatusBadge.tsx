import React from "react";

interface StatusBadgeProps {
    status: string;
    variant?: "default" | "outline";
    size?: "sm" | "md" | "lg";
}

export function StatusBadge({ status, variant = "default", size = "md" }: StatusBadgeProps) {
    const statusLower = status?.toLowerCase() || "";

    const getStatusStyles = () => {
        if (statusLower.includes("critical") || statusLower.includes("alarm") || statusLower === "offline") {
            return "bg-rose-500/20 text-rose-200 border-rose-400/40";
        }
        if (statusLower.includes("warning") || statusLower.includes("warn") || statusLower === "degraded") {
            return "bg-amber-500/20 text-amber-200 border-amber-400/40";
        }
        if (statusLower === "online" || statusLower === "healthy" || statusLower === "normal" || statusLower === "active") {
            return "bg-emerald-500/20 text-emerald-200 border-emerald-400/40";
        }
        return "bg-slate-500/20 text-slate-200 border-slate-400/40";
    };

    const sizeClasses = {
        sm: "text-xs px-2 py-0.5",
        md: "text-xs px-2.5 py-1",
        lg: "text-sm px-3 py-1.5",
    };

    return (
        <span
            className={`inline-flex items-center rounded-lg border font-medium ${getStatusStyles()} ${sizeClasses[size]}`}
        >
            {status}
        </span>
    );
}











