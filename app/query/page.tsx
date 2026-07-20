import { QueryWorkspace } from "@/components/QueryWorkspace";
import programsJson from "@/data/programs_115.json";
import sourcesJson from "@/data/sources_115.json";
import { toProgramOptions } from "@/lib/programSelection";
import type { Program } from "@/lib/types";

type SchoolSource = {
  schoolId: string;
  schoolName: string;
};

export default function QueryPage() {
  const programs = programsJson as Program[];

  return (
    <QueryWorkspace
      programCount={programs.length}
      programOptions={toProgramOptions(programs)}
      schoolSources={sourcesJson as SchoolSource[]}
    />
  );
}
