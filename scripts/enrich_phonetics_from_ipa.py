from __future__ import annotations

import argparse
from pathlib import Path


def load_ipa_dict(path: Path) -> dict[str, str]:
    ipa_map: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or "\t" not in line:
            continue
        word, ipa = line.split("\t", 1)
        key = word.strip().lower()
        value = ipa.strip()
        if not key or not value or key in ipa_map:
            continue
        ipa_map[key] = value if value.startswith("/") else f"/{value}/"
    return ipa_map


def enrich_vocab_text(vocab_text: str, ipa_map: dict[str, str], overwrite: bool = False) -> tuple[str, int]:
    output_lines: list[str] = []
    updated = 0

    for raw_line in vocab_text.splitlines():
        line = raw_line.rstrip("\n")
        if not line.strip():
            output_lines.append(line)
            continue

        parts = line.split("\t")
        word = parts[0].strip() if parts else ""
        if not word:
            output_lines.append(line)
            continue

        key = word.lower()
        resolved_ipa = ipa_map.get(key)
        if not resolved_ipa:
            output_lines.append(line)
            continue

        if len(parts) >= 3:
            current_ipa = parts[1].strip()
            if current_ipa and not overwrite:
                output_lines.append(line)
                continue
            rebuilt = [parts[0].strip(), resolved_ipa, "\t".join(parts[2:]).strip()]
            output_lines.append("\t".join(rebuilt))
            updated += 1
            continue

        if len(parts) >= 2:
            meaning = "\t".join(parts[1:]).strip()
            output_lines.append(f"{word}\t{resolved_ipa}\t{meaning}")
            updated += 1
            continue

        output_lines.append(line)

    return "\n".join(output_lines) + "\n", updated


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Merge IPA data from open-dict-data/ipa-dict into local vocabulary txt files."
    )
    parser.add_argument("ipa_file", type=Path, help="Path to ipa-dict en_US.txt")
    parser.add_argument("vocab_files", nargs="+", type=Path, help="One or more local vocab txt files")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing phonetic column values")
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Write changes back to the original files. Default outputs <name>.phonetic.txt",
    )
    args = parser.parse_args()

    ipa_map = load_ipa_dict(args.ipa_file)
    if not ipa_map:
        raise SystemExit("IPA dictionary is empty or unreadable.")

    for vocab_file in args.vocab_files:
        original = vocab_file.read_text(encoding="utf-8")
        enriched_text, updated = enrich_vocab_text(original, ipa_map, overwrite=args.overwrite)
        target = vocab_file if args.in_place else vocab_file.with_suffix(".phonetic.txt")
        target.write_text(enriched_text, encoding="utf-8")
        print(f"{vocab_file.name}: updated {updated} entries -> {target.name}")


if __name__ == "__main__":
    main()
