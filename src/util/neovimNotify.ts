import { workspace } from 'coc.nvim';
import { compactI } from '.';

type NotifierCell = Notifier | void | undefined | null;

export class Notifier {
  static async run(notifierPromise: NotifierCell | Promise<NotifierCell>) {
    if (!notifierPromise) {
      return;
    }
    if ('then' in notifierPromise) {
      const lazy = await notifierPromise;
      if (lazy) {
        return lazy.run();
      }
    } else {
      return notifierPromise.run();
    }
  }

  static notifyAll(lazyNotifies: NotifierCell[]) {
    for (const n of lazyNotifies) {
      if (n) {
        n.notify();
      }
    }
  }

  static async runAll(
    notifierPromises: (NotifierCell | Promise<NotifierCell>)[],
  ) {
    const notifiers = await Promise.all(notifierPromises);
    workspace.nvim.pauseNotification();
    this.notifyAll(notifiers);
    return workspace.nvim.resumeNotification() as Promise<unknown>;
  }

  static combine(notifiers: NotifierCell[]) {
    const safeNotifiers = compactI(notifiers);
    if (safeNotifiers.length < 1) {
      return Notifier.noop();
    }
    if (safeNotifiers.length === 1) {
      return safeNotifiers[0];
    }
    return safeNotifiers.reduce((ret, cur) => ret.concat(cur), Notifier.noop());
  }

  static noop() {
    return this.create(() => {});
  }

  static create(notify: () => void) {
    return new Notifier(notify);
  }

  protected notifyFns: (() => void)[] = [];

  protected constructor(notify: () => void) {
    this.notifyFns.push(notify);
  }

  async run() {
    return Notifier.runAll([this]);
  }

  notify() {
    for (const fn of this.notifyFns) {
      fn();
    }
  }

  concat(notifier: Notifier) {
    this.notifyFns.push(...notifier.notifyFns);
    return this;
  }
}
