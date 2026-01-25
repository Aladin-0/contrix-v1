'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import api from '@/lib/api';

interface Contact {
    id: string;
    name: string;
    phone: string;
    tags: string[];
    status: string;
}

export default function Contacts() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [file, setFile] = useState<File | null>(null);

    // Pagination if needed later, handling locally for now if API returns all or small list
    // The backend seems to use standard DRF pagination

    useEffect(() => {
        fetchContacts();
    }, []);

    const fetchContacts = async () => {
        try {
            setLoading(true);
            const res = await api.get('/contacts/');
            // Handle DRF pagination response structure { count: n, results: [...] } or simple list
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setContacts(data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching contacts:", error);
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        try {
            setImporting(true);
            const formData = new FormData();
            formData.append('file', file);

            await api.post('/contacts/bulk_import/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            alert('Contacts imported successfully!');
            setFile(null);
            // Clear the input value visually requires ref or controlled component logic, mostly file inputs are uncontrolled
            fetchContacts();
            setImporting(false);
        } catch (error) {
            console.error("Error importing contacts:", error);
            alert('Failed to import contacts.');
            setImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contacts</h1>
                    <p className="text-slate-500">Manage your audience and lead lists.</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
                    <Input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="w-full max-w-xs border-0 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                    />
                    <Button onClick={handleImport} disabled={!file || importing}>
                        {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Import CSV
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Contact List</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                            <Input placeholder="Search contacts..." className="pl-8" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Tags</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">Loading...</TableCell>
                                </TableRow>
                            ) : contacts.map((contact) => (
                                <TableRow key={contact.id}>
                                    <TableCell className="font-medium">{contact.name}</TableCell>
                                    <TableCell>{contact.phone}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-1 flex-wrap">
                                            {contact.tags.map(tag => (
                                                <span key={tag} className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            contact.status === 'ACTIVE' ? 'success' :
                                                contact.status === 'UNSUBSCRIBED' ? 'warning' : 'destructive'
                                        }>
                                            {contact.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {contacts.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                        No contacts found. Import a CSV to get started.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
