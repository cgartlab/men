/**
 * opencode-men — 技能加载器
 *
 * 从 src/skills 下各子目录的 SKILL.md 加载技能定义。
 * 技能保持 .md 格式（社区贡献门槛低），代码只负责加载和注册。
 */
import type { SkillDef } from "../types.js";
/**
 * 扫描 skills 目录，加载所有 SKILL.md
 */
export declare function loadSkills(): SkillDef[];
/**
 * 获取技能的完整 prompt 内容
 */
export declare function getSkillPrompt(skillId: string): string;
//# sourceMappingURL=index.d.ts.map