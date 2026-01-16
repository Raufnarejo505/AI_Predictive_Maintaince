import React, { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { MachineCreate, MachineRead } from "../types/api";

interface MachineModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: MachineCreate) => void;
    machine?: MachineRead | null;
    isEditing?: boolean;
    isLoading?: boolean;
}

export function MachineModal({ isOpen, onClose, onSave, machine, isEditing = false, isLoading = false }: MachineModalProps) {
    const [formData, setFormData] = useState<MachineCreate>({
        name: "",
        location: "",
        description: "",
        status: "online",
        criticality: "medium",
        metadata: {},
    });

    useEffect(() => {
        if (machine && isEditing) {
            setFormData({
                name: machine.name || "",
                location: machine.location || "",
                description: machine.description || "",
                status: machine.status || "online",
                criticality: machine.criticality || "medium",
                metadata: machine.metadata || {},
            });
        } else {
            setFormData({
                name: "",
                location: "",
                description: "",
                status: "online",
                criticality: "medium",
                metadata: {},
            });
        }
    }, [machine, isEditing, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            alert("Name is required");
            return;
        }
        onSave(formData);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? "Edit Machine" : "Add Machine"}
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                        Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                        disabled={isLoading}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Location</label>
                    <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="Building A, Floor 2"
                        disabled={isLoading}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        rows={3}
                        disabled={isLoading}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Status</label>
                        <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            disabled={isLoading}
                        >
                            <option value="online">Online</option>
                            <option value="offline">Offline</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="degraded">Degraded</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Criticality</label>
                        <select
                            value={formData.criticality}
                            onChange={(e) => setFormData({ ...formData, criticality: e.target.value })}
                            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            disabled={isLoading}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
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

