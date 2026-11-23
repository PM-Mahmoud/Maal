import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, X } from "lucide-react";

/** Right-hand drawer shell (filters, add transaction). Focus-trapped, Esc closes. */
export function TxDrawer({
  open, onOpenChange, title, onBack, backLabel, children, footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tx-scrim" />
        <DialogPrimitive.Content className="mh-shell tx-drawer" aria-describedby={undefined}>
          <header className="tx-drawer-head">
            {onBack && (
              <button type="button" className="tx-iconbtn" onClick={onBack} aria-label={backLabel || "Back"}>
                <ChevronLeft aria-hidden />
              </button>
            )}
            <DialogPrimitive.Title className="tx-eyebrow">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="tx-iconbtn tx-drawer-close" aria-label={`Close ${title.toLowerCase()}`}>
              <X aria-hidden />
            </DialogPrimitive.Close>
          </header>
          <div className="tx-drawer-body">{children}</div>
          {footer && <footer className="tx-drawer-foot">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Centred dialog shell (export). */
export function TxDialog({ open, onOpenChange, title, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="tx-scrim" />
        <DialogPrimitive.Content className="mh-shell tx-dialog" aria-describedby={undefined}>
          <header className="tx-drawer-head tx-dialog-head">
            <DialogPrimitive.Title className="tx-eyebrow">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="tx-iconbtn tx-drawer-close" aria-label={`Close ${title.toLowerCase()}`}>
              <X aria-hidden />
            </DialogPrimitive.Close>
          </header>
          <div className="tx-dialog-body">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
