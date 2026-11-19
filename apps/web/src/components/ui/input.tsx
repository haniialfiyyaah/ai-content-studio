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
      "flex h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm text-foreground placeholder:text-muted studio-focus-ring",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
