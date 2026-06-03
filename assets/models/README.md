Place the TFLite model files used by FaceSeal in this directory.

Required filenames:

- yolov8n_face_int8.tflite
- minifasnet_v2.tflite
- mobilefacenet.tflite

These files are loaded by the service layer in `src/services`.
Keep the filenames exact so Metro can bundle them correctly.

If you regenerate or replace a model, keep the same name unless you also update the service configuration.