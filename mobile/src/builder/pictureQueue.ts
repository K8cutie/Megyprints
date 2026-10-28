/* ══════════════════════════════════════════════════════════════════════════
   THE ORDER PAGE PICTURES ARE DRAWN IN (usePagePicture).

   One picture is drawn at a time: drawing takes the JS thread for tens of
   milliseconds and holds photo copies of about 5 MB each. Which one next:
     • the most wanted first (priority): the page the customer is editing or
       looking at, before a layout's small picture, before a page drawn
       ahead for a page turn; among equals, the one asked for first;
     • a picture asked for twice while waiting or drawing is drawn once
       (both get it);
     • a picture nobody wants any more (its screen or thumbnail went away
       before it was drawn) is dropped, not drawn: a Change layout sheet
       closed early, or a cover dragged on, leaves no pile of drawings for
       the page on screen to wait behind.
   A picture already being drawn is finished (a drawing can't be stopped
   half way); only waiting ones are dropped.

   Plain logic, no phone: test/pictureQueue.test.ts.
   ══════════════════════════════════════════════════════════════════════════ */

/** What a drawing was dropped with (nobody wanted it any more). */
export class PictureDropped extends Error {
  constructor() {
    super('No longer wanted');
    this.name = 'PictureDropped';
  }
}

export interface PictureTicket<T> {
  promise: Promise<T>;
  /** This asker no longer wants it. Dropped if nobody else does and it has
   *  not started. Safe to call more than once. */
  release(): void;
}

interface Job<T> {
  key: string;
  priority: number;
  seq: number;
  wanted: number;
  started: boolean;
  run: () => Promise<T>;
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

export interface PictureQueue<T> {
  /** Asks for the picture `key` (drawn by `run` if it isn't waiting or
   *  being drawn already). A higher `priority` goes first. */
  request(key: string, run: () => Promise<T>, priority?: number): PictureTicket<T>;
  /** Runs `fn` once the drawing under way (if any) is done, before the next. */
  whenIdle(fn: () => void): void;
  /** Tests: what is waiting, in the order it would be drawn. */
  waiting(): string[];
  /** Tests: the key being drawn, or null. */
  drawing(): string | null;
}

export function createPictureQueue<T>(): PictureQueue<T> {
  const jobs = new Map<string, Job<T>>(); // waiting and drawing, by key
  let current: Job<T> | null = null;
  let seq = 0;
  let idle: (() => void)[] = [];

  const order = (a: Job<T>, b: Job<T>) => b.priority - a.priority || a.seq - b.seq;

  const runIdle = () => {
    const fns = idle;
    idle = [];
    for (const fn of fns) {
      try { fn(); } catch { /* a cleanup that fails changes nothing here */ }
    }
  };

  const pump = () => {
    if (current) return;
    runIdle();
    const next = [...jobs.values()].filter((j) => !j.started).sort(order)[0];
    if (!next) return;
    current = next;
    next.started = true;
    let ran: Promise<T>;
    try {
      ran = next.run();
    } catch (e) {
      ran = Promise.reject(e);
    }
    ran.then(next.resolve, next.reject).finally(() => {
      jobs.delete(next.key);
      current = null;
      pump();
    });
  };

  return {
    request(key, run, priority = 0) {
      let job = jobs.get(key);
      if (job) {
        job.wanted++;
        if (!job.started && priority > job.priority) job.priority = priority;
      } else {
        let resolve!: (v: T) => void;
        let reject!: (e: unknown) => void;
        const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
        // A dropped picture's promise may have no one listening any more.
        promise.catch(() => undefined);
        job = { key, priority, seq: seq++, wanted: 1, started: false, run, promise, resolve, reject };
        jobs.set(key, job);
      }
      const j = job;
      let released = false;
      // Started on the next turn, so asks made in the same render (a screen
      // and its neighbours) are ordered by priority, not by who asked first.
      Promise.resolve().then(pump);
      return {
        promise: j.promise,
        release() {
          if (released) return;
          released = true;
          j.wanted--;
          if (j.wanted <= 0 && !j.started && jobs.get(j.key) === j) {
            jobs.delete(j.key);
            j.reject(new PictureDropped());
          }
        },
      };
    },
    whenIdle(fn) {
      idle.push(fn);
      if (!current) Promise.resolve().then(pump);
    },
    waiting: () => [...jobs.values()].filter((j) => !j.started).sort(order).map((j) => j.key),
    drawing: () => current?.key ?? null,
  };
}
