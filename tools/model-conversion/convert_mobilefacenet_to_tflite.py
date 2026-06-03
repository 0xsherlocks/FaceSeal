import argparse
import os
from pathlib import Path
from typing import Iterable, List, Tuple

import tensorflow as tf


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a MobileFaceNet model to TFLite."
    )
    parser.add_argument(
        "--model",
        required=True,
        help="Path to SavedModel directory or Keras .h5/.keras file",
    )
    parser.add_argument("--output", required=True, help="Output .tflite path")
    parser.add_argument(
        "--input-size",
        default="112,112",
        help="Input size as width,height (default 112,112)",
    )
    parser.add_argument(
        "--float16",
        action="store_true",
        help="Enable float16 quantization",
    )
    parser.add_argument(
        "--int8",
        action="store_true",
        help="Enable full int8 quantization",
    )
    parser.add_argument(
        "--rep-data",
        help="Folder with representative images for int8 calibration",
    )
    return parser.parse_args()


def load_converter(model_path: Path) -> tf.lite.TFLiteConverter:
    if model_path.is_dir():
        return tf.lite.TFLiteConverter.from_saved_model(str(model_path))

    if model_path.suffix.lower() in {".h5", ".keras"}:
        model = tf.keras.models.load_model(str(model_path), compile=False)
        return tf.lite.TFLiteConverter.from_keras_model(model)

    raise ValueError(
        "Unsupported model format. Use a SavedModel directory or .h5/.keras file."
    )


def parse_input_size(value: str) -> Tuple[int, int]:
    parts = value.split(",")
    if len(parts) != 2:
        raise ValueError("--input-size must be in width,height format")
    return int(parts[0]), int(parts[1])


def iter_image_paths(folder: Path) -> List[Path]:
    patterns = ["*.jpg", "*.jpeg", "*.png", "*.bmp"]
    files: List[Path] = []
    for pattern in patterns:
        files.extend(folder.glob(pattern))
    return files


def representative_dataset(
    image_paths: Iterable[Path],
    input_size: Tuple[int, int],
) -> Iterable[List[tf.Tensor]]:
    width, height = input_size
    for path in image_paths:
        data = tf.io.read_file(str(path))
        image = tf.image.decode_image(data, channels=3)
        image.set_shape([None, None, 3])
        image = tf.image.resize(image, [height, width])
        image = tf.cast(image, tf.float32) / 255.0
        image = tf.expand_dims(image, 0)
        yield [image]


def main() -> None:
    args = parse_args()
    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    input_size = parse_input_size(args.input_size)
    converter = load_converter(model_path)

    if args.float16:
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.float16]

    if args.int8:
        if not args.rep_data:
            raise ValueError("--rep-data is required for int8 conversion")

        rep_folder = Path(args.rep_data)
        if not rep_folder.exists():
            raise FileNotFoundError(f"Rep data folder not found: {rep_folder}")

        image_paths = iter_image_paths(rep_folder)
        if not image_paths:
            raise ValueError("No images found in rep data folder")

        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.representative_dataset = lambda: representative_dataset(
            image_paths,
            input_size,
        )
        converter.target_spec.supported_ops = [
            tf.lite.OpsSet.TFLITE_BUILTINS_INT8,
        ]
        converter.inference_input_type = tf.int8
        converter.inference_output_type = tf.int8

    tflite_model = converter.convert()
    output_path.write_bytes(tflite_model)


if __name__ == "__main__":
    main()
