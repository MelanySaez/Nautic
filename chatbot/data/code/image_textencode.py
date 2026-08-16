import os
import json
import base64
from typing import List, Dict, Any


def encode_image_to_base64(image_path: str) -> str:
    """Encode an image file to base64 string."""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def get_image_files(folder_path: str) -> List[str]:
    """Get all image files from a folder."""
    image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"}
    image_files = []

    if not os.path.exists(folder_path):
        print(f"Folder {folder_path} does not exist")
        return image_files

    for filename in os.listdir(folder_path):
        if any(filename.lower().endswith(ext) for ext in image_extensions):
            image_files.append(os.path.join(folder_path, filename))

    return sorted(image_files)


def create_vision_json(
    folder_path: str,
    text_prompt: str = "What is in this image?",
    model: str = "mistralai/pixtral-12b",
) -> Dict[str, Any]:
    """
    Create a JSON payload for vision model API from images in a folder.

    Args:
        folder_path: Path to folder containing images
        text_prompt: Text prompt to send with images
        model: Model name to use

    Returns:
        Dictionary with the API payload format
    """
    image_paths = get_image_files(folder_path)

    if not image_paths:
        print(f"No image files found in {folder_path}")
        return {}

    # Build the content list: text prompt + all images
    content = [{"type": "text", "text": text_prompt}]

    # Add each image as a separate content item
    for image_path in image_paths:
        try:
            base64_image = encode_image_to_base64(image_path)

            # Detect image format from file extension
            _, ext = os.path.splitext(image_path)
            image_format = ext.lower().replace(".", "")
            if image_format == "jpg":
                image_format = "jpeg"

            data_url = f"data:image/{image_format};base64,{base64_image}"

            content.append({"type": "image_url", "image_url": {"url": data_url}})

            print(f"Successfully encoded: {os.path.basename(image_path)}")

        except Exception as e:
            print(f"Error encoding image {image_path}: {e}")
            continue

    # Create the complete JSON structure
    json_payload = {"model": model, "messages": [{"role": "user", "content": content}]}

    return json_payload


def save_json_to_file(json_data: Dict[str, Any], output_path: str) -> None:
    """Save JSON data to a file."""
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)
        print(f"JSON saved to: {output_path}")
    except Exception as e:
        print(f"Error saving JSON: {e}")


def process_images_to_json(
    folder_path: str,
    output_path: str = None,
    text_prompt: str = "What is in this image?",
    model: str = "mistralai/pixtral-12b",
) -> Dict[str, Any]:
    """
    Process all images in a folder and create a JSON payload for vision model.

    Args:
        folder_path: Path to folder containing images
        output_path: Optional path to save JSON file (if None, only returns data)
        text_prompt: Text prompt to send with images
        model: Model name to use

    Returns:
        Dictionary with the API payload format
    """
    print(f"Processing images from: {folder_path}")

    json_data = create_vision_json(folder_path, text_prompt, model)

    if not json_data:
        return {}

    print(f"Created JSON with {len(json_data['messages'][0]['content']) - 1} images")

    if output_path:
        save_json_to_file(json_data, output_path)

    return json_data


# Example usage
if __name__ == "__main__":
    # Process images from the 1_raw folder
    folder_path = "./data/1_raw"  # Input folder with images
    output_file = "./data/2_silver/vision_payload.json"  # Output JSON file

    # Custom prompt for your use case
    custom_prompt = "Extract the information using using html"

    # Ensure output directory exists
    output_dir = os.path.dirname(output_file)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created output directory: {output_dir}")

    # Process images and create JSON
    result = process_images_to_json(
        folder_path=folder_path,
        output_path=output_file,
        text_prompt=custom_prompt,
        model="mistralai/pixtral-12b",
    )

    # Print a preview of the JSON structure
    if result:
        print("\nJSON structure preview:")
        print(f"Model: {result.get('model')}")
        print(f"Number of content items: {len(result['messages'][0]['content'])}")
        print(f"Text prompt: {result['messages'][0]['content'][0]['text'][:100]}...")
