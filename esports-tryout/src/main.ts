import { Game } from "./game";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("找不到试训界面根节点");

const game = new Game(root);
game.start();
