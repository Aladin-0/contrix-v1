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
    contact_name?: string;
    contact_tags?: string[];
    status: string;
    error_message: string;
    sent_at: string;
    platform?: string;
}

export default function MessageLogs() {
    const [logs, setLogs] = useState<MessageLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchLogs();
        fetchCategories();
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

    const fetchCategories = async () => {
        try {
            const res = await api.get('/contact-categories/');
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setCategories(data.map((c: any) => c.name));
        } catch (e) { }
    };

    // Filter Logic
    const filteredLogs = logs.filter(log => {
        const matchesSearch =
            (log.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (log.contact_phone?.includes(searchTerm)) ||
            (log.campaign_name?.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesCategory = selectedCategory === 'all' || (log.contact_tags && log.contact_tags.includes(selectedCategory));

        return matchesSearch && matchesCategory;
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">Message Logs</h1>
                <p className="text-slate-500">Track all sent messages and delivery statuses.</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <CardTitle className="hidden md:block">History</CardTitle>

                        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                            {/* Category Filter */}
                            <select
                                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                            >
                                <option value="all">All Categories</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>

                            {/* Search */}
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                                <Input
                                    placeholder="Search name, phone..."
                                    className="pl-8"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time (IST)</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Campaign</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell>
                                </TableRow>
                            ) : filteredLogs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                                        {new Date(log.sent_at).toLocaleString('en-IN', {
                                            timeZone: 'Asia/Kolkata',
                                            day: '2-digit', month: 'short',
                                            hour: '2-digit', minute: '2-digit', hour12: true
                                        })}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm">{log.contact_name || 'Unknown'}</span>
                                            <span className="text-xs text-slate-400 font-mono">{log.contact_phone}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {log.contact_tags && log.contact_tags.length > 0 ? log.contact_tags.map((tag: string) => (
                                                <span key={tag} className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] border">
                                                    {tag}
                                                </span>
                                            )) : <span className="text-slate-300 text-xs">-</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-600">{log.campaign_name}</TableCell>
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
                            {!loading && filteredLogs.length === 0 && (
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
