import { MobileSidebar } from '@/components/mobile-sidebar';

export function Header() {
    return (
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 bg-white px-4 md:px-6 shadow-sm">
            <MobileSidebar />
            <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-800">Welcome, Admin</h2>
            </div>
            <div className="flex items-center gap-4">
                {/* Placeholder for header actions if needed */}
                <button className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center">
                    <span className="sr-only">Notifications</span>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                </button>
            </div>
        </header>
    );
}
