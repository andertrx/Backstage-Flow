import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn.ts";

type Tone = "error" | "success" | "info";

const tones: Record<Tone, { box: string; icon: typeof Info }> = {
  error: { box: "bg-red-50 text-red-800 ring-red-200", icon: AlertCircle },
  success: { box: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: CheckCircle2 },
  info: { box: "bg-sky-50 text-sky-800 ring-sky-200", icon: Info },
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-2 rounded-lg p-3 text-sm ring-1 ring-inset", box)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
