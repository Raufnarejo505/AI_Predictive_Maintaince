import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface NavItem {
    path: string;
    label: string;
    icon: string;
    requireRole?: string[];
}

const navItems: NavItem[] = [
    { path: "/", label: "Dashboard", icon: "📊" },
    { path: "/machines", label: "Machines", icon: "⚙️" },
    { path: "/sensors", label: "Sensors", icon: "📡" },
    { path: "/predictions", label: "Predictions", icon: "🤖" },
    { path: "/alarms", label: "Alarms", icon: "🚨" },
    { path: "/tickets", label: "Tickets", icon: "🎫" },
    { path: "/reports", label: "Reports", icon: "📄" },
    { path: "/ai", label: "AI Service", icon: "🧠", requireRole: ["engineer", "admin"] },
    { path: "/mqtt", label: "MQTT Status", icon: "📶", requireRole: ["engineer", "admin"] },
    { path: "/opcua", label: "OPC UA Wizard", icon: "🧬", requireRole: ["engineer", "admin"] },
    { path: "/settings", label: "Settings", icon: "⚙️", requireRole: ["engineer", "admin"] },
    { path: "/notifications", label: "Notifications", icon: "📧", requireRole: ["engineer", "admin"] },
    { path: "/webhooks", label: "Webhooks", icon: "🔗", requireRole: ["engineer", "admin"] },
    { path: "/roles", label: "Roles", icon: "👥", requireRole: ["admin"] },
];

export default function Sidebar() {
    const location = useLocation();
    const { user } = useAuth();

    const canAccess = (item: NavItem): boolean => {
        if (!item.requireRole) return true;
        if (!user?.role) return false;
        return item.requireRole.includes(user.role.toLowerCase());
    };

    const filteredNavItems = navItems.filter(canAccess);

    return (
        <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900/95 border-r border-slate-700/50 z-40 overflow-y-auto">
            <div className="p-6">
                <h2 className="text-xl font-bold text-emerald-400 mb-6">Predictive Maintenance</h2>
                <nav className="space-y-2">
                    {filteredNavItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                                    isActive
                                        ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                                        : "text-slate-300 hover:bg-slate-800/50 hover:text-slate-100"
                                }`}
                            >
                                <span className="text-xl">{item.icon}</span>
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}

