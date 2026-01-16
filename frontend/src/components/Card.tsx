import React from "react";

interface CardProps {
    title?: string;
    children: React.ReactNode;
    className?: string;
    headerAction?: React.ReactNode;
}

export function Card({ title, children, className = "", headerAction }: CardProps) {
    return (
        <div className={`bg-slate-900/70 border border-slate-700/40 rounded-2xl p-6 shadow-xl backdrop-blur ${className}`}>
            {title && (
                <header className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                    {headerAction}
                </header>
            )}
            {children}
        </div>
    );
}

interface KPICardProps {
    label: string;
    value: string | number;
    change?: string;
    trend?: "up" | "down" | "neutral";
    icon?: React.ReactNode;
    color?: string;
}

export function KPICard({ label, value, change, trend = "neutral", icon, color = "emerald" }: KPICardProps) {
    const colorClasses: Record<string, string> = {
        emerald: "from-emerald-500/70 to-emerald-400/40 text-emerald-50",
        rose: "from-rose-500/70 to-rose-400/40 text-rose-50",
        sky: "from-sky-500/70 to-sky-400/40 text-sky-50",
        amber: "from-amber-500/70 to-amber-400/40 text-amber-50",
        purple: "from-purple-500/70 to-purple-400/40 text-purple-50",
    };

    const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "";

    return (
        <div className={`bg-gradient-to-br ${colorClasses[color]} rounded-2xl p-6 shadow-lg`}>
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    {icon && <div className="text-2xl">{icon}</div>}
                    <span className="text-sm font-medium opacity-90">{label}</span>
                </div>
            </div>
            <div className="text-3xl font-bold mb-1">{value}</div>
            {change && (
                <div className="text-xs opacity-80 flex items-center gap-1">
                    <span>{trendIcon}</span>
                    <span>{change}</span>
                </div>
            )}
        </div>
    );
}











