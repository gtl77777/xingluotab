import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-black/30", className)} {...props} />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  closeLabel?: string;
  hideCloseButton?: boolean;
  overlayClassName?: string;
};

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, closeLabel = "Close", hideCloseButton = false, overlayClassName, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border bg-background p-6 shadow-lg",
        className
      )}
      {...props}
    >
      {children}
      {hideCloseButton ? null : (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 outline-none hover:opacity-100 focus:ring-2 focus:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">{closeLabel}</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }: ComponentPropsWithoutRef<"div">) => (
  <div className={cn("grid gap-1.5 text-left", className)} {...props} />
);

export const DialogFooter = ({ className, ...props }: ComponentPropsWithoutRef<"div">) => (
  <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
);

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-base font-semibold", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
