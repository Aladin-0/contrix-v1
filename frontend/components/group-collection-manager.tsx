import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import api from '@/lib/api';

interface WhatsAppGroup {
    id: number;
    group_id: string;
    name: string;
}

interface PhoneInstance {
    id: string;
    name: string;
    groups: WhatsAppGroup[];
}

interface GroupCollection {
    id: string;
    name: string;
    group_ids: string[]; // Array of Group JIDs (strings)
    groups_details?: WhatsAppGroup[];
}

interface GroupCollectionManagerProps {
    phones: PhoneInstance[];
    onCollectionsUpdated: () => void;
}

export function GroupCollectionManager({ phones, onCollectionsUpdated }: GroupCollectionManagerProps) {
    const [collections, setCollections] = useState<GroupCollection[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // Creation State
    const [newCollectionName, setNewCollectionName] = useState("");
    const [selectedGroupsForNew, setSelectedGroupsForNew] = useState<string[]>([]); // Array of JIDs
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchCollections();
        }
    }, [isOpen]);

    const fetchCollections = async () => {
        setLoading(true);
        try {
            const res = await api.get('/group-collections/');
            setCollections(res.data.results || res.data);
        } catch (error) {
            console.error("Failed to fetch collections", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newCollectionName.trim()) {
            alert("Please enter a name");
            return;
        }
        if (selectedGroupsForNew.length === 0) {
            alert("Please select at least one group");
            return;
        }

        setCreating(true);
        try {
            await api.post('/group-collections/', {
                name: newCollectionName,
                group_ids: selectedGroupsForNew // Sending JIDs
            });
            fetchCollections();
            onCollectionsUpdated();
            setIsCreateOpen(false);
            setNewCollectionName("");
            setSelectedGroupsForNew([]);
        } catch (error) {
            alert("Failed to create collection");
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this collection?")) return;
        try {
            await api.delete(`/group-collections/${id}/`);
            fetchCollections();
            onCollectionsUpdated();
        } catch (error) {
            alert("Failed to delete");
        }
    };

    const toggleGroupSelection = (groupJid: string) => {
        if (selectedGroupsForNew.includes(groupJid)) {
            setSelectedGroupsForNew(prev => prev.filter(id => id !== groupJid));
        } else {
            setSelectedGroupsForNew(prev => [...prev, groupJid]);
        }
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Users className="w-4 h-4" />
                        Manage Collections
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Group Collections</DialogTitle>
                        <DialogDescription>
                            Create collections of groups for quick targeting.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col gap-4">
                        <div className="flex justify-end">
                            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-2 bg-green-600 hover:bg-green-700">
                                <Plus className="w-4 h-4" /> Create New Collection
                            </Button>
                        </div>

                        <ScrollArea className="flex-1 border rounded-md p-2">
                            {loading ? (
                                <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                            ) : collections.length === 0 ? (
                                <p className="text-center text-slate-500 py-8">No collections found. Create one to get started.</p>
                            ) : (
                                <div className="space-y-2">
                                    {collections.map(col => (
                                        <div key={col.id} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                                            <div>
                                                <h4 className="font-semibold text-slate-800">{col.name}</h4>
                                                <p className="text-xs text-slate-500">{col.group_ids ? col.group_ids.length : 0} groups</p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-2"
                                                onClick={(e) => handleDelete(col.id, e)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                <span className="hidden sm:inline">Delete</span>
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Create New Collection</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                        <div className="space-y-2">
                            <Label>Collection Name</Label>
                            <Input
                                placeholder="e.g. Investors, VIP Clients"
                                value={newCollectionName}
                                onChange={e => setNewCollectionName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
                            <Label>Select Groups ({selectedGroupsForNew.length} selected)</Label>
                            <Input placeholder="Search groups..." className="mb-2" />
                            <div className="flex-1 border rounded-md p-2 h-[300px] overflow-y-auto">
                                {phones.map(phone => (
                                    <div key={phone.id} className="mb-4">
                                        <div className="sticky top-0 bg-white z-10 py-1 border-b mb-2">
                                            <p className="text-xs font-bold text-slate-500 uppercase">{phone.name}</p>
                                        </div>
                                        <div className="space-y-1">
                                            {phone.groups.map(group => (
                                                <div
                                                    key={group.id}
                                                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${selectedGroupsForNew.includes(group.group_id) ? 'bg-green-50 border-green-200 border' : 'hover:bg-slate-50 border border-transparent'}`}
                                                    onClick={() => toggleGroupSelection(group.group_id)}
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedGroupsForNew.includes(group.group_id) ? 'bg-green-600 border-green-600' : 'border-slate-300'}`}>
                                                        {selectedGroupsForNew.includes(group.group_id) && <Plus className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <span className="text-sm">{group.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreate} disabled={creating || !newCollectionName || selectedGroupsForNew.length === 0} className="bg-green-600 hover:bg-green-700">
                            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create Collection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
