'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Phone, Users, FileText, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

const sidebarItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Broadcast', href: '/broadcast', icon: Send },
    { name: 'Phone System', href: '/phones', icon: Phone },
    { name: 'Contacts', href: '/contacts', icon: Users },
    { name: 'Message Logs', href: '/logs', icon: FileText },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex h-screen w-64 flex-col bg-slate-900 text-white">
            <div className="flex h-16 items-center justify-center border-b border-slate-800">
                <h1 className="text-xl font-bold tracking-wider">CONTRIX</h1>
            </div>
            <nav className="flex-1 space-y-1 p-4">
                {sidebarItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-slate-800 text-white'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            )}
                        >
                            <item.icon className="h-5 w-5" />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
            <div className="border-t border-slate-800 p-4">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-700" />
                    <div className="text-sm">
                        <p className="font-medium text-white">User Profile</p>
                        <p className="text-xs text-slate-500">Admin</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
