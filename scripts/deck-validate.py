"""Verify deck integrity and optionally build full-resolution WebP display assets.

Requires Pillow. Run: python scripts/deck-validate.py --build-webp --contact-sheets
All original JPEG files and their checksums are preserved.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8-sig"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build-webp", action="store_true")
    parser.add_argument("--contact-sheets", action="store_true")
    args = parser.parse_args()
    catalog = read("data/deck-catalog.json")["cards"]
    deck = read("data/cards.json")
    provenance = read("data/deck-sources.json")
    cards = deck["cards"]
    source_by_id = {entry["cardId"]: entry for entry in provenance["cards"]}
    assert len(cards) == 78 and len(source_by_id) == 78
    assert [c["id"] for c in cards] == [c["cardId"] for c in catalog]
    checksums, checked, total_original, total_web = set(), [], 0, 0
    all_meanings = set()
    for card, original_catalog in zip(cards, catalog):
        card_id = card["id"]
        source = source_by_id[card_id]
        assert card["name"] == original_catalog["nameZh"] == source["name"]
        assert card["nameEn"] == original_catalog["nameEn"] == source["nameEn"]
        original = ROOT / "public/assets/decks/rws" / (card_id + ".jpg")
        data = original.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        assert digest == source["sha256"] and digest not in checksums
        checksums.add(digest)
        assert len(data) == source["bytes"]
        with Image.open(original) as im:
            im.load()  # Decode all pixels, not only the JPEG header.
            assert im.format == "JPEG"
            assert im.size == (source["width"], source["height"])
            assert im.width >= 1000 and im.height >= 1800, (card_id, im.size)
            assert 0.5 < im.width / im.height < 0.65
            if args.build_webp:
                output = original.with_suffix(".webp")
                im.convert("RGB").save(output, "WEBP", quality=84, method=6)
                display_bytes = output.read_bytes()
                card["image"] = "/assets/decks/rws/" + output.name
                source["originalImage"] = "/assets/decks/rws/" + original.name
                source["image"] = card["image"]
                source["displayAsset"] = {
                    "format": "WebP", "width": im.width, "height": im.height,
                    "bytes": len(display_bytes), "sha256": hashlib.sha256(display_bytes).hexdigest(),
                    "modifications": "WebP compression at original dimensions, quality=84. No crop, recoloring or image edits.",
                }
        display = ROOT / "public" / card["image"].lstrip("/")
        with Image.open(display) as im:
            im.load()
            assert im.size == (source["width"], source["height"])
        if "displayAsset" in source:
            assert hashlib.sha256(display.read_bytes()).hexdigest() == source["displayAsset"]["sha256"]
        assert source["license"] == "Public domain"
        for orientation in ("upright", "reversed"):
            value = card[orientation]
            assert len(value["keywords"]) == 3
            assert 45 <= len(value["meaning"]) <= 115
            assert value["meaning"] not in all_meanings
            all_meanings.add(value["meaning"])
        total_original += original.stat().st_size
        total_web += display.stat().st_size
        checked.append({"id": card_id, "image": card["image"], "width": source["width"], "height": source["height"], "decoded": True})
    if args.build_webp:
        (ROOT / "data/cards.json").write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (ROOT / "data/deck-sources.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sheets = []
    if args.contact_sheets:
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 16)
        except OSError:
            font = ImageFont.load_default()
        for group in ("major", "wands", "cups", "swords", "pentacles"):
            subset = [c for c in cards if (c["arcana"] if c["arcana"] == "major" else c["suit"]) == group]
            cols = 6 if group == "major" else 7
            cell_w, cell_h = 184, 345
            sheet = Image.new("RGB", (cols * cell_w, math.ceil(len(subset) / cols) * cell_h), "#ebe7db")
            draw = ImageDraw.Draw(sheet)
            for index, card in enumerate(subset):
                x, y = (index % cols) * cell_w, (index // cols) * cell_h
                with Image.open(ROOT / "public" / card["image"].lstrip("/")) as im:
                    im.thumbnail((172, 296))
                    sheet.paste(im, (x + (cell_w - im.width) // 2, y + 4))
                draw.text((x + 5, y + 301), card["id"], fill="#222222", font=font)
                draw.text((x + 5, y + 322), card["name"], fill="#222222", font=font)
            destination = ROOT / "scripts" / ("deck-contact-" + group + ".jpg")
            sheet.save(destination, quality=88)
            sheets.append(str(destination.relative_to(ROOT)).replace("\\", "/"))
    report = {
        "checkedOn": "2026-10-14", "result": "passed", "cards": len(cards), "meanings": len(all_meanings),
        "originalImagesDecoded": len(checked), "displayImagesDecoded": len(checked),
        "uniqueSourceChecksums": len(checksums), "sourceBytes": total_original, "displayBytes": total_web,
        "checks": ["All canonical IDs, order and bilingual names match catalog", "Every original JPEG fully decodes", "Every display image fully decodes", "All 78 original SHA-256 and byte counts match source manifest", "All originals are at least 1000x1800 pixels", "All source licenses are Public domain", "All 156 meanings are distinct and populated"],
        "contactSheets": sheets, "images": checked,
    }
    (ROOT / "scripts/deck-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "images"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
