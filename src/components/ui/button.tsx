import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Shared button styles. Links that act as buttons use `buttonVariants` on the
// link itself, so the right element keeps its meaning for screen readers.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-(--radius-control) text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-foreground text-background hover:bg-foreground/85",
        outline:
          "border border-border-strong text-foreground hover:border-muted-foreground hover:bg-foreground/10",
        quiet:
          "text-muted-foreground underline underline-offset-4 hover:text-foreground",
      },
      size: {
        default: "h-10 px-4",
        large: "h-12 px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
