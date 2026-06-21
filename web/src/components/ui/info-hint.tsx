import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Info icon + tooltip shown next to a field label (mirrors the Compliance
// Circle organization-profile pattern). The icon animates on hover/focus: a
// one-shot "pop" plus a colour shift, while the tooltip itself fades/zooms in.
export function InfoHint({
  text,
  className,
  side = "top",
}: {
  text: React.ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label="More information"
          className={cn(
            "group inline-flex size-4 cursor-help items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
        >
          <Info className="size-3.5 transition-transform duration-200 ease-out group-hover:animate-info-pop group-focus-visible:animate-info-pop" />
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
