'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Plus, CheckCircle2, X } from 'lucide-react';
import { cn } from "@/lib/utils";
import api from '@/lib/api';

interface Property {
    id: string;
    title: string;
}

interface Campaign {
    id: string;
    name: string;
    status: string;
    total_contacts: number;
    sent_count: number;
    properties: string[]; // List of IDs
}

export default function Campaigns() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    interface NewCampaignState {
        name: string;
        propertyId: string;
        target: string;
        target_groups: string[];
        send_to_whatsapp: boolean;
        post_to_facebook: boolean;
        post_to_instagram: boolean;
        [key: string]: any; // fallback
    }

    const [newCampaign, setNewCampaign] = useState<NewCampaignState>({
        name: '',
        propertyId: '',
        target: 'All Contacts',
        target_groups: [],
        send_to_whatsapp: true,
        post_to_facebook: false,
        post_to_instagram: false,
    });

    useEffect(() => {
        fetchCampaigns();
        fetchProperties();
        fetchGroups();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const res = await api.get('/campaigns/');
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setCampaigns(data);
        } catch (e) { console.error(e); }
    };

    const fetchProperties = async () => {
        try {
            const res = await api.get('/properties/');
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setProperties(data);
        } catch (e) { console.error(e); }
    };

    const fetchGroups = async () => {
        try {
            const res = await api.get('/groups/');
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setGroups(data);
        } catch (e) { console.error(e); }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Backend expects:
            // { name, properties: [id], settings: { ...defaults } }
            await api.post('/campaigns/', {
                name: newCampaign.name,
                properties: [newCampaign.propertyId],
                status: 'DRAFT',
                send_to_whatsapp: newCampaign.send_to_whatsapp,
                post_to_facebook: newCampaign.post_to_facebook,
                post_to_instagram: newCampaign.post_to_instagram,

                // Group targeting logic
                send_to_all_groups: newCampaign.target === 'All Groups',
                target_groups: newCampaign.target === 'Specific Groups' ? newCampaign.target_groups : [],

                // Use backend defaults (Normal Mode: 8-12s delay, 30s rest)
                settings: {}
            });

            fetchCampaigns();
            setShowCreate(false);
            setNewCampaign({ name: '', propertyId: '', target: 'All Contacts', target_groups: [], send_to_whatsapp: true, post_to_facebook: false, post_to_instagram: false });
        } catch (error) {
            console.error("Error creating campaign", error);
            alert("Failed to create campaign");
        }
    };

    const [processingId, setProcessingId] = useState<string | null>(null);

    const toggleStatus = async (id: string, currentStatus: string) => {
        if (processingId === id) return; // Prevent double click
        setProcessingId(id);
        try {
            if (currentStatus === 'RUNNING') {
                await api.post(`/campaigns/${id}/pause/`);
            } else {
                await api.post(`/campaigns/${id}/start/`);
            }
            fetchCampaigns();
        } catch (error) {
            console.error("Error toggling status:", error);
            alert("Failed to update status. Check if campaign allows this transition.");
        } finally {
            setProcessingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Campaigns</h1>
                    <p className="text-slate-500">Create and manage your marketing blasts.</p>
                </div>
                {!showCreate && (
                    <Button onClick={() => setShowCreate(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Campaign
                    </Button>
                )}
            </div>

            {showCreate && (
                <Card className="max-w-2xl border-slate-300 shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Create Campaign</CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Campaign Name</label>
                                <Input
                                    required
                                    value={newCampaign.name}
                                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                                    placeholder="e.g. November Blast"
                                />
                            </div>
                            {/* Target Selection */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Select Property</label>
                                    <select
                                        className={cn(
                                            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        )}
                                        value={newCampaign.propertyId}
                                        onChange={(e) => setNewCampaign({ ...newCampaign, propertyId: e.target.value })}
                                        required
                                    >
                                        <option value="" disabled>Select property...</option>
                                        {properties.map(p => (
                                            <option key={p.id} value={p.id}>{p.title}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Target Audience</label>
                                    <select
                                        className={cn(
                                            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        )}
                                        value={newCampaign.target}
                                        onChange={(e) => setNewCampaign({ ...newCampaign, target: e.target.value })}
                                    >
                                        <option value="All Contacts">All Contacts</option>
                                        <option value="All Groups">All Groups (Broadcast)</option>
                                        <option value="Specific Groups">Select Specific Groups</option>
                                    </select>
                                </div>
                            </div>

                            {/* Specific Group Selection */}
                            {newCampaign.target === 'Specific Groups' && (
                                <div className="space-y-2 p-4 bg-slate-50 rounded-md border text-sm">
                                    <label className="font-semibold block mb-2">Select Groups:</label>
                                    {groups.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                                            {groups.map((g: any) => (
                                                <label key={g.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded">
                                                    <input
                                                        type="checkbox"
                                                        checked={newCampaign.target_groups.includes(g.id)}
                                                        onChange={(e) => {
                                                            const current = newCampaign.target_groups;
                                                            if (e.target.checked) {
                                                                setNewCampaign({ ...newCampaign, target_groups: [...current, g.id] });
                                                            } else {
                                                                setNewCampaign({ ...newCampaign, target_groups: current.filter(id => id !== g.id) });
                                                            }
                                                        }}
                                                        className="rounded border-slate-300"
                                                    />
                                                    <span className="truncate" title={g.name}>{g.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-slate-500 italic">No groups found. Please sync groups in Phone Manager first.</p>
                                    )}
                                </div>
                            )}

                            {/* Platform Selection */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Send To:</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newCampaign.send_to_whatsapp}
                                            onChange={(e) => setNewCampaign({ ...newCampaign, send_to_whatsapp: e.target.checked })}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm">WhatsApp</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newCampaign.post_to_facebook}
                                            onChange={(e) => setNewCampaign({ ...newCampaign, post_to_facebook: e.target.checked })}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm">Facebook Page</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newCampaign.post_to_instagram}
                                            onChange={(e) => setNewCampaign({ ...newCampaign, post_to_instagram: e.target.checked })}
                                            className="h-4 w-4"
                                        />
                                        <span className="text-sm">Instagram</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <Button type="submit">Create Draft</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Context</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Total Contacts</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {campaigns.map((campaign) => (
                                <TableRow key={campaign.id}>
                                    <TableCell className="font-medium">{campaign.name}</TableCell>
                                    <TableCell>{campaign.properties.length > 0 ? 'Linked to Property' : 'General'}</TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            campaign.status === 'RUNNING' ? 'success' :
                                                campaign.status === 'COMPLETED' ? 'secondary' :
                                                    campaign.status === 'PAUSED' ? 'warning' : 'outline'
                                        }>
                                            {campaign.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1 w-32">
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>{campaign.sent_count || 0} / {campaign.total_contacts}</span>
                                                <span>{campaign.total_contacts > 0 ? Math.round(((campaign.sent_count || 0) / campaign.total_contacts) * 100) : 0}%</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 transition-all duration-500"
                                                    style={{ width: `${campaign.total_contacts > 0 ? ((campaign.sent_count || 0) / campaign.total_contacts) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => toggleStatus(campaign.id, campaign.status)}
                                            disabled={processingId === campaign.id}
                                            className="h-8 w-8"
                                        >
                                            {processingId === campaign.id ? (
                                                <span className="animate-spin text-xl">⟳</span>
                                            ) : campaign.status === 'RUNNING' ? (
                                                <Pause className="h-4 w-4" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {campaigns.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No campaigns created yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
