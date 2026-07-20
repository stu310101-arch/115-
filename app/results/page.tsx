import { ResultsWorkspace } from "@/components/ResultsWorkspace";
import programsJson from "@/data/programs_115.json";
import type { Program } from "@/lib/types";

export default function ResultsPage() {
  return <ResultsWorkspace programs={programsJson as Program[]} />;
}
