export class StateRecorder {
  constructor({ capacity = 60, clone = value => structuredClone(value) } = {}) { this.capacity = capacity; this.clone = clone; this.items = []; this.cursor = -1; }
  push(state, meta = {}) {
    if (this.cursor < this.items.length - 1) this.items.splice(this.cursor + 1);
    this.items.push({ state: this.clone(state), meta: { ...meta }, time: Date.now() });
    if (this.items.length > this.capacity) this.items.shift();
    this.cursor = this.items.length - 1; return this.current();
  }
  current() { return this.cursor >= 0 ? this.clone(this.items[this.cursor]) : null; }
  undo() { if (this.cursor <= 0) return null; this.cursor -= 1; return this.current(); }
  redo() { if (this.cursor >= this.items.length - 1) return null; this.cursor += 1; return this.current(); }
  export() { return { schema: 'nexus.flux.timeline.v1', cursor: this.cursor, items: this.clone(this.items) }; }
}
