"""Render slides/virtual-threads-measured.pptx into what the site's Slides tab embeds:
   slides/img/slide-NN.webp  (1280x720, one per slide)
   slides/notes.json         ([{"n", "title", "notes"}] per slide)

Needs LibreOffice (soffice) and pdftoppm on PATH, plus Pillow and python-pptx.
Run after rebuilding the deck (node slides/build_deck.js), then run build.py.
"""
import json, pathlib, shutil, subprocess, sys, tempfile
from PIL import Image
from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER

HERE = pathlib.Path(__file__).resolve().parent
DECK = HERE / "virtual-threads-measured.pptx"
IMG = HERE / "img"


def soffice():
    for name in ("soffice", "soffice.exe", "libreoffice"):
        p = shutil.which(name)
        if p:
            return p
    sys.exit("LibreOffice (soffice) not found on PATH")


def main():
    """Optional argument: an existing PDF export of the deck (e.g. saved from PowerPoint), to skip LibreOffice."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        if len(sys.argv) > 1:
            pdf = pathlib.Path(sys.argv[1]).resolve()
        else:
            subprocess.run([soffice(), "--headless", "--convert-to", "pdf", "--outdir", str(tmp), str(DECK)], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            pdf = tmp / (DECK.stem + ".pdf")
        subprocess.run(["pdftoppm", "-png", "-r", "120", str(pdf), str(tmp / "s")], check=True)
        if IMG.exists():
            for old in IMG.glob("slide-*.webp"):
                old.unlink()
        IMG.mkdir(exist_ok=True)
        pngs = sorted(tmp.glob("s-*.png"))
        for i, png in enumerate(pngs, 1):
            im = Image.open(png).convert("RGB").resize((1280, 720), Image.LANCZOS)
            im.save(IMG / f"slide-{i:02d}.webp", "WEBP", quality=72, method=6)

    notes = []
    for i, slide in enumerate(Presentation(str(DECK)).slides, 1):
        titles = [sh for sh in slide.placeholders if sh.placeholder_format.type in (PP_PLACEHOLDER.TITLE, PP_PLACEHOLDER.CENTER_TITLE)]
        title = titles[0].text_frame.text if titles else ""
        text = slide.notes_slide.notes_text_frame.text if slide.has_notes_slide else ""
        notes.append({"n": i, "title": " ".join(title.split()), "notes": text.strip()})
    (HERE / "notes.json").write_text(json.dumps(notes, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    if len(notes) != len(pngs):
        sys.exit(f"slide count mismatch: {len(notes)} slides, {len(pngs)} images")
    print(f"rendered {len(pngs)} slides to {IMG} and notes.json")


if __name__ == "__main__":
    main()
