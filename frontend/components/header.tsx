export function Header() {
    return (
        <header className="flex h-16 items-center gap-4 bg-white px-6 shadow-sm">
            <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-800">Welcome back</h2>
            </div>
            <div className="flex items-center gap-4">
                {/* Placeholder for header actions if needed */}
                <button className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
                    {/* Notification icon or similar could go here */}
                </button>
            </div>
        </header>
    );
}
