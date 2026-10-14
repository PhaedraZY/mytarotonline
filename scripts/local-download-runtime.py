"""Install official Ollama Windows x64 portable runtime on this E-drive project.

Downloads official ZIP byte ranges in parallel. The NVIDIA CUDA 13, Vulkan and
CPU binaries are included; the unused CUDA 12 duplicate is omitted. ZIP entry
CRC checks run while extracting. Nothing is installed globally.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import json
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = "v0.40.4"
URL = f"https://github.com/ollama/ollama/releases/download/{VERSION}/ollama-windows-amd64.zip"
DOWNLOADS = ROOT / ".runtime" / "downloads"
DESTINATION = ROOT / ".runtime" / "ollama"
DOWNLOADS.mkdir(parents=True, exist_ok=True)
DESTINATION.mkdir(parents=True, exist_ok=True)
PARTS = DOWNLOADS / "runtime-parts"
PARTS.mkdir(exist_ok=True)


def fetch(start, end):
    expected = end - start + 1
    part = PARTS / f"{start}-{end}.part"
    if part.exists() and part.stat().st_size == expected:
        return part
    for attempt in range(5):
        try:
            request = urllib.request.Request(URL, headers={"Range": f"bytes={start}-{end}", "User-Agent": "tarot-atelier-local-model"})
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {start}-{end}/"):
                    raise RuntimeError("Server did not honor requested byte range")
                data = response.read()
            if len(data) != expected:
                raise RuntimeError("Incomplete download chunk")
            part.write_bytes(data)
            return part
        except Exception:
            if attempt == 4:
                raise
            time.sleep(min(2 ** attempt, 8))


def main():
    started = time.monotonic()
    install_record = DESTINATION / "portable-install.json"
    if install_record.exists() and (DESTINATION / "ollama.exe").exists():
        record = json.loads(install_record.read_text(encoding="utf-8"))
        if record.get("version") == VERSION:
            print(f"Ollama {VERSION} already installed at {DESTINATION}; existing runtime left in place.", flush=True)
            return
    release_url = f"https://api.github.com/repos/ollama/ollama/releases/tags/{VERSION}"
    with urllib.request.urlopen(release_url, timeout=30) as r:
        release = json.load(r)
    asset = next(a for a in release["assets"] if a["name"] == "ollama-windows-amd64.zip")
    size = asset["size"]
    tail_size = min(1024 * 1024, size)
    tail = fetch(size - tail_size, size - 1)
    sparse_zip = DOWNLOADS / f"ollama-{VERSION}-selected.zip"
    with sparse_zip.open("wb") as f:
        f.seek(size - tail_size)
        f.write(tail.read_bytes())
    with zipfile.ZipFile(sparse_zip) as z:
        entries = [i for i in z.infolist() if not i.filename.startswith("lib/ollama/cuda_v12/")]
    # Coalesce adjacent local records so parallel transfer also covers headers.
    with zipfile.ZipFile(sparse_zip) as z:
        all_entries = sorted(z.infolist(), key=lambda i: i.header_offset)
        central_offset = z.start_dir
    selected_names = {i.filename for i in entries}
    ranges = []
    for n, info in enumerate(all_entries):
        if info.filename not in selected_names:
            continue
        end = (all_entries[n + 1].header_offset if n + 1 < len(all_entries) else central_offset) - 1
        if ranges and ranges[-1][1] + 1 == info.header_offset:
            ranges[-1] = (ranges[-1][0], end)
        else:
            ranges.append((info.header_offset, end))
    chunk_size = 2 * 1024 * 1024
    chunks = [(start, min(start + chunk_size - 1, end)) for begin, end in ranges for start in range(begin, end + 1, chunk_size)]
    total = sum(end - start + 1 for start, end in chunks)
    complete = 0
    print(f"Official Ollama {VERSION}: downloading {total / 1e6:.1f} MB (CUDA 13 + Vulkan + CPU)", flush=True)
    with ThreadPoolExecutor(max_workers=24) as pool, sparse_zip.open("r+b") as archive:
        pending = {pool.submit(fetch, start, end): (start, end) for start, end in chunks}
        last_report = time.monotonic()
        for future in as_completed(pending):
            start, end = pending[future]
            part = future.result()
            archive.seek(start)
            archive.write(part.read_bytes())
            complete += end - start + 1
            if time.monotonic() - last_report >= 10 or complete == total:
                print(f"{complete / 1e6:.1f}/{total / 1e6:.1f} MB ({complete / total:.1%}), {time.monotonic() - started:.0f}s", flush=True)
                last_report = time.monotonic()
    with zipfile.ZipFile(sparse_zip) as z:
        for info in entries:
            target = (DESTINATION / info.filename).resolve()
            if DESTINATION.resolve() not in target.parents and target != DESTINATION.resolve():
                raise RuntimeError("Unsafe archive member path")
            z.extract(info, DESTINATION)
    (DESTINATION / "portable-install.json").write_text(json.dumps({"source": URL, "version": VERSION, "asset_digest": asset.get("digest"), "components": ["CUDA 13", "Vulkan", "CPU"], "omitted": ["CUDA 12 duplicate"], "integrity": "HTTPS official GitHub asset plus ZIP CRC for each extracted entry", "installedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Installed {DESTINATION} in {time.monotonic() - started:.1f}s", flush=True)


if __name__ == "__main__":
    main()
