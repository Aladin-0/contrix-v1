import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

// Since we are not using class-variance-authority yet, I'll do a simpler implementation for now
// Update: actually I should install class-variance-authority or just write it manually.
// To keep it simple and dependency-free for now as per the plan, I will write manual classes logic or just install cva quickly?
// The plan didn't mention cva. I'll write it manually to accept variants.

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    size?: "default" | "sm" | "lg" | "icon"
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"

        // Manual variant classes
        let variantStyles = ""
        switch (variant) {
            case "default": variantStyles = "bg-slate-900 text-slate-50 hover:bg-slate-900/90"; break;
            case "destructive": variantStyles = "bg-red-500 text-slate-50 hover:bg-red-500/90"; break;
            case "outline": variantStyles = "border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900"; break;
            case "secondary": variantStyles = "bg-slate-100 text-slate-900 hover:bg-slate-100/80"; break;
            case "ghost": variantStyles = "hover:bg-slate-100 hover:text-slate-900"; break;
            case "link": variantStyles = "text-slate-900 underline-offset-4 hover:underline"; break;
        }

        let sizeStyles = ""
        switch (size) {
            case "default": sizeStyles = "h-10 px-4 py-2"; break;
            case "sm": sizeStyles = "h-9 rounded-md px-3"; break;
            case "lg": sizeStyles = "h-11 rounded-md px-8"; break;
            case "icon": sizeStyles = "h-10 w-10"; break;
        }

        return (
            <Comp
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    variantStyles,
                    sizeStyles,
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }
