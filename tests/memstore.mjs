// In-memory stand-in for a Netlify Blobs store (same methods as used by netlify/lib/store.mjs).
export class MemStore {
  constructor() { this.data = new Map(); this.ops = { get: 0, set: 0, list: 0, delete: 0 }; }
  async get(key, opts = {}) {
    this.ops.get++;
    if (!this.data.has(key)) return null;
    const raw = this.data.get(key);
    return opts.type === "json" ? JSON.parse(raw) : raw;
  }
  async setJSON(key, value) { this.ops.set++; this.data.set(key, JSON.stringify(value)); }
  async set(key, value) { this.ops.set++; this.data.set(key, String(value)); }
  async delete(key) { this.ops.delete++; this.data.delete(key); }
  async list({ prefix = "" } = {}) {
    this.ops.list++;
    const blobs = [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key, etag: "x" }));
    return { blobs, directories: [] };
  }
}
