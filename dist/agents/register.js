import { men } from "./men.js";
import { ji } from "./ji.js";
import { chi } from "./chi.js";
import { si } from "./si.js";
import { xun } from "./xun.js";
import { yi } from "./yi.js";
export const allAgents = [men, ji, chi, si, xun, yi];
export function getAgent(id) {
    return allAgents.find((a) => a.id === id);
}
//# sourceMappingURL=register.js.map