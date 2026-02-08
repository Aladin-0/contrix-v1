'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, ChevronLeft, ChevronRight, Search, Plus, X, Trash2 } from 'lucide-react';
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

    // Manual creation state
    const [isAdding, setIsAdding] = useState(false);
    const [newContact, setNewContact] = useState({ name: '', phone: '', tags: '' });

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

    const handleAddContact = async () => {
        if (!newContact.phone) return;
        try {
            // Basic formatting: remove spaces/dashes, ensure numeric
            const cleanPhone = newContact.phone.replace(/[^0-9]/g, '');
            const tagArray = newContact.tags.split(',').map(t => t.trim()).filter(Boolean);

            await api.post('/contacts/', {
                name: newContact.name,
                phone: cleanPhone,
                tags: tagArray,
                status: 'ACTIVE'
            });

            setIsAdding(false);
            setNewContact({ name: '', phone: '', tags: '' });
            fetchContacts();
        } catch (error: any) {
            console.error("Error adding contact:", error);
            alert(error.response?.data?.phone ? "This phone number already exists." : "Failed to add contact.");
        }
    };

    const handleDeleteContact = async (id: string) => {
        if (!confirm("Are you sure you want to delete this contact?")) return;
        try {
            await api.delete(`/contacts/${id}/`);
            fetchContacts();
        } catch (error) {
            console.error("Delete failed:", error);
            alert("Failed to delete contact");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contacts</h1>
                    <p className="text-slate-500">Manage your audience and lead lists.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="mr-2 h-4 w-4" /> Add Contact
                    </Button>
                    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
                        <Input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="w-full max-w-xs border-0 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                        />
                        <Button variant="secondary" onClick={handleImport} disabled={!file || importing}>
                            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            Import CSV
                        </Button>
                    </div>
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
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell>
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
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteContact(contact.id)}
                                            className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {contacts.length === 0 && !loading && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                                        No contacts found. Import a CSV or add one manually.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {isAdding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-md bg-white shadow-2xl">
                        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                            <CardTitle>Add New Contact</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setIsAdding(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Name</label>
                                <Input
                                    placeholder="e.g. John Doe"
                                    value={newContact.name}
                                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Phone Number <span className="text-red-500">*</span></label>
                                <Input
                                    placeholder="e.g. 919876543210 (International Format)"
                                    value={newContact.phone}
                                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                                />
                                <p className="text-xs text-slate-500">Include country code without + (e.g., 91 for India).</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Tags</label>
                                <Input
                                    placeholder="vip, lead, 2024 (comma separated)"
                                    value={newContact.tags}
                                    onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
                                />
                            </div>
                            <div className="pt-4 flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
                                <Button onClick={handleAddContact} disabled={!newContact.phone}>
                                    Create Contact
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
