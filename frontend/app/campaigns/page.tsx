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
    properties: string[]; // List of IDs
}

export default function Campaigns() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    const [newCampaign, setNewCampaign] = useState({
        name: '',
        propertyId: '',
        target: 'All Contacts', // Currently ignored by backend simple serializer but good for UI
    });

    useEffect(() => {
        fetchCampaigns();
        fetchProperties();
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

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Backend expects:
            // { name, properties: [id], settings: { ...defaults } }
            await api.post('/campaigns/', {
                name: newCampaign.name,
                properties: [newCampaign.propertyId],
                status: 'DRAFT',
                settings: {
                    delay_between_messages_min: 5,
                    delay_between_messages_max: 10,
                    max_messages_per_hour: 0
                }
            });

            fetchCampaigns();
            setShowCreate(false);
            setNewCampaign({ name: '', propertyId: '', target: 'All Contacts' });
        } catch (error) {
            console.error("Error creating campaign", error);
            alert("Failed to create campaign");
        }
    };

    const toggleStatus = async (id: string, currentStatus: string) => {
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
                                        {/* Future: Support tagging logic */}
                                    </select>
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
                                        {campaign.total_contacts}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {campaign.status !== 'COMPLETED' && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => toggleStatus(campaign.id, campaign.status)}
                                                className="h-8 w-8"
                                            >
                                                {campaign.status === 'RUNNING' ? (
                                                    <Pause className="h-4 w-4" />
                                                ) : (
                                                    <Play className="h-4 w-4" />
                                                )}
                                            </Button>
                                        )}
                                        {campaign.status === 'COMPLETED' && (
                                            <CheckCircle2 className="ml-auto h-4 w-4 text-green-500" />
                                        )}
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
