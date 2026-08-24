import { cosmiconfigSync } from "cosmiconfig";
const explorer = cosmiconfigSync("app");
export function load() {
  return explorer.search()?.config ?? {};
}
