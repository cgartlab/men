/**
 * opencode-men — OpenCode Plugin 入口
 *
 * 薄适配层：注册 agents/commands/skills 到 OpenCode Plugin API。
 * 核心逻辑在 core/，此文件只负责 adapter。
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allAgents } from "./agents/register.js";
import { allCommands } from "./commands/register.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
function loadSkillPrompt(skillPath) {
    const skillFile = join(skillPath, "SKILL.md");
    if (!existsSync(skillFile))
        return "";
    return readFileSync(skillFile, "utf-8");
}
export default function menPlugin() {
    return {
        name: "opencode-men",
        version: "0.3.0",
        async setup(api) {
            console.log("[opencode-men] Plugin loaded");
            // Register agents
            for (const agent of allAgents) {
                api.agents?.register?.({
                    id: agent.id,
                    name: agent.name,
                    description: agent.description,
                    mode: agent.mode,
                    model: agent.model,
                    instructions: agent.prompt,
                });
                console.log(`[opencode-men] Agent registered: ${agent.id}`);
            }
            // Register commands
            for (const cmd of allCommands) {
                api.commands?.register?.({
                    name: cmd.name,
                    description: cmd.description,
                    agent: cmd.agent,
                    prompt: cmd.prompt,
                });
                console.log(`[opencode-men] Command registered: ${cmd.name}`);
            }
            // Register skills (load SKILL.md from src/skills/)
            const skillsDir = join(__dirname, "skills");
            if (existsSync(skillsDir)) {
                const { readdirSync } = await import("node:fs");
                const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
                    .filter((d) => d.isDirectory())
                    .map((d) => d.name);
                for (const skillName of skillDirs) {
                    const skillPath = join(skillsDir, skillName);
                    const prompt = loadSkillPrompt(skillPath);
                    if (prompt) {
                        api.skills?.register?.({
                            id: skillName,
                            name: skillName,
                            prompt,
                        });
                        console.log(`[opencode-men] Skill registered: ${skillName}`);
                    }
                }
            }
            console.log("[opencode-men] Setup complete");
        },
    };
}
//# sourceMappingURL=plugin.js.map