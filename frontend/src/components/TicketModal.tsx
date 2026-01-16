import React, { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { TicketCreate, TicketRead } from "../types/api";

interface TicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: TicketCreate) => void;
    ticket?: TicketRead | null;
    isEditing?: boolean;
    isLoading?: boolean;
    machines: Array<{ id: string; name: string }>;
    alarms?: Array<{ id: string; message: string }>;
}

export function TicketModal({ 
    isOpen, 
    onClose, 
    onSave, 
    ticket, 
    isEditing = false, 
    isLoading = false,
    machines,
    alarms = []
}: TicketModalProps) {
    const [formData, setFormData] = useState<TicketCreate>({
        machine_id: machines[0]?.id || "",
        alarm_id: "",
        title: "",
        description: "",
        priority: "medium",
        status: "open",
        assigned_to: "",
        due_date: "",
        metadata: {},
    });

    useEffect(() => {
        if (ticket && isEditing) {
            setFormData({
                machine_id: ticket.machine_id || "",
                alarm_id: ticket.alarm_id || "",
                title: ticket.title || "",
                description: ticket.description || "",
                priority: ticket.priority || "medium",
                status: ticket.status || "open",
                assigned_to: ticket.assigned_to || "",
                due_date: ticket.due_date ? ticket.due_date.split('T')[0] : "",
                metadata: ticket.metadata || {},
            });
        } else {
            setFormData({
                machine_id: machines[0]?.id || "",
                alarm_id: "",
                title: "",
                description: "",
                priority: "medium",
                status: "open",
                assigned_to: "",
                due_date: "",
                metadata: {},
            });
        }
    }, [ticket, isEditing, isOpen, machines]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title.trim()) {
            alert("Title is required");
            return;
        }
        if (!formData.machine_id) {
            alert("Machine is required");
            return;
        }
        // Format due_date if provided
        const submitData = {
            ...formData,
            due_date: formData.due_date ? `${formData.due_date}T00:00:00Z` : undefined,
        };
        onSave(submitData);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? "Edit Ticket" : "Create Ticket"}
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Title <span className="text-rose-400">*</span>
                    </label>
                    <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                        disabled={isLoading}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Machine <span className="text-rose-400">*</span>
                    </label>
                    <select
                        value={formData.machine_id}
                        onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                        disabled={isLoading || isEditing}
                    >
                        <option value="">Select a machine</option>
                        {machines.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                </div>

                {alarms.length > 0 && (
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Related Alarm (optional)
                        </label>
                        <select
                            value={formData.alarm_id || ""}
                            onChange={(e) => setFormData({ ...formData, alarm_id: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            disabled={isLoading}
                        >
                            <option value="">None</option>
                            {alarms.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.message}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Description
                    </label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        rows={4}
                        disabled={isLoading}
                        placeholder="Describe the issue..."
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Priority
                        </label>
                        <select
                            value={formData.priority}
                            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            disabled={isLoading}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Status
                        </label>
                        <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            disabled={isLoading}
                        >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="pending">Pending</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Assigned To
                        </label>
                        <input
                            type="text"
                            value={formData.assigned_to || ""}
                            onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="User ID or email"
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Due Date
                        </label>
                        <input
                            type="date"
                            value={formData.due_date}
                            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            disabled={isLoading}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
                        disabled={isLoading}
                    >
                        {isLoading ? "Saving..." : isEditing ? "Update" : "Create"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

