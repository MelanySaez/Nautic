#!/usr/bin/env python3
import argparse
import time
from transformers import MarianMTModel, MarianTokenizer


def translate_text(text):
    """Translate text from English to Spanish using Helsinki-NLP model."""
    model_name = "Helsinki-NLP/opus-mt-tc-big-en-es"
    tokenizer = MarianTokenizer.from_pretrained(model_name)
    model = MarianMTModel.from_pretrained(model_name)

    src_text = [text]
    translated = model.generate(
        **tokenizer(src_text, return_tensors="pt", padding=True)
    )

    for t in translated:
        return tokenizer.decode(t, skip_special_tokens=True)


def main():
    parser = argparse.ArgumentParser(description="Translate English text to Spanish")
    parser.add_argument("text", help="Text to translate from English to Spanish")
    parser.add_argument(
        "--model",
        default="Helsinki-NLP/opus-mt-tc-big-en-es",
        help="Translation model to use (default: Helsinki-NLP/opus-mt-tc-big-en-es)",
    )
    parser.add_argument(
        "--show-time",
        action="store_true",
        help="Show the time taken for translation",
    )

    args = parser.parse_args()

    try:
        start_time = time.time()
        translated_text = translate_text(args.text)
        end_time = time.time()

        print(translated_text)

        if args.show_time:
            execution_time = end_time - start_time
            print(
                f"\nTranslation completed in {execution_time:.4f} seconds",
                file=sys.stderr,
            )

    except Exception as e:
        print(f"Error during translation: {e}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
