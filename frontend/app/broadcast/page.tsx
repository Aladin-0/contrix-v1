'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Users, CheckSquare, Square, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { GroupCollectionManager } from "@/components/group-collection-manager";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label";

interface WhatsAppGroup {
    id: number;
    group_id: string;
    name: string;
    participants_count: number;
}

interface PhoneInstance {
    id: string;
    name: string;
    phone_number: string;
    status: string;
    groups: WhatsAppGroup[];
}

export default function Broadcast() {
    const [message, setMessage] = useState('');
    const [platforms, setPlatforms] = useState({
        whatsapp: true,
        facebook: true,
        instagram: true,
    });
    const [sending, setSending] = useState(false);

    // Group Targeting State
    const [phones, setPhones] = useState<PhoneInstance[]>([]);
    const [loadingPhones, setLoadingPhones] = useState(true);
    const [sendToAllGroups, setSendToAllGroups] = useState(false);
    const [selectedGroups, setSelectedGroups] = useState<number[]>([]); // Array of DB IDs (numbers)
    const [sendToAllContacts, setSendToAllContacts] = useState(true);

    // Tag State
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    // Group Collections State
    const [collections, setCollections] = useState<any[]>([]);
    const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

    useEffect(() => {
        fetchPhones();
        fetchCollections();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const res = await api.get('/contact-categories/');
            const categories = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setAvailableTags(categories.map((c: any) => c.name));
        } catch (error) {
            console.error("Failed to fetch categories", error);
        }
    };

    const fetchPhones = async () => {
        try {
            const res = await api.get('/phones/');
            // DRF returns paginated response { results: [...] } if pagination is enabled
            const phoneData = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setPhones(phoneData);
        } catch (error) {
            console.error("Failed to fetch phones:", error);
            setPhones([]);
        } finally {
            setLoadingPhones(false);
        }
    };

    const fetchCollections = async () => {
        try {
            const res = await api.get('/group-collections/');
            setCollections(res.data.results || res.data);
        } catch (error) {
            console.error("Failed to fetch collections", error);
        }
    };

    const toggleGroupSelection = (id: number) => {
        if (selectedGroups.includes(id)) {
            setSelectedGroups(selectedGroups.filter(gid => gid !== id));
        } else {
            setSelectedGroups([...selectedGroups, id]);
            // If selecting manual groups, create logic to deselect collection could be added here if desired, 
            // but for now we allow mixing or prioritize one in handleSend
        }
    };

    const toggleAllGroupsForPhone = (phone: PhoneInstance) => {
        const phoneGroupIds = phone.groups.map(g => g.id);
        const allSelected = phoneGroupIds.every(id => selectedGroups.includes(id));

        if (allSelected) {
            // Deselect all for this phone
            setSelectedGroups(selectedGroups.filter(id => !phoneGroupIds.includes(id)));
        } else {
            // Select all for this phone
            const newSelected = [...selectedGroups];
            phoneGroupIds.forEach(id => {
                if (!newSelected.includes(id)) newSelected.push(id);
            });
            setSelectedGroups(newSelected);
        }
    };

    const handleSend = async () => {
        if (!message.trim()) {
            alert('Please enter a message');
            return;
        }

        if (!platforms.whatsapp && !platforms.facebook && !platforms.instagram) {
            alert('Please select at least one platform');
            return;
        }

        if (platforms.whatsapp && !sendToAllContacts && !sendToAllGroups && selectedGroups.length === 0 && !selectedCollectionId) {
            alert('Please select at least one target (Contacts, Groups, or Collection) for WhatsApp.');
            return;
        }

        const targetDescription = sendToAllGroups
            ? 'ALL Groups'
            : (selectedCollectionId
                ? 'Collection'
                : selectedGroups.length + ' Specific Groups');

        if (!confirm(`Send to ${sendToAllContacts && selectedTags.length === 0 ? 'ALL Contacts' : (selectedTags.length > 0 ? `Contacts with tags: ${selectedTags.join(', ')}` : 'NO Contacts')} and ${targetDescription}?`)) return;

        setSending(true);
        try {
            const payload = {
                message: message,
                send_whatsapp: platforms.whatsapp,
                send_facebook: platforms.facebook,
                send_instagram: platforms.instagram,
                send_to_all_groups: sendToAllGroups,
                target_groups: sendToAllGroups ? [] : selectedGroups,
                collection_id: selectedCollectionId || undefined,
                send_to_all_contacts: sendToAllContacts && selectedTags.length === 0, // Only send to all if no specific tags are selected
                target_tags: selectedTags
            };

            const res = await api.post('/broadcast/instant/', payload);

            alert(`✅ ${res.data.message}\n${res.data.details || ''}`);
            setMessage(''); // Clear message after sending
            // Optional: Clear selections
            // setSelectedGroups([]);
            // setSelectedCollectionId(null);
        } catch (error: any) {
            alert(`❌ Failed: ${error.response?.data?.error || 'Unknown error'}`);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-24 md:pb-10 px-4">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Quick Broadcast</h1>
                <p className="text-sm md:text-base text-slate-500">Send messages instantly to all contacts and selected groups.</p>
            </div>

            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
                {/* Left Column: Message & Platforms */}
                <div className="space-y-6">
                    <Card className="border-slate-300 shadow-lg h-full">
                        <CardHeader>
                            <CardTitle>1. Compose Message</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Message Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Your Message</label>
                                <textarea
                                    className="flex min-h-[300px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Type your message here..."
                                    disabled={sending}
                                />
                                <p className="text-xs text-slate-500">
                                    Character count: {message.length}
                                </p>
                            </div>

                            {/* Platform Selection */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium">Select Platforms</label>
                                <div className="flex gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={platforms.whatsapp}
                                            onChange={(e) => setPlatforms({ ...platforms, whatsapp: e.target.checked })}
                                            className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                            disabled={sending}
                                        />
                                        <span className="text-sm font-medium">WhatsApp</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={platforms.facebook}
                                            onChange={(e) => setPlatforms({ ...platforms, facebook: e.target.checked })}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            disabled={sending}
                                        />
                                        <span className="text-sm font-medium">Facebook</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={platforms.instagram}
                                            onChange={(e) => setPlatforms({ ...platforms, instagram: e.target.checked })}
                                            className="w-4 h-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                                            disabled={sending}
                                        />
                                        <span className="text-sm font-medium">Instagram</span>
                                    </label>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Targeting */}
                <div className="space-y-6">
                    <Card className="border-slate-300 shadow-lg h-full">
                        <CardHeader>
                            <CardTitle>2. Targeting</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {platforms.whatsapp ? (
                                <>
                                    {/* Contact Targeting */}
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700">Contact Targeting</label>
                                            <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-md border border-blue-200">
                                                <input
                                                    type="checkbox"
                                                    id="send_contacts"
                                                    checked={sendToAllContacts}
                                                    onChange={(e) => setSendToAllContacts(e.target.checked)}
                                                    className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                                    disabled={sending}
                                                />
                                                <label
                                                    htmlFor="send_contacts"
                                                    className="text-sm font-medium leading-none cursor-pointer"
                                                >
                                                    Send to ALL Active Contacts
                                                </label>
                                            </div>
                                        </div>

                                        {/* Tag Filter */}
                                        <div className="border-t pt-4">
                                            <Label className="mb-2 block font-semibold">Filter by Category (Optional)</Label>
                                            <p className="text-xs text-slate-500 mb-3">Select specific categories to target. If selected, messsages will be sent ONLY to these categories (ignoring "All Contacts").</p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {availableTags.map(tag => (
                                                    <div
                                                        key={tag}
                                                        onClick={() => toggleTag(tag)}
                                                        className={`cursor-pointer px-3 py-2 rounded-md border text-xs md:text-sm flex items-center gap-2 transition-colors ${selectedTags.includes(tag) ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium' : 'hover:bg-slate-50 border-slate-200'}`}
                                                    >
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selectedTags.includes(tag) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                                                            {selectedTags.includes(tag) && <CheckSquare className="w-3 h-3 text-white" />}
                                                        </div>
                                                        <span className="truncate">{tag}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Group Targeting */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700">Group Targeting</label>
                                        <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-md border border-green-200">
                                            <input
                                                type="checkbox"
                                                id="send_all"
                                                checked={sendToAllGroups}
                                                onChange={(e) => setSendToAllGroups(e.target.checked)}
                                                className="w-4 h-4 rounded border-green-300 text-green-600 focus:ring-green-500"
                                                disabled={sending}
                                            />
                                            <label
                                                htmlFor="send_all"
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                            >
                                                Send to ALL joined groups (Blast Mode)
                                            </label>
                                        </div>

                                        {!sendToAllGroups && (
                                            <div className="space-y-6">
                                                {/* Group Collection Selection */}
                                                <div className="space-y-3 p-3 bg-slate-50 rounded-md border border-slate-200">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-sm font-medium text-slate-700">Quick Select Collection:</label>
                                                        <GroupCollectionManager phones={phones} onCollectionsUpdated={fetchCollections} />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Select onValueChange={(val) => {
                                                            if (val === "none") setSelectedCollectionId(null);
                                                            else setSelectedCollectionId(val);
                                                        }} value={selectedCollectionId || "none"}>
                                                            <SelectTrigger className="w-full bg-white">
                                                                <SelectValue placeholder="Select a collection..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="none">-- No Collection Selected --</SelectItem>
                                                                {collections.map(col => (
                                                                    <SelectItem key={col.id} value={col.id}>{col.name} ({col.group_ids?.length || 0} groups)</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>

                                                        {selectedCollectionId && (
                                                            <Button
                                                                variant="destructive"
                                                                size="icon"
                                                                title="Delete this collection"
                                                                onClick={async () => {
                                                                    if (!confirm("Delete this collection?")) return;
                                                                    try {
                                                                        await api.delete(`/group-collections/${selectedCollectionId}/`);
                                                                        setSelectedCollectionId(null);
                                                                        fetchCollections();
                                                                    } catch (e) { alert("Failed to delete"); }
                                                                }}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </div>

                                                    {selectedCollectionId && (
                                                        <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                                                            <CheckSquare className="w-3 h-3" /> Messages will be sent to all groups in this collection.
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Individual Group Selection */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-sm font-medium text-slate-700">Or Select Specific Groups:</label>
                                                        <Badge variant="secondary">{selectedGroups.length} selected</Badge>
                                                    </div>

                                                    {loadingPhones ? (
                                                        <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
                                                    ) : (
                                                        <ScrollArea className="h-[50vh] md:h-[600px] rounded-md border px-2 md:px-4 py-2">
                                                            <Accordion type="multiple" className="w-full">
                                                                {phones.map((phone) => (
                                                                    <AccordionItem key={phone.id} value={phone.id}>
                                                                        <div className="sticky top-0 z-10 bg-white shadow-sm border-b">
                                                                            <AccordionTrigger className="hover:no-underline py-3">
                                                                                <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                                                                    <Users className="w-4 h-4 text-slate-500 shrink-0" />
                                                                                    <span className="text-sm font-medium truncate">{phone.name}</span>
                                                                                    <Badge variant="outline" className="ml-2 text-[10px] md:text-xs shrink-0">
                                                                                        {phone.groups.length}
                                                                                    </Badge>
                                                                                </div>
                                                                            </AccordionTrigger>
                                                                        </div>
                                                                        <AccordionContent>
                                                                            <div className="flex flex-col gap-2 pl-2">
                                                                                {/* Select All for Phone */}
                                                                                <div
                                                                                    className="flex items-center gap-2 p-2 hover:bg-slate-100 rounded cursor-pointer"
                                                                                    onClick={() => toggleAllGroupsForPhone(phone)}
                                                                                >
                                                                                    {phone.groups.every(g => selectedGroups.includes(g.id)) ?
                                                                                        <CheckSquare className="w-4 h-4 text-green-600" /> :
                                                                                        <Square className="w-4 h-4 text-slate-400" />
                                                                                    }
                                                                                    <span className="text-sm font-semibold text-slate-700">Select All in {phone.name}</span>
                                                                                </div>

                                                                                {phone.groups.map(group => (
                                                                                    <div
                                                                                        key={group.id}
                                                                                        className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer"
                                                                                        onClick={() => toggleGroupSelection(group.id)}
                                                                                    >
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={selectedGroups.includes(group.id)}
                                                                                            onChange={() => { }} // Handled by div click
                                                                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 pointer-events-none"
                                                                                        />
                                                                                        <span className="text-sm text-slate-700 truncate">{group.name}</span>
                                                                                    </div>
                                                                                ))}
                                                                                {phone.groups.length === 0 && (
                                                                                    <p className="text-xs text-slate-400 italic p-2">No groups found. Try syncing in Phone settings.</p>
                                                                                )}
                                                                            </div>
                                                                        </AccordionContent>
                                                                    </AccordionItem>
                                                                ))}
                                                            </Accordion>
                                                        </ScrollArea>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                    <p>Select WhatsApp to enable group targeting.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Send Button Area - Sticky on Mobile */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 md:static md:bg-transparent md:border-0 md:p-0 z-20">
                <Button
                    onClick={handleSend}
                    disabled={sending || !message.trim()}
                    className="w-full h-12 md:h-14 text-base md:text-lg bg-green-600 hover:bg-green-700 shadow-md"
                >
                    {sending ? (
                        <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Broadcasting...
                        </>
                    ) : (
                        <>
                            <Send className="mr-2 h-5 w-5" />
                            Send Broadcast Now
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
