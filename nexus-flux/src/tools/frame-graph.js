export class FrameGraph {
  constructor() { this.nodes = new Map(); }
  add(name, { reads = [], writes = [], after = [], run }) {
    if (this.nodes.has(name)) throw new Error(`FRAME_NODE_DUPLICATE:${name}`);
    if (typeof run !== 'function') throw new Error(`FRAME_NODE_NO_RUN:${name}`);
    this.nodes.set(name, { name, reads: [...reads], writes: [...writes], after: [...after], run });
    return this;
  }
  order() {
    const edges = new Map([...this.nodes].map(([name]) => [name, new Set()]));
    for (const node of this.nodes.values()) {
      for (const dependency of node.after) {
        if (!this.nodes.has(dependency)) throw new Error(`FRAME_NODE_MISSING:${dependency}`);
        edges.get(node.name).add(dependency);
      }
      for (const other of this.nodes.values()) {
        if (node === other) continue;
        if (other.writes.some(resource => node.reads.includes(resource) || node.writes.includes(resource))) edges.get(node.name).add(other.name);
      }
    }
    const ordered = []; const temporary = new Set(); const permanent = new Set();
    const visit = name => {
      if (permanent.has(name)) return;
      if (temporary.has(name)) throw new Error(`FRAME_GRAPH_CYCLE:${name}`);
      temporary.add(name);
      for (const dependency of edges.get(name)) visit(dependency);
      temporary.delete(name); permanent.add(name); ordered.push(this.nodes.get(name));
    };
    for (const name of this.nodes.keys()) visit(name);
    return ordered;
  }
  async execute(context) { for (const node of this.order()) await node.run(context); }
}
