import pymupdf
import argparse

# Set up command line argument parsing
parser = argparse.ArgumentParser(description="Extract text from PDF file")
parser.add_argument("pdf_file", help="Path to the PDF file to process")
args = parser.parse_args()


def extract_text_from_pdf(pdf_path):
    """Extract text from PDF and return as string"""
    doc = pymupdf.open(pdf_path)  # open a document
    extracted_text = ""

    for page in doc:  # iterate the document pages
        text = page.get_text()  # get plain text
        extracted_text += text
        extracted_text += "\f"  # add page delimiter (form feed)

    doc.close()
    return extracted_text


# Extract text and print it
text_content = extract_text_from_pdf(args.pdf_file)
print(text_content)
