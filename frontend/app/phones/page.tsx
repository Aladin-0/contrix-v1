'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Smartphone, Trash2, X } from 'lucide-react';
import api from '@/lib/api';

interface PhoneSession {
    id: string; // UUID
    name: string;
    session_name: string;
    status: 'CONNECTED' | 'DISCONNECTED' | 'PAUSED';
    load_percentage: number;
}

export default function PhoneManager() {
    const [phones, setPhones] = useState<PhoneSession[]>([]);
    const [newPhoneName, setNewPhoneName] = useState('');
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);

    // QR Modal State
    const [showQr, setShowQr] = useState(false);
    const [currentPhone, setCurrentPhone] = useState<PhoneSession | null>(null);
    const [qrKey, setQrKey] = useState(0); // Force refresh image

    useEffect(() => {
        fetchPhones();
    }, []);

    const fetchPhones = async () => {
        try {
            setLoading(true);
            const res = await api.get('/phones/');
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setPhones(data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching phones:", error);
            setLoading(false);
        }
    };

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPhoneName) return;

        try {
            setCreating(true);
            const sanitizedName = newPhoneName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const uniqueSessionId = `${sanitizedName}_${Date.now()}`;

            const res = await api.post('/phones/', {
                name: newPhoneName,
                session_name: uniqueSessionId,
                status: 'DISCONNECTED'
            });

            const createdPhone = res.data;

            // Wait a moment for WAHA to initialize session
            await new Promise(resolve => setTimeout(resolve, 1000));

            fetchPhones();
            setNewPhoneName('');
            setCreating(false);

            // Open QR Modal
            setCurrentPhone(createdPhone);
            setShowQr(true);
            setQrKey(Date.now());

        } catch (error) {
            console.error("Error creating phone session:", error);
            alert("Failed to create session. Ensure name is unique.");
            setCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to disconnect and delete this session?")) return;
        try {
            await api.delete(`/phones/${id}/`);
            fetchPhones();
        } catch (error) {
            console.error("Error deleting phone:", error);
        }
    }

    const closeQr = () => {
        setShowQr(false);
        setCurrentPhone(null);
        fetchPhones(); // Refresh status
    }

    return (
        <div className="space-y-6 relative">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Phone System</h1>
                <p className="text-slate-500">Manage your connected WhatsApp sessions.</p>
            </div>

            <Card className="max-w-md">
                <CardHeader>
                    <CardTitle className="text-lg">Connect New Phone</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleConnect} className="flex gap-4">
                        <Input
                            placeholder="Enter phone name (e.g. Sales 1)"
                            value={newPhoneName}
                            onChange={(e) => setNewPhoneName(e.target.value)}
                            disabled={creating}
                        />
                        <Button type="submit" disabled={creating || !newPhoneName}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            <span className="ml-2">Connect</span>
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {phones.map((phone) => (
                    <Card key={phone.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="font-medium">{phone.name}</CardTitle>
                            <Smartphone className={`h-5 w-5 ${phone.status === 'CONNECTED' ? 'text-green-500' : 'text-slate-400'}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="mt-4 space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Session ID</span>
                                    <span className="font-mono text-xs">{phone.session_name}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Status</span>
                                    <Badge variant={phone.status === 'CONNECTED' ? 'success' : 'destructive'}>
                                        {phone.status}
                                    </Badge>
                                </div>
                                {phone.status === 'CONNECTED' && (
                                    <div className="space-y-1 pt-2">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span>Load Share</span>
                                            <span>{phone.load_percentage}%</span>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-slate-100">
                                            <div
                                                className="h-1.5 rounded-full bg-blue-500"
                                                style={{ width: `${phone.load_percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end pt-0 gap-2">
                            {phone.status !== 'CONNECTED' && (
                                <Button variant="outline" size="sm" onClick={() => {
                                    setCurrentPhone(phone);
                                    setShowQr(true);
                                    setQrKey(Date.now());
                                }}>
                                    Show QR
                                </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(phone.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                <Trash2 className="mr-2 h-4 w-4" /> Disconnect
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            {/* QR Scanner Modal Overlay */}
            {showQr && currentPhone && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <Card className="w-full max-w-md bg-white shadow-2xl">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Scan QR Code</CardTitle>
                            <Button variant="ghost" size="icon" onClick={closeQr}>
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center p-6 space-y-4">
                            <div className="relative bg-white p-2 rounded-lg border">
                                <img
                                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/phones/${currentPhone.id}/qr/?t=${qrKey}`}
                                    alt="Scan QR"
                                    className="w-64 h-64 object-contain"
                                    onError={(e) => {
                                        console.error("QR Image Load Failed:", e);
                                        // Only show placeholder if we've retried a few times or if it's a hard error
                                        // For now, keep simple placeholder but log the error
                                        (e.target as HTMLImageElement).src = "https://placehold.co/300x300?text=QR+Not+Ready+(Retrying)";
                                    }}
                                />
                            </div>
                            <p className="text-sm text-center text-slate-500">
                                Open WhatsApp on your phone &gt; Linked Devices &gt; Link a Device.
                                <br />
                                <span className="text-xs text-yellow-600">If QR doesn't appear, wait 5s and refresh.</span>
                            </p>
                            <Button onClick={() => setQrKey(Date.now())} variant="outline" size="sm">
                                Refresh QR
                            </Button>
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full" onClick={closeQr}>Done</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
}
