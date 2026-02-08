'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Need to ensure this component exists or use native
import { Plus, X, FileText } from 'lucide-react';
import api from '@/lib/api';

interface Property {
    id: string; // UUID
    title: string;
    content: string;
    created_at: string;
}

export default function Properties() {
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
    });
    const [platforms, setPlatforms] = useState({
        whatsapp: true,
        facebook: true,
        instagram: true,
    });
    const [sending, setSending] = useState(false);

    useEffect(() => {
        fetchProperties();
    }, []);

    const fetchProperties = async () => {
        try {
            setLoading(true);
            const res = await api.get('/properties/');
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setProperties(data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching properties:", error);
            setLoading(false);
        }
    };

    const handleAddProperty = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/properties/', {
                title: formData.title,
                content: formData.content,
            });

            // Refresh list
            fetchProperties();
            setFormData({ title: '', content: '' });
            setShowForm(false);
        } catch (error) {
            console.error("Error adding property:", error);
            alert("Failed to add property.");
        }
    };

    const handleSendNow = async (propertyId: string) => {
        if (!confirm("Send this message to ALL contacts now?")) return;

        setSending(true);
        try {
            const res = await api.post(`/properties/${propertyId}/quick_send/`, {
                send_whatsapp: platforms.whatsapp,
                send_facebook: platforms.facebook,
                send_instagram: platforms.instagram,
            });

            alert(`✅ ${res.data.message}\nCampaign: ${res.data.campaign_name}`);
        } catch (error: any) {
            alert(`❌ Failed: ${error.response?.data?.error || 'Unknown error'}`);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Properties</h1>
                    <p className="text-slate-500">Create and broadcast messages instantly.</p>
                </div>
                {!showForm && (
                    <Button onClick={() => setShowForm(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Message Template
                    </Button>
                )}
            </div>

            {showForm && (
                <Card className="border-slate-300 shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Add New Template</CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAddProperty} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Internal Name (Optional)</label>
                                <Input
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="e.g. November Offer (Auto-generated if empty)"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Message Content</label>
                                <textarea
                                    className="flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    required
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                    placeholder="Paste your exact WhatsApp message here..."
                                />
                                <p className="text-xs text-slate-500">
                                    This content will be sent exactly as written. No extra text will be added.
                                </p>
                            </div>
                            <div className="flex justify-end pt-2">
                                <Button type="submit">Save Template</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Platform Selection Card */}
            <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader>
                    <CardTitle className="text-sm">Broadcast Platforms</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={platforms.whatsapp}
                                onChange={(e) => setPlatforms({ ...platforms, whatsapp: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <span className="text-sm font-medium">WhatsApp</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={platforms.facebook}
                                onChange={(e) => setPlatforms({ ...platforms, facebook: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <span className="text-sm font-medium">Facebook</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={platforms.instagram}
                                onChange={(e) => setPlatforms({ ...platforms, instagram: e.target.checked })}
                                className="w-4 h-4"
                            />
                            <span className="text-sm font-medium">Instagram</span>
                        </label>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {properties.map((property) => (
                    <Card key={property.id} className="overflow-hidden group hover:shadow-lg transition-all">
                        <CardHeader className="p-4 pb-2">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                    <FileText className="h-4 w-4" />
                                </div>
                                <h3 className="font-semibold text-lg line-clamp-1">{property.title}</h3>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2 space-y-3">
                            <p className="text-sm text-slate-600 line-clamp-4 whitespace-pre-wrap font-mono bg-slate-50 p-2 rounded border">
                                {property.content || "(No content)"}
                            </p>
                            <p className="text-xs text-slate-400">
                                Created: {new Date(property.created_at).toLocaleDateString()}
                            </p>
                            <Button
                                onClick={() => handleSendNow(property.id)}
                                disabled={sending}
                                className="w-full bg-green-600 hover:bg-green-700"
                                size="sm"
                            >
                                {sending ? "Sending..." : "📢 Send Now"}
                            </Button>
                        </CardContent>
                    </Card>
                ))}
                {properties.length === 0 && !loading && (
                    <p className="text-muted-foreground col-span-full">No properties found.</p>
                )}
            </div>
        </div>
    );
}
