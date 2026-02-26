'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Smartphone, Trash2, X, RefreshCw, CheckCircle2, Plus, Users } from 'lucide-react';
import api from '@/lib/api';

export default function PhoneManager() {

    const [phones, setPhones] = useState<any[]>([]);
    const [newPhoneName, setNewPhoneName] = useState('');
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [currentPhone, setCurrentPhone] = useState<any>(null);
    const [qrKey, setQrKey] = useState(Date.now());
    const [isLinked, setIsLinked] = useState(false);
    const [authMethod, setAuthMethod] = useState<'qr' | 'phone'>('qr');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [pairingCode, setPairingCode] = useState('');
    const [requestingCode, setRequestingCode] = useState(false);
    const [groupList, setGroupList] = useState<any>(null);

    useEffect(() => {
        fetchPhones();
        const interval = setInterval(fetchPhones, 15000);
        return () => clearInterval(interval);
    }, []);

    /**
     * Dedicated Link Monitor:
     * We poll the phone detail endpoint. The backend retrieve() method 
     * automatically checks WAHA and updates the DB to 'CONNECTED'.
     */
    useEffect(() => {
        let poll: any;
        if (showQr && currentPhone && !isLinked) {
            console.log('🔍 Starting poll for phone:', {
                id: currentPhone.id,
                name: currentPhone.name,
                fullPhone: JSON.stringify(currentPhone)
            });

            poll = setInterval(async () => {
                try {
                    console.log('📡 Polling phone ID:', currentPhone.id);
                    const res = await api.get(`/phones/${currentPhone.id}/`);
                    console.log('✅ Poll response:', res.data.status);
                    if (res.data.status === 'CONNECTED') {
                        setIsLinked(true);
                        setTimeout(() => {
                            setShowQr(false);
                            setIsLinked(false);
                            setCurrentPhone(null);
                            fetchPhones();
                        }, 2500);
                    }
                } catch (e: any) {
                    console.error('❌ Poll error:', e.response?.status, e.response?.data);
                }
            }, 4000);
        }
        return () => clearInterval(poll);
    }, [showQr, currentPhone, isLinked]);

    const fetchPhones = async () => {
        try {
            const res = await api.get('/phones/');
            setPhones(Array.isArray(res.data) ? res.data : (res.data.results || []));
        } catch (e) { }
    };

    const [selectedNode, setSelectedNode] = useState('http://waha:3000');

    const handleConnect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPhoneName || creating) return;
        try {
            setCreating(true);
            const res = await api.post('/phones/', {
                name: newPhoneName,
                status: 'DISCONNECTED',
                api_url: selectedNode
            });

            console.log('Phone created:', res.data);

            if (!res.data || !res.data.id) {
                throw new Error('Invalid response from server');
            }

            await fetchPhones();
            setNewPhoneName('');
            setCreating(false);
            setCurrentPhone(res.data);
            setShowQr(true);
            setQrKey(Date.now());
        } catch (error: any) {
            console.error('Phone creation error:', error);
            alert(`Failed to create phone instance: ${error.response?.data?.error || error.message || 'Unknown error'}`);
            setCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure? This will disconnect your WhatsApp link.")) return;
        setLoading(true);
        try {
            await api.delete(`/phones/${id}/`);
            setTimeout(fetchPhones, 3500);
        } finally { setLoading(false); }
    }

    const handleRequestPairingCode = async () => {
        if (!currentPhone || !currentPhone.id) {
            alert('No phone selected. Please try again.');
            return;
        }
        if (!phoneNumber || requestingCode) return;

        setRequestingCode(true);
        try {
            const res = await api.post(`/phones/${currentPhone.id}/request_code/`, { phoneNumber });
            setPairingCode(res.data.code);
        } catch (error: any) {
            console.error('Pairing code error:', error);
            alert(error.response?.data?.error || "Failed to request pairing code");
        } finally {
            setRequestingCode(false);
        }
    };

    const handleSyncGroups = async (id: string) => {
        setLoading(true);
        try {
            const res = await api.post(`/phones/${id}/sync_groups/`);
            alert(`✅ ${res.data.message}`);
        } catch (error: any) {
            console.error('Sync error:', error);
            alert(`❌ Failed to sync: ${error.response?.data?.error || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };




    return (
        <div className="space-y-6 p-6 max-w-5xl mx-auto min-h-screen bg-slate-50/20">
            <h1 className="text-3xl font-bold text-slate-900">WhatsApp Engine Multi-Node</h1>

            <Card className="max-w-2xl border-blue-100 shadow-sm">
                <CardHeader><CardTitle className="text-[10px] font-bold uppercase text-blue-400 tracking-widest">Connect New Account</CardTitle></CardHeader>
                <CardContent>
                    <form onSubmit={handleConnect} className="flex flex-col md:flex-row gap-2 items-stretch md:items-end">
                        <div className="flex-1 space-y-2">
                            <Input placeholder="Account Name (e.g. Marketing 1)" value={newPhoneName} onChange={(e) => setNewPhoneName(e.target.value)} />
                        </div>
                        <div className="w-full md:w-[200px] space-y-2">
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={selectedNode}
                                onChange={(e) => setSelectedNode(e.target.value)}
                            >
                                <option value="http://waha:3000">Node 1 (Primary)</option>
                                <option value="http://waha2:3000">Node 2 (Secondary)</option>
                            </select>
                        </div>
                        <Button type="submit" disabled={creating} className="w-full md:w-auto">
                            {creating ? <Loader2 className="animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Link New</>}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-3">
                {phones.map((phone) => (
                    <Card key={phone.id} className="border-slate-200">
                        <CardHeader className="flex flex-row justify-between pb-2 bg-slate-50/40">
                            <CardTitle className="text-sm font-bold truncate">{phone.name}</CardTitle>
                            <Smartphone className={phone.status === 'CONNECTED' ? 'text-green-500' : 'text-slate-300'} />
                        </CardHeader>
                        <CardContent className="pt-4">
                            <Badge variant={phone.status === 'CONNECTED' ? 'default' : 'destructive'} className="rounded-full px-4">
                                {phone.status}
                            </Badge>
                            {phone.groups_count !== undefined && (
                                <div className="mt-4 flex items-center justify-between bg-slate-100 p-2 rounded-lg">
                                    <div className="flex items-center gap-2 text-slate-600">
                                        <Users className="h-4 w-4" />
                                        <span className="text-xs font-medium">{phone.groups_count} Groups</span>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-6 text-[10px] uppercase font-bold text-blue-500 hover:text-blue-700" onClick={() => setGroupList({ id: phone.id, name: phone.name, count: phone.groups_count, groups: phone.groups })}>
                                        View All
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="justify-end gap-2 border-t pt-4">
                            {phone.status === 'CONNECTED' && (
                                <Button variant="outline" size="sm" onClick={() => handleSyncGroups(phone.id)} disabled={loading}>
                                    <RefreshCw className={`w-3 h-3 mr-2 ${loading ? 'animate-spin' : ''}`} /> Sync Groups
                                </Button>
                            )}
                            {phone.status !== 'CONNECTED' && (
                                <Button variant="outline" size="sm" onClick={() => { setShowQr(true); setCurrentPhone(phone); setQrKey(Date.now()); }}>Show QR</Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(phone.id)} disabled={loading} className="text-red-500">De-link</Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            {showQr && currentPhone && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-sm bg-white shadow-2xl rounded-3xl overflow-hidden border-none">
                        <CardHeader className="flex justify-between items-center border-b p-5">
                            <CardTitle className="text-md font-bold">Authentication</CardTitle>
                            {!isLinked && <Button variant="ghost" size="icon" onClick={() => { setShowQr(false); setPairingCode(''); setPhoneNumber(''); }}><X className="h-4 w-4" /></Button>}
                        </CardHeader>
                        <CardContent className="flex flex-col items-center py-8 space-y-6">
                            {isLinked ? (
                                <div className="flex flex-col items-center space-y-4">
                                    <div className="h-20 w-20 bg-green-50 rounded-full flex items-center justify-center">
                                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                                    </div>
                                    <p className="text-lg font-bold text-slate-800">Connection Verified</p>
                                </div>
                            ) : (
                                <>
                                    {/* Auth Method Tabs */}
                                    <div className="flex gap-2 w-full">
                                        <Button
                                            variant={authMethod === 'qr' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => { setAuthMethod('qr'); setPairingCode(''); }}
                                            className="flex-1"
                                        >
                                            QR Code
                                        </Button>
                                        <Button
                                            variant={authMethod === 'phone' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setAuthMethod('phone')}
                                            className="flex-1"
                                        >
                                            Phone Number
                                        </Button>
                                    </div>

                                    {authMethod === 'qr' ? (
                                        <>
                                            <div className="p-4 border-4 border-slate-50 rounded-[3rem] bg-white shadow-xl">
                                                <img
                                                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/phones/${currentPhone.id}/qr/?t=${qrKey}`}
                                                    alt="QR"
                                                    className="w-56 h-56 object-contain"
                                                    onError={(e: any) => {
                                                        setTimeout(() => setQrKey(Date.now()), 6000);
                                                        e.target.src = "https://placehold.co/300x300/white/666?text=Engine+Starting...+(20s)";
                                                    }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest">Waiting for Scan...</p>
                                            <Button variant="secondary" size="sm" onClick={() => setQrKey(Date.now())} className="rounded-full px-6">
                                                <RefreshCw className="h-3 w-3 mr-2" /> Force Refresh
                                            </Button>
                                        </>
                                    ) : (
                                        <div className="w-full space-y-4">
                                            {!pairingCode ? (
                                                <>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700">Phone Number</label>
                                                        <Input
                                                            placeholder="+1234567890"
                                                            value={phoneNumber}
                                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                                            disabled={requestingCode}
                                                        />
                                                    </div>
                                                    <Button
                                                        onClick={handleRequestPairingCode}
                                                        disabled={!phoneNumber || requestingCode}
                                                        className="w-full"
                                                    >
                                                        {requestingCode ? <Loader2 className="animate-spin mr-2" /> : null}
                                                        Request Code
                                                    </Button>
                                                </>
                                            ) : (
                                                <div className="space-y-4 text-center">
                                                    <div className="p-6 bg-blue-50 rounded-2xl">
                                                        <p className="text-3xl font-bold text-blue-600 tracking-widest">{pairingCode}</p>
                                                    </div>
                                                    <div className="text-sm text-slate-600 space-y-2">
                                                        <p className="font-semibold">Enter this code in WhatsApp:</p>
                                                        <ol className="text-left text-xs space-y-1 pl-4">
                                                            <li>1. Open WhatsApp on your phone</li>
                                                            <li>2. Go to Settings → Linked Devices</li>
                                                            <li>3. Tap "Link a Device"</li>
                                                            <li>4. Select "Link with phone number"</li>
                                                            <li>5. Enter the code above</li>
                                                        </ol>
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => { setPairingCode(''); setPhoneNumber(''); }}
                                                        className="w-full"
                                                    >
                                                        Request New Code
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Group List Modal */}
            {groupList && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-2xl bg-white shadow-2xl rounded-xl overflow-hidden border-none max-h-[80vh] flex flex-col">
                        <CardHeader className="flex flex-row justify-between items-center border-b p-5 shrink-0">
                            <div>
                                <CardTitle className="text-lg font-bold">Synced Groups</CardTitle>
                                <p className="text-sm text-slate-500">
                                    {groupList.name} • {groupList.count} Groups Found
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setGroupList(null)}><X className="h-4 w-4" /></Button>
                        </CardHeader>
                        <CardContent className="p-0 overflow-y-auto flex-1">
                            {groupList.groups && groupList.groups.length > 0 ? (
                                <ul className="divide-y divide-slate-100">
                                    {groupList.groups.map((g: any) => (
                                        <li key={g.id} className="p-4 hover:bg-slate-50 flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold">
                                                    {g.name?.charAt(0) || 'G'}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-900">{g.name}</p>
                                                    <p className="text-xs text-slate-500 font-mono">{g.group_id}</p>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                                                ID Verified
                                            </Badge>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="p-10 text-center text-slate-500">
                                    <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                    <p>No groups synced yet.</p>
                                    <Button variant="link" onClick={() => { setGroupList(null); handleSyncGroups(groupList.id); }}>Try Syncing Now</Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}