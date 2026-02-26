'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Upload, Plus, X, Trash2, Folder, FolderPlus, Users, ChevronLeft } from 'lucide-react';
import api from '@/lib/api';
import { Label } from '@/components/ui/label';

interface Contact {
    id: string;
    name: string;
    phone: string;
    tags: string[];
    status: string;
}

interface Category {
    id: string;
    name: string;
    description: string;
    contact_count?: number;
}

export default function Contacts() {
    // Data State
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);

    // UI State
    const [loading, setLoading] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null); // null = Dashboard View

    // Actions State
    const [importing, setImporting] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);

    // Form State
    const [newContact, setNewContact] = useState({ name: '', phone: '', tags: '' });
    const [newCategoryName, setNewCategoryName] = useState('');

    useEffect(() => {
        fetchCategories();
    }, []);

    // Fetch contacts whenever selectedCategory changes (if one is selected)
    useEffect(() => {
        if (selectedCategory) {
            fetchContacts();
        } else {
            // Refresh categories to get updated counts when going back to dashboard
            fetchCategories();
        }
    }, [selectedCategory]);

    const fetchCategories = async () => {
        try {
            const res = await api.get('/contact-categories/');
            setCategories(res.data.results || res.data);
        } catch (error) {
            console.error("Failed to fetch categories", error);
        }
    };

    const fetchContacts = async () => {
        try {
            setLoading(true);
            let url = '/contacts/';
            if (selectedCategory && selectedCategory.id !== 'all') {
                // Filter by the selected category name (tag)
                url += `?tags=${encodeURIComponent(selectedCategory.name)}`;
            }
            const res = await api.get(url);
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setContacts(data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching contacts:", error);
            setLoading(false);
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            await api.post('/contact-categories/', { name: newCategoryName });
            setNewCategoryName('');
            setIsCreatingCategory(false);
            fetchCategories();
        } catch (error) {
            alert("Failed to create category");
        }
    };

    const handleDeleteCategory = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm("Delete this category? (Contacts will remain but tag won't be listed here)")) return;
        try {
            await api.delete(`/contact-categories/${id}/`);
            if (selectedCategory?.id === id) setSelectedCategory(null);
            fetchCategories();
        } catch (error) {
            alert("Failed to delete category");
        }
    };

    const handleAddContact = async () => {
        if (!newContact.phone) return;
        try {
            const cleanPhone = newContact.phone.replace(/[^0-9]/g, '');
            // Auto-add selected category as a tag
            let tagArray = newContact.tags.split(',').map(t => t.trim()).filter(Boolean);

            if (selectedCategory && selectedCategory.id !== 'all' && !tagArray.includes(selectedCategory.name)) {
                tagArray.push(selectedCategory.name);
            }

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
            alert("Failed to add contact.");
        }
    };

    const handleImport = async () => {
        if (!file) return;
        try {
            setImporting(true);
            const formData = new FormData();
            formData.append('file', file);

            // If a category is selected and not 'all', pass it as a tag
            if (selectedCategory && selectedCategory.id !== 'all') {
                formData.append('tags', selectedCategory.name);
            }

            await api.post('/contacts/bulk_import/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            alert('Contacts imported successfully!');
            setFile(null);
            fetchContacts();
            setImporting(false);
        } catch (error) {
            console.error("Error importing contacts:", error);
            alert('Failed to import contacts.');
            setImporting(false);
        }
    };

    const handleDeleteContact = async (id: string) => {
        if (!confirm("Delete contact?")) return;
        await api.delete(`/contacts/${id}/`);
        fetchContacts();
    }

    // --- RENDER HELPERS ---

    const renderCategoryGrid = () => (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contact Categories</h1>
                    <p className="text-slate-500">Select a category to view or manage contacts.</p>
                </div>
                <Button onClick={() => setIsCreatingCategory(true)} className="bg-blue-600 hover:bg-blue-700">
                    <FolderPlus className="mr-2 h-4 w-4" /> Create Category
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {/* Special "All Contacts" Card */}
                <Card
                    className="cursor-pointer hover:shadow-md transition-shadow hover:border-blue-200 group"
                    onClick={() => setSelectedCategory({ id: 'all', name: 'All Contacts', description: '' })}
                >
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-medium group-hover:text-blue-600">All Contacts</CardTitle>
                        <Users className="h-5 w-5 text-slate-400 group-hover:text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-slate-900">--</div>
                        <p className="text-xs text-slate-500 mt-1">View global list</p>
                    </CardContent>
                </Card>

                {categories.map((cat) => (
                    <Card
                        key={cat.id}
                        className="cursor-pointer hover:shadow-md transition-shadow hover:border-blue-200 group relative"
                        onClick={() => setSelectedCategory(cat)}
                    >
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg font-medium group-hover:text-blue-600 truncate">{cat.name}</CardTitle>
                            <Folder className="h-5 w-5 text-slate-400 group-hover:text-amber-400 fill-slate-100 group-hover:fill-amber-100" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-slate-900">{cat.contact_count || 0}</div>
                            <p className="text-xs text-slate-500 mt-1">Contacts</p>
                        </CardContent>
                        {/* Delete Button overlaid */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-transparent"
                            onClick={(e) => handleDeleteCategory(e, cat.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </Card>
                ))}

                {/* Add New Card Button Style */}
                <div
                    onClick={() => setIsCreatingCategory(true)}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors min-h-[140px]"
                >
                    <Plus className="h-8 w-8 mb-2" />
                    <span className="font-medium">Add Category</span>
                </div>
            </div>
        </div>
    );

    const renderContactList = () => (
        <div className="flex h-[calc(100vh-100px)] gap-6 p-6">
            {/* Sidebar (Classic View) */}
            <div className="w-64 shrink-0 flex flex-col border-r pr-6 hidden md:flex">
                <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" className="-ml-3 text-slate-500" onClick={() => setSelectedCategory(null)}>
                        <ChevronLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                </div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-lg">Categories</h2>
                </div>
                <div className="space-y-1 flex-1 overflow-y-auto">
                    <button
                        onClick={() => setSelectedCategory({ id: 'all', name: 'All Contacts', description: '' })}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium ${selectedCategory?.id === 'all' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Users className="w-4 h-4" />
                        All Contacts
                    </button>
                    {categories.map(cat => (
                        <div
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat)}
                            className={`group w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors cursor-pointer text-sm font-medium ${selectedCategory?.id === cat.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <div className="flex items-center gap-3">
                                <Folder className={`w-4 h-4 ${selectedCategory?.id === cat.id ? 'text-blue-500' : 'text-slate-400'}`} />
                                <span className="truncate">{cat.name}</span>
                            </div>
                            <span className="text-xs text-slate-400">{cat.contact_count || 0}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="md:hidden" onClick={() => setSelectedCategory(null)}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                                {selectedCategory?.name || 'All Contacts'}
                            </h1>
                            <p className="text-slate-500">
                                {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'} found
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button onClick={() => setIsAdding(true)} className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="mr-2 h-4 w-4" /> Add
                        </Button>
                        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border shadow-sm">
                            <Input
                                type="file"
                                accept=".csv"
                                onChange={(e) => e.target.files && setFile(e.target.files[0])}
                                className="w-[200px] border-0 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 h-8 text-xs"
                            />
                            <Button variant="secondary" onClick={handleImport} disabled={!file || importing} size="sm" className="h-8">
                                {importing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                                Import
                            </Button>
                        </div>
                    </div>
                </div>

                <Card className="flex-1 flex flex-col min-h-0 border-slate-200 shadow-sm">
                    <CardContent className="p-0 flex-1 overflow-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
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
                                        <TableCell colSpan={5} className="h-32 text-center">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                                        </TableCell>
                                    </TableRow>
                                ) : contacts.map((contact) => (
                                    <TableRow key={contact.id}>
                                        <TableCell className="font-medium whitespace-nowrap">{contact.name || '-'}</TableCell>
                                        <TableCell className="whitespace-nowrap font-mono text-xs">{contact.phone}</TableCell>
                                        <TableCell>
                                            <div className="flex gap-1 flex-wrap">
                                                {contact.tags.map(tag => (
                                                    <span key={tag} className="inline-flex items-center rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase font-medium text-slate-600 border border-slate-200">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${contact.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                {contact.status}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteContact(contact.id)}
                                                className="text-slate-400 hover:text-red-600 h-8 w-8 p-0"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {contacts.length === 0 && !loading && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-slate-500 h-32">
                                            No contacts in this category.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );

    return (
        <div>
            {!selectedCategory ? renderCategoryGrid() : renderContactList()}

            {/* Create Category Dialog */}
            <Dialog open={isCreatingCategory} onOpenChange={setIsCreatingCategory}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Category</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Category Name</Label>
                            <Input
                                placeholder="e.g. VIP Clients"
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreatingCategory(false)}>Cancel</Button>
                        <Button onClick={handleCreateCategory} disabled={!newCategoryName}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Contact Dialog */}
            <Dialog open={isAdding} onOpenChange={setIsAdding}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Contact {selectedCategory && selectedCategory.id !== 'all' ? `to ${selectedCategory.name}` : ''}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                                placeholder="Name"
                                value={newContact.name}
                                onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Phone (Required)</Label>
                            <Input
                                placeholder="e.g. 919876543210"
                                value={newContact.phone}
                                onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Tags (Optional additional tags)</Label>
                            <Input
                                placeholder="tag1, tag2"
                                value={newContact.tags}
                                onChange={e => setNewContact({ ...newContact, tags: e.target.value })}
                            />
                            {selectedCategory && selectedCategory.id !== 'all' && (
                                <p className="text-xs text-blue-600">
                                    Will also tag with: <strong>{selectedCategory.name}</strong>
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
                        <Button onClick={handleAddContact} disabled={!newContact.phone}>Save Contact</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
