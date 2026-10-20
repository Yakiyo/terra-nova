/* Least-recently-used values, with explicit ownership of disposable resources. */
export class BoundedCache {
  constructor(limit, dispose = () => {}) {
    this.limit = limit;
    this.dispose = dispose;
    this.values = new Map();
  }
  has(key) { return this.values.has(key); }
  get(key) {
    if (!this.values.has(key)) return undefined;
    const value = this.values.get(key);
    this.values.delete(key);
    this.values.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.values.has(key) && this.values.get(key) !== value) this.dispose(this.values.get(key));
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next().value;
      this.dispose(this.values.get(oldest));
      this.values.delete(oldest);
    }
  }
  clear() {
    this.values.forEach(value => this.dispose(value));
    this.values.clear();
  }
}
