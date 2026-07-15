import programLearningGroupIds from "../data/program_learning_group_ids_114.json";
import type { Program } from "./types";

export {
  isLearningGroupId,
  LEARNING_GROUP_OPTIONS,
  type LearningGroupId,
} from "./learningGroupCatalog";
import type { LearningGroupId } from "./learningGroupCatalog";

const PROGRAM_LEARNING_GROUPS = programLearningGroupIds as Record<
  string,
  LearningGroupId[]
>;

/** 依 ColleGo! 官方學群、學類及對應校系資料回傳校系的十八學群歸屬。 */
export function learningGroupIdsFor(
  program: Pick<Program, "programCode">,
): LearningGroupId[] {
  return [...(PROGRAM_LEARNING_GROUPS[program.programCode] ?? [])];
}

export function matchesLearningGroupIds(
  available: readonly LearningGroupId[],
  selected: readonly LearningGroupId[] = [],
): boolean {
  return selected.length === 0 || selected.some((id) => available.includes(id));
}

export function matchesLearningGroups(
  program: Pick<Program, "programCode">,
  selected: readonly LearningGroupId[] = [],
): boolean {
  return matchesLearningGroupIds(learningGroupIdsFor(program), selected);
}
