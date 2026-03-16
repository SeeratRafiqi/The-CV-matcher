# Face expression detection models (optional)

For **expression/demeanor scoring** during the voice interview, place the following model files in this folder:

1. **tiny_face_detector_model-weights.bin** (and manifest if needed)
2. **face_expression_model-weights.bin** (and manifest if needed)

Download the weights from the face-api.js repository:

https://github.com/justadudewhohacks/face-api.js/tree/master/weights

Copy the files from the `weights` folder into this `public/models` directory. If the models are not present, the app still works and will send "Camera on; candidate visible" as demeanor feedback.
