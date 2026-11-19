import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "studio-input studio-focus-ring flex h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm text-foreground placeholder:text-muted",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
