import { VarianceScanPanel } from "@/components/VarianceScanPanel";

export function ScanPage() {
  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Variance scan</h1>
      </div>
      <VarianceScanPanel storageKey="standalone" />
    </div>
  );
}
