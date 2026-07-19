import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] hover:bg-primary/90 hover:[transform:translate(-1px,-1px)] hover:shadow-[5px_5px_0_0_var(--foreground)] active:[transform:translate(2px,2px)] active:shadow-[1px_1px_0_0_var(--foreground)]",
        destructive:
          "rounded-full border-2 border-foreground bg-destructive text-destructive-foreground shadow-[3px_3px_0_0_var(--foreground)] hover:bg-destructive/90 hover:[transform:translate(-1px,-1px)] hover:shadow-[5px_5px_0_0_var(--foreground)] active:[transform:translate(2px,2px)] active:shadow-[1px_1px_0_0_var(--foreground)]",
        outline:
          "rounded-full border-2 border-foreground bg-background shadow-[3px_3px_0_0_var(--foreground)] hover:bg-accent hover:text-accent-foreground hover:[transform:translate(-1px,-1px)] hover:shadow-[5px_5px_0_0_var(--foreground)] active:[transform:translate(2px,2px)] active:shadow-[1px_1px_0_0_var(--foreground)]",
        secondary:
          "rounded-full border-2 border-foreground bg-secondary text-secondary-foreground shadow-[3px_3px_0_0_var(--foreground)] hover:bg-secondary/80",
        ghost: "rounded-md hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-full px-3 text-xs",
        lg: "h-10 rounded-full px-8",
        icon: "h-9 w-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    // Default to type="button" so a <Button> inside a form never implicitly
    // submits it; callers pass type="submit" explicitly when they want that.
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(asChild ? (type !== undefined ? { type } : {}) : { type: type ?? "button" })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
