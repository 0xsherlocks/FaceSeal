# Model Conversion Tools

## Setup

```sh
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

## YOLOv8 to TFLite

```sh
python convert_yolov8_to_tflite.py --weights path\to\yolov8.pt --imgsz 640
```

Optional:

```sh
python convert_yolov8_to_tflite.py --weights path\to\yolov8.pt --imgsz 640 --fp16
python convert_yolov8_to_tflite.py --weights path\to\yolov8.pt --imgsz 640 --int8
```

## MobileFaceNet to TFLite

SavedModel:

```sh
python convert_mobilefacenet_to_tflite.py --model path\to\saved_model --output output\mobilefacenet.tflite
```

Keras:

```sh
python convert_mobilefacenet_to_tflite.py --model path\to\model.h5 --output output\mobilefacenet.tflite
```

INT8 calibration:

```sh
python convert_mobilefacenet_to_tflite.py --model path\to\saved_model --output output\mobilefacenet_int8.tflite --int8 --rep-data path\to\calibration_images
```
