import * as React from "react"
import { cn } from "@/lib/utils"

// Simple badge component
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
    let variantStyles = ""
    switch (variant) {
        case "default": variantStyles = "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80"; break;
        case "secondary": variantStyles = "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80"; break;
        case "destructive": variantStyles = "border-transparent bg-red-500 text-slate-50 hover:bg-red-500/80"; break;
        case "outline": variantStyles = "text-slate-950 border-slate-200"; break;
        case "success": variantStyles = "border-transparent bg-green-500 text-slate-50 hover:bg-green-500/80"; break;
        case "warning": variantStyles = "border-transparent bg-yellow-500 text-white hover:bg-yellow-500/80"; break;
    }

    return (
        <div
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2",
                variantStyles,
                className
            )}
            {...props}
        />
    )
}

export { Badge }
