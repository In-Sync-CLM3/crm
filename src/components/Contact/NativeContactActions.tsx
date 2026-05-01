import { Button } from "@/components/ui/button";
import { Smartphone, MessageCircle } from "lucide-react";
import { nativeCall, openWhatsApp } from "@/lib/nativeContact";

interface NativeContactActionsProps {
  phone: string | null | undefined;
  className?: string;
  iconOnly?: boolean;
}

export function NativeContactActions({ phone, className, iconOnly = true }: NativeContactActionsProps) {
  if (!phone) return null;

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    nativeCall(phone);
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    openWhatsApp(phone);
  };

  if (iconOnly) {
    return (
      <>
        <Button
          size="icon"
          variant="outline"
          className={`h-8 w-8 ${className ?? ""}`}
          onClick={handleCall}
          title="Call (native dialer)"
          aria-label="Call (native dialer)"
        >
          <Smartphone className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className={`h-8 w-8 text-green-600 hover:text-green-700 ${className ?? ""}`}
          onClick={handleWhatsApp}
          title="Open in WhatsApp"
          aria-label="Open in WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
      </>
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" className={`gap-1 ${className ?? ""}`} onClick={handleCall}>
        <Smartphone className="h-4 w-4" /> Call
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={`gap-1 text-green-600 hover:text-green-700 ${className ?? ""}`}
        onClick={handleWhatsApp}
      >
        <MessageCircle className="h-4 w-4" /> WhatsApp
      </Button>
    </>
  );
}
