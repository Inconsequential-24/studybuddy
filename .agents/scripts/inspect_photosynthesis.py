from pathlib import Path
import fitz

source = Path("attached_assets/Photosynthesis-_Phase_1_1791541182188.pdf")
output = Path(".agents/outputs/photosynthesis")
output.mkdir(parents=True, exist_ok=True)
with fitz.open(source) as document:
    print(f"Pages: {len(document)}")
    for index in (0, 1, 4):
        page = document[index]
        page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(output / f"page-{index + 1}.png")
        print(f"Page {index + 1}: {len(page.get_text())} text characters, {len(page.get_images())} images")
