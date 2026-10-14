"""Reproducibly fetch the 78 original RWS scans and their Commons provenance.

Run with Python 3. Network access is required. Existing verified images are reused.
This intentionally downloads the original file rather than a thumbnail.
"""
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "TarotAtelierAssetResearch/1.0 (local public-domain deck prototype)"}
CATEGORY = "Category:Rider-Waite-Smith tarot deck (TaionWC)"


def get(url):
    for attempt in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=75) as response:
                return response.read()
        except Exception as error:
            if attempt == 7:
                raise
            delay = min(55, 10 * (attempt + 1)) if isinstance(error, urllib.error.HTTPError) and error.code == 429 else 2 * (attempt + 1)
            print(f"Retry after {delay}s: {type(error).__name__}", flush=True)
            time.sleep(delay)


def query(**params):
    return json.loads(get(API + "?" + urllib.parse.urlencode({"format": "json", "action": "query", **params})))


def plain(value):
    return html.unescape(re.sub(r"<[^>]*>", "", value or "")).strip()


def main():
    catalog = json.loads((ROOT / "data/deck-catalog.json").read_text(encoding="utf-8-sig"))["cards"]
    members = query(list="categorymembers", cmtitle=CATEGORY, cmlimit=500, cmtype="file")["query"]["categorymembers"]
    titles = [m["title"] for m in members]
    assert len(titles) == 78, "Unexpected Commons category contents; inspect before proceeding."
    by_key = {}
    for title in titles:
        match = re.search(r"RWS Tarot (\d{2}) ", title)
        if match:
            by_key["major-" + match[1]] = title
        else:
            match = re.fullmatch(r"File:(Cups|Pents|Wands|Swords)(\d{2})\.jpg", title)
            suit = {"Cups": "cups", "Pents": "pentacles", "Wands": "wands", "Swords": "swords"}[match[1]]
            rank = {"01": "ace", "11": "page", "12": "knight", "13": "queen", "14": "king"}.get(match[2], match[2])
            by_key[suit + "-" + rank] = title
    assert set(by_key) == {c["cardId"] for c in catalog}, "Card ID mapping is incomplete."
    pages = {}
    for start in range(0, len(titles), 25):
        response = query(titles="|".join(titles[start:start + 25]), prop="imageinfo", iiprop="url|extmetadata|size|sha1|timestamp", iilimit=1)
        pages.update({p["title"]: p for p in response["query"]["pages"].values()})
    output = ROOT / "public/assets/decks/rws"
    output.mkdir(parents=True, exist_ok=True)

    def fetch(card):
        title = by_key[card["cardId"]]
        info = pages[title]["imageinfo"][0]
        meta = info["extmetadata"]
        license_name = plain(meta.get("LicenseShortName", {}).get("value"))
        assert license_name == "Public domain", (title, license_name)
        assert "Pamela Colman Smith" in plain(meta.get("Artist", {}).get("value")), title
        path = output / (card["cardId"] + ".jpg")
        source_url = info["url"].split("?")[0]
        if path.exists():
            data = path.read_bytes()
        else:
            time.sleep(2)
            data = get(source_url)
        assert len(data) == info["size"], f"Unexpected download size: {title}"
        # MediaWiki sha1 is hexadecimal here; byte length alone is not enough.
        assert hashlib.sha1(data).hexdigest() == info["sha1"], f"Source checksum mismatch: {title}"
        if not path.exists():
            path.write_bytes(data)
        print(card["cardId"], info["width"], info["height"], len(data), flush=True)
        return {
            "cardId": card["cardId"], "name": card["nameZh"], "nameEn": card["nameEn"],
            "image": "/assets/decks/rws/" + path.name,
            "source": info["descriptionurl"], "sourceFile": source_url, "sourceTitle": title,
            "commonsPageId": pages[title]["pageid"],
            "artist": plain(meta["Artist"]["value"]),
            "artworkDate": plain(meta.get("DateTimeOriginal", {}).get("value")),
            "credit": plain(meta.get("Credit", {}).get("value")),
            "description": plain(meta.get("ImageDescription", {}).get("value")),
            "license": license_name, "licenseCode": meta.get("License", {}).get("value"),
            "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
            "sourceLicenseCategories": plain(meta.get("Categories", {}).get("value")),
            "attributionRequiredBySource": meta.get("AttributionRequired", {}).get("value") == "true",
            "downloadedOn": "2026-10-14", "sourceRevisionTimestamp": info["timestamp"],
            "width": info["width"], "height": info["height"], "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "sourceSha1": info["sha1"],
            "modifications": "None; original uploaded JPEG bytes retained."
        }

    sources = [fetch(card) for card in catalog]
    manifest = {
        "deckId": "rws-classic", "version": "1", "checkedOn": "2026-10-14",
        "sourceCollection": "https://commons.wikimedia.org/wiki/Category:Rider-Waite-Smith_tarot_deck_(TaionWC)",
        "artist": "Pamela Colman Smith (1878–1951)", "system": "Rider–Waite–Smith; A. E. Waite",
        "licenseSummary": "Wikimedia Commons marks all 78 original artwork scans Public domain (PD-old-80-expired). Original source bytes are retained; no modern recoloring or third-party card descriptions are bundled.",
        "territoryNote": "Commons identifies the artwork as public domain in the United States and countries with copyright terms of life plus 80 years or fewer. This is source metadata, not a worldwide rights guarantee; review the intended sales territory before commercial distribution.",
        "cards": sources,
    }
    (ROOT / "data/deck-sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Saved 78 originals and source records.", flush=True)


if __name__ == "__main__":
    main()
