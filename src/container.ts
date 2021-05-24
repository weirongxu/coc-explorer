import { ParsedPosition } from './arg/parseArgs';
import { Explorer } from './explorer';

export class TabContainer {
  left?: Explorer;
  right?: Explorer;
  tab?: Explorer;
  floating?: Explorer;

  getExplorer(position: ParsedPosition) {
    return this[position.name];
  }

  setExplorer(position: ParsedPosition, explorer: Explorer) {
    this[position.name] = explorer;
  }

  all() {
    const explorers = [];
    if (this.left) {
      explorers.push(this.left);
    }
    if (this.right) {
      explorers.push(this.right);
    }
    if (this.tab) {
      explorers.push(this.tab);
    }
    if (this.floating) {
      explorers.push(this.floating);
    }
    return explorers;
  }
}
