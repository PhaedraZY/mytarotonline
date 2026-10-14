"""Download Qwen from the official Ollama registry into the project model store.

Downloads are resumable, each blob is SHA-256 verified before installation,
and the manifest is made visible only after every referenced blob is present.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import hashlib
import json
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / ".models"
PARTS = ROOT / ".runtime" / "downloads" / "model-parts"
MODEL = "qwen3.5"
TAG = "9b"
BASE = f"https://registry.ollama.ai/v2/library/{MODEL}"
for directory in [STORE / "blobs", PARTS]:
    directory.mkdir(parents=True, exist_ok=True)


def read_request(url, headers=None):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=90)


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while data := stream.read(8 * 1024 * 1024):
            digest.update(data)
    return digest.hexdigest()


def download_blob(info):
    digest = info["digest"]
    expected_hash = digest.split(":", 1)[1]
    size = info["size"]
    destination = STORE / "blobs" / digest.replace(":", "-")
    if destination.exists() and destination.stat().st_size == size and checksum(destination) == expected_hash:
        print(f"Verified existing {expected_hash[:12]} ({size / 1e6:.1f} MB)", flush=True)
        return
    original_url = f"{BASE}/blobs/{digest}"
    if size < 1024 * 1024:
        with read_request(original_url) as response:
            data = response.read()
        if len(data) != size or hashlib.sha256(data).hexdigest() != expected_hash:
            raise RuntimeError("Small blob failed integrity check")
        destination.write_bytes(data)
        return
    with read_request(original_url, {"Range": "bytes=0-0"}) as response:
        resolved_url = response.url
        response.read()
    chunk_size = 8 * 1024 * 1024
    chunks = [(start, min(start + chunk_size - 1, size - 1)) for start in range(0, size, chunk_size)]

    def fetch(bounds):
        start, end = bounds
        expected_size = end - start + 1
        part = PARTS / f"{expected_hash}-{start}-{end}.part"
        if part.exists() and part.stat().st_size == expected_size:
            return part
        for attempt in range(5):
            try:
                with read_request(resolved_url if attempt < 3 else original_url, {"Range": f"bytes={start}-{end}"}) as response:
                    if response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {start}-{end}/"):
                        raise RuntimeError("Server ignored range")
                    data = response.read()
                if len(data) != expected_size:
                    raise RuntimeError("Incomplete model chunk")
                temporary = part.with_suffix(".incomplete")
                temporary.write_bytes(data)
                temporary.replace(part)
                return part
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(min(2 ** attempt, 8))

    started = time.monotonic()
    done = 0
    print(f"Downloading {expected_hash[:12]}: {size / 1e9:.2f} GB from official Ollama registry", flush=True)
    with ThreadPoolExecutor(max_workers=48) as pool:
        futures = {pool.submit(fetch, bounds): bounds for bounds in chunks}
        last_report = time.monotonic()
        for future in as_completed(futures):
            future.result()
            start, end = futures[future]
            done += end - start + 1
            if time.monotonic() - last_report >= 15 or done == size:
                print(f"{expected_hash[:12]} {done / 1e6:.1f}/{size / 1e6:.1f} MB ({done / size:.1%}), {time.monotonic() - started:.0f}s", flush=True)
                last_report = time.monotonic()
    temporary = destination.with_suffix(".incomplete")
    hasher = hashlib.sha256()
    with temporary.open("wb") as output:
        for start, end in chunks:
            part = PARTS / f"{expected_hash}-{start}-{end}.part"
            data = part.read_bytes()
            hasher.update(data)
            output.write(data)
    if hasher.hexdigest() != expected_hash:
        raise RuntimeError(f"SHA-256 verification failed for {digest}; manifest not installed")
    temporary.replace(destination)
    for start, end in chunks:
        (PARTS / f"{expected_hash}-{start}-{end}.part").unlink()
    print(f"SHA-256 verified {expected_hash[:12]}", flush=True)


def main():
    started = time.monotonic()
    with read_request(f"{BASE}/manifests/{TAG}") as response:
        manifest_bytes = response.read()
    manifest = json.loads(manifest_bytes)
    for blob in sorted([manifest["config"], *manifest["layers"]], key=lambda item: item["size"], reverse=True):
        download_blob(blob)
    destination = STORE / "manifests" / "registry.ollama.ai" / "library" / MODEL / TAG
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(manifest_bytes)
    print(f"Installed {MODEL}:{TAG}; all SHA-256 digests verified; elapsed {time.monotonic() - started:.1f}s", flush=True)


if __name__ == "__main__":
    main()
