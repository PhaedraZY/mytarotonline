import fs from 'node:fs/promises';
import path from 'node:path';

export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return structuredClone(fallback); throw error; }
}

export class Store {
  constructor(directory) { this.directory = directory; this.queue = Promise.resolve(); }
  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    this.settings = await readJson(path.join(this.directory, 'settings.json'), { provider: null, providers: {} });
    this.readings = await readJson(path.join(this.directory, 'readings.json'), []);
    this.overrides = await readJson(path.join(this.directory, 'deck-overrides.json'), {});
    for (const reading of this.readings) if (reading.status === 'interpreting') {
      reading.status = 'drawn';
      reading.lastError = '上次解读被中断，牌面已保留，可以重试。';
    }
    return this;
  }
  save(name, value) {
    const data = JSON.stringify(value, null, 2);
    const file = path.join(this.directory, `${name}.json`);
    const task = this.queue.then(async () => {
      await fs.writeFile(`${file}.tmp`, data, { mode: 0o600 });
      await fs.rename(`${file}.tmp`, file);
    });
    this.queue = task.catch(() => {});
    return task;
  }
  saveReadings() { return this.save('readings', this.readings); }
  saveSettings() { return this.save('settings', this.settings); }
  saveOverrides() { return this.save('deck-overrides', this.overrides); }
  getReading(id) { return this.readings.find(r => r.id === id); }
}
