/**
 * opencode-men — 技能加载器
 *
 * 从 src/skills 下各子目录的 SKILL.md 加载技能定义。
 * 技能保持 .md 格式（社区贡献门槛低），代码只负责加载和注册。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillDef } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname);

/**
 * 扫描 skills 目录，加载所有 SKILL.md
 */
export function loadSkills(): SkillDef[] {
  const skills: SkillDef[] = [];

  if (!existsSync(SKILLS_DIR)) return skills;

  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const skillPath = join(SKILLS_DIR, entry.name);
    const skillFile = join(skillPath, "SKILL.md");

    if (!existsSync(skillFile)) continue;

    try {
      const raw = readFileSync(skillFile, "utf-8");
      const { name, description } = parseSkillMeta(raw);
      skills.push({
        id: entry.name,
        name: name || entry.name,
        description: description || "",
        path: skillPath,
      });
    } catch (e) {
      console.error(`[opencode-men] Failed to load skill ${entry.name}:`, e);
    }
  }

  return skills;
}

/**
 * 解析 SKILL.md 的 frontmatter + 首行描述
 */
function parseSkillMeta(raw: string): { name: string; description: string } {
  let name = "";
  let description = "";

  // Try YAML frontmatter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
  }

  // Fallback: first non-empty, non-heading line
  if (!description) {
    const lines = raw.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      if (line.startsWith("#")) continue;
      if (line.startsWith("---")) continue;
      description = line.trim().slice(0, 200);
      break;
    }
  }

  return { name, description };
}

/**
 * 获取技能的完整 prompt 内容
 */
export function getSkillPrompt(skillId: string): string {
  const skillFile = join(SKILLS_DIR, skillId, "SKILL.md");
  if (!existsSync(skillFile)) return "";
  return readFileSync(skillFile, "utf-8");
}
