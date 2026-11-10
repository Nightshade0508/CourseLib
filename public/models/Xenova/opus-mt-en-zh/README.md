# opus-mt-en-zh (ONNX, 8-bit)

English → Chinese translation model used by the free translator.

- Model: [Helsinki-NLP/opus-mt-en-zh](https://huggingface.co/Helsinki-NLP/opus-mt-en-zh), © Language Technology Research Group at the University of Helsinki, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- ONNX conversion: [Xenova/opus-mt-en-zh](https://huggingface.co/Xenova/opus-mt-en-zh).
- Changes: the two ONNX files are split into parts (`*.onnx.partN`, listed in `onnx/parts.json`) and joined again in the browser; the bytes are unchanged.

Re-download with `node scripts/fetch-mt-model.mjs`.
