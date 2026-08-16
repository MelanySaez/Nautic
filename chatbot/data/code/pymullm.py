import pathlib
import pymupdf4llm
import sys
import os


def main():
    # Check if PDF file name is provided as argument
    if len(sys.argv) != 2:
        # print("Usage: python pymullm.py <pdf_filename>")
        # print("Example: python pymullm.py document.pdf")
        sys.exit(1)

    pdf_filename = sys.argv[1]
    output_file = f"./data/0_landing/{pdf_filename}"  # Output JSON file

    # Check if the PDF file exists
    if not os.path.exists(output_file):
        print(f"Error: File '{output_file}' not found.")
        sys.exit(1)

    try:
        # Convert PDF to markdown with page chunks for metadata
        # print(f"Converting '{pdf_filename}' to markdown...")
        page_chunks = pymupdf4llm.to_markdown(output_file, page_chunks=True)

        # Print each page with its metadata
        for page_data in page_chunks:
            # print(f"<Page> {counter} <Page>")
            # print(page_data)
            current_page = page_data["metadata"]["page"]
            text = page_data["text"]

            print(f"<Document Page> {current_page} <Document Page>")
            print(text)
            # print("-" * 30)

    except Exception as e:
        print(f"Error converting PDF: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
