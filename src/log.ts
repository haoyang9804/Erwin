import { config } from "./config";
import { color } from "console-log-colors"

let indent = 0;

export function increase_indent() : void {
  if (config.debug) indent += 2;
}

export function decrease_indent() : void {
  if (config.debug) indent -= 2;
}

export function log(render : "red" | "yellow" | "", text : string) : void {
  if (config.debug) {
    switch (render) {
      case "red":
        console.log(color.redBG(`${" ".repeat(indent)}${text}`));
        break;
      case "yellow":
        console.log(color.yellowBG(`${" ".repeat(indent)}${text}`));
        break;
      default:
        console.log(`${" ".repeat(indent)}${text}`);
    }
  }
}