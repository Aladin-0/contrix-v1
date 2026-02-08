'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from 'lucide-react';
import api from '@/lib/api';

interface MessageLog {
    id: string;
    campaign_name: string;
    contact_phone: string;
    status: string;
    error_message: string;
    sent_at: string;
    platform?: string;
}

export default function MessageLogs() {
    const [logs, setLogs] = useState<MessageLog[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const res = await api.get('/logs/');
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setLogs(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Message Logs</h1>
                <p className="text-slate-500">Track all sent messages and delivery statuses.</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>History</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                            <Input placeholder="Search logs..." className="pl-8" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Platform</TableHead>
                                <TableHead>Campaign</TableHead>
                                <TableHead>To</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
                                </TableRow>
                            ) : logs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell className="text-xs text-slate-500">
                                        {new Date(log.sent_at).toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={
                                            log.platform === 'FACEBOOK' ? 'border-blue-500 text-blue-500' :
                                                log.platform === 'INSTAGRAM' ? 'border-pink-500 text-pink-500' :
                                                    'border-green-500 text-green-500'
                                        }>
                                            {log.platform || 'WHATSAPP'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{log.campaign_name}</TableCell>
                                    <TableCell>{log.contact_phone || 'Page/Feed'}</TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            log.status === 'SENT' ? 'default' :
                                                log.status === 'DELIVERED' ? 'success' :
                                                    log.status === 'READ' ? 'success' : 'destructive'
                                        }>{log.status}</Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[200px] truncate text-xs text-slate-500">
                                        {log.error_message || "-"}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && logs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">No logs found.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
