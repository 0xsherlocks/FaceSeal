import argparse
from pathlib import Path

from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a YOLOv8 model to TFLite."
    )
    parser.add_argument("--weights", required=True, help="Path to .pt weights")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image size")
    parser.add_argument(
        "--int8",
        action="store_true",
        help="Export INT8 quantized TFLite (requires calibration in Ultralytics)",
    )
    parser.add_argument(
        "--fp16",
        action="store_true",
        help="Export FP16 quantized TFLite",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    weights_path = Path(args.weights)
    if not weights_path.exists():
        raise FileNotFoundError(f"Weights not found: {weights_path}")

    model = YOLO(str(weights_path))
    export_kwargs = {
        "format": "tflite",
        "imgsz": args.imgsz,
    }
    if args.int8:
        export_kwargs["int8"] = True
    if args.fp16:
        export_kwargs["half"] = True

    model.export(**export_kwargs)


if __name__ == "__main__":
    main()
