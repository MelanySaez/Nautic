from pdf2image import convert_from_path

# Path to your PDF file
pdf_path = "data/0_landing/lsa.pdf"

# Convert PDF to a list of PIL Image objects
pages = convert_from_path(pdf_path)

# Save each page as an image
for i, page in enumerate(pages):
    image_path = f"data/1_raw/page_{i+1}.png"
    page.save(image_path, "PNG")
    print(f"Saved {image_path}")
