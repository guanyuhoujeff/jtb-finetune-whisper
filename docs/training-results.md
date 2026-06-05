# Training Results & Best Hyperparameters

Record of fine-tuning runs and the best configuration found. These values are
now the **defaults in the Training UI** (`frontend/src/components/pages/TrainingPage.jsx`).

## Best hyperparameters (recommended defaults)

| Setting | Value | Notes |
|---------|-------|-------|
| Base model | `openai/whisper-large-v2` | v2 outperformed v3 for these medical sets |
| LoRA rank `r` | **64** | Higher capacity than the old default (32) helps memorize domain vocab |
| LoRA alpha | **128** | Convention alpha = 2·r (scale 2.0) |
| LoRA dropout | 0.05 | hardcoded in `train_lora.py` |
| LoRA target modules | `q_proj`, `v_proj` | hardcoded |
| Learning rate | **5e-5** | Lower LR (vs 1e-4) gave smoother training, fewer hallucinations |
| Max steps | **20000** | ~3 epochs; CER usually plateaus by ~step 9000–10000 |
| Eval steps | **1000** | CER on a 100-sample subset (full test set is too slow w/ generate) |
| Batch size | 1 | grad accumulation 4; near VRAM limit for large-v2 4-bit on 24–32 GB |
| Quantization | 4-bit NF4, fp16 compute | QLoRA via bitsandbytes |
| Optimizer | `paged_adamw_8bit` | + gradient checkpointing |
| Post-processing | merge + convert (CT2) | produces lora / merged / ct2 variants |

`load_best_model_at_end=True` (metric = CER) means the saved model is the best
checkpoint, not the last step — so over-training past the plateau is safe.

## Pre-processing (long audio)

Whisper truncates audio > 30 s. Any bucket with long clips must be run through
the chunker first (`POST /api/dataset/preprocess-long-audio`):
VAD + Whisper-segment-boundary splitting that re-aligns the ground-truth
transcript to each ≤25 s chunk. Short clips pass through unchanged.

## Run history

### Run 1 — asia-new-bay (medical, overfit experiment)

| Config | Value |
|--------|-------|
| Bucket | `asia-new-bay-chunked` (train 10067 / test 4304) |
| First attempt | r=32, LR 1e-4, 10k steps -> medical CER ~19.8% |
| **Best attempt** | **r=64, alpha=128, LR 5e-5, 30k steps** |
| Best eval CER (subset) | **1.90%** @ epoch 9.08 |
| A/B vs base large-v2 | medical CER 24.2% (base) -> 14.8% (FT); also fixed repeated-token hallucinations |
| Output | pushed to `jeff7522553/whisper-large-v2-asia-new-bay` (lora/merged/ct2 subfolders) |

### Run 2 — tvgh2 (2026-06-04)

| Config | Value |
|--------|-------|
| Bucket | `tvgh2-chunked` (train 6596 / test 3041) |
| Settings | large-v2, r=64, alpha=128, LR 5e-5, 20k steps, merge+convert |
| Eval CER curve | 12.2% (step 1000) -> 5.5% (step 9000, best) -> plateau 5.5–6.5% |
| **Best eval CER (subset)** | **5.52%** @ step 9000 |
| Output dir | `model_output/20260604-tvgh2-l2/` |
| Published | CT2 variant -> `jeff7522553/tvgh-l-v2-ct2` (repo root, faster-whisper ready) |

## Lessons learned

1. **large-v2 > large-v3** for these Traditional-Chinese medical sets.
2. **r=64 + LR 5e-5** beats the old r=32 + LR 1e-4 default — better domain memorization,
   noticeably fewer "。 。 。" repeated-token hallucinations.
3. **CER plateaus around step 9000–10000** for these dataset sizes; 20k is a safe
   ceiling but ~10k is usually enough. Loss keeps dropping (overfit) while eval CER
   stalls — rely on `load_best_model_at_end`.
4. The mid-training eval subset is **TTS-heavy**, so its CER under-represents the
   true medical-speech error rate. For an honest read, run a domain-specific A/B
   eval after training (see `/tmp/eval_finetune.py` pattern).
5. **OpenCC T->S normalization** is applied during transcript alignment because
   faster-whisper emits Simplified while transcripts are Traditional.
