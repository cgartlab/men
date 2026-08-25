import { ultrawork } from "./ultrawork.js";
import { verify } from "./verify.js";
import { hyperplan } from "./hyperplan.js";
export const allCommands = [ultrawork, verify, hyperplan];
export function getCommand(name) {
    return allCommands.find((c) => c.name === name);
}
//# sourceMappingURL=register.js.map