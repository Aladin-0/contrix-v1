'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, Bed, Tag, X, Image as ImageIcon } from 'lucide-react';
import api from '@/lib/api';

interface Property {
    id: string; // UUID
    title: string;
    price: string;
    location: string;
    bedrooms: number;
    description: string;
    photos: string[];
}

export default function Properties() {
    const [properties, setProperties] = useState<Property[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        price: '',
        location: '',
        bedrooms: '',
        description: '',
    });

    useEffect(() => {
        fetchProperties();
    }, []);

    const fetchProperties = async () => {
        try {
            setLoading(true);
            const res = await api.get('/properties/');
            const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
            setProperties(data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching properties:", error);
            setLoading(false);
        }
    };

    const handleAddProperty = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/properties/', {
                title: formData.title,
                price: formData.price,
                location: formData.location,
                bedrooms: Number(formData.bedrooms),
                description: formData.description,
                photos: [] // No photo upload UI yet, sending empty array
            });

            // Refresh list
            fetchProperties();
            setFormData({ title: '', price: '', location: '', bedrooms: '', description: '' });
            setShowForm(false);
        } catch (error) {
            console.error("Error adding property:", error);
            alert("Failed to add property.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Properties</h1>
                    <p className="text-slate-500">Manage your real estate listings.</p>
                </div>
                {!showForm && (
                    <Button onClick={() => setShowForm(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Property
                    </Button>
                )}
            </div>

            {showForm && (
                <Card className="border-slate-300 shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Add New Property</CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleAddProperty} className="grid gap-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Title</label>
                                    <Input
                                        required
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="e.g. Sunny Loft"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Price</label>
                                    <Input
                                        required
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        placeholder="e.g. 500000.00" // backend expects decimal
                                        type="number"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Location</label>
                                    <Input
                                        required
                                        value={formData.location}
                                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                                        placeholder="City, Address"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Bedrooms</label>
                                    <Input
                                        required
                                        type="number"
                                        value={formData.bedrooms}
                                        onChange={e => setFormData({ ...formData, bedrooms: e.target.value })}
                                        placeholder="Num bedrooms"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Description</label>
                                <Input
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Short description..."
                                />
                            </div>
                            <div className="flex justify-end pt-2">
                                <Button type="submit">Publish Listing</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {properties.map((property) => (
                    <Card key={property.id} className="overflow-hidden group hover:shadow-lg transition-all">
                        <div className="aspect-video w-full bg-slate-100 relative">
                            {property.photos && property.photos.length > 0 ? (
                                <img
                                    src={property.photos[0]}
                                    alt={property.title}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-slate-400">
                                    <ImageIcon className="h-10 w-10" />
                                </div>
                            )}
                            <Badge className="absolute top-2 right-2 bg-black/70 hover:bg-black/80">
                                ${property.price}
                            </Badge>
                        </div>
                        <CardContent className="p-4">
                            <h3 className="font-semibold text-lg line-clamp-1">{property.title}</h3>
                            <div className="flex items-center text-sm text-slate-500 mt-1">
                                <MapPin className="h-3.5 w-3.5 mr-1" />
                                {property.location}
                            </div>
                            <div className="mt-3 flex items-center gap-4 text-sm font-medium">
                                <div className="flex items-center text-slate-700">
                                    <Bed className="h-4 w-4 mr-1.5" />
                                    {property.bedrooms} Beds
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {properties.length === 0 && !loading && (
                    <p className="text-muted-foreground col-span-full">No properties listed.</p>
                )}
            </div>
        </div>
    );
}
