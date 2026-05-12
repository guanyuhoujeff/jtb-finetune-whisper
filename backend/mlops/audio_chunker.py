# -*- coding: utf-8 -*-
"""
Long-audio chunking with VAD-based segmentation and ground-truth transcript
alignment for Whisper LoRA training.

Whisper's feature extractor truncates anything longer than 30 seconds, so
training samples > 30s silently lose audio while keeping the full transcript,
producing badly aligned (audio, text) pairs. This module pre-splits long
samples into ≤ MAX_CHUNK_SEC sub-samples and slices the user-provided
ground-truth transcript to match each sub-segment.

Pipeline:
  1) Run silero-vad to find speech segments.
  2) Greedy-merge segments into chunks ≤ max_chunk_sec.
  3) Run faster-whisper with word-level timestamps on the full audio.
  4) For each chunk, gather whisper words inside its time window.
  5) Char-level align Whisper's full output to the ground-truth transcript
     (difflib.SequenceMatcher) and read off the GT slice for each chunk.
  6) Score each chunk (matching char ratio); flag low-confidence chunks for
     manual review instead of training on them.

Heavy ML deps (silero-vad, faster-whisper) are lazy-imported so the pure
alignment logic remains unit-testable without GPU/model downloads.
"""

from __future__ import annotations

import difflib
import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Whisper's hard limit is 30s; we leave 5s of headroom so VAD jitter / word
# timestamps slightly past the boundary do not push the resulting chunk over.
DEFAULT_MAX_CHUNK_SEC = 25.0
DEFAULT_MIN_CHUNK_SEC = 1.0
DEFAULT_CONFIDENCE_THRESHOLD = 0.7

# Punctuation we strip before alignment. Whisper output and human transcripts
# disagree on punctuation in Chinese, but we keep it in the final output.
_PUNCT_RE = re.compile(
    r"[\s，。！？、；：「」『』（）()【】《》<>\[\]\.,!?;:\"'`~@#\$%\^&\*_=\+\\/\-]+"
)


# Traditional ↔ Simplified Chinese normalization. faster-whisper consistently
# emits Simplified characters; transcripts created in Taiwan/HK are usually
# Traditional. Without this, char-level alignment treats 壓 and 压 as different
# codepoints and confidence collapses. We normalize both sides to Simplified
# *only* for matching — the original Traditional characters are preserved in
# the final output via norm_to_orig mapping.
def _make_t2s_converter():
    try:
        from opencc import OpenCC  # noqa: WPS433
        return OpenCC("t2s").convert
    except Exception:
        return None


_T2S = _make_t2s_converter()


def _t2s_per_char(text: str) -> str:
    """Convert text Traditional→Simplified character by character so output
    length matches input length (alignment indices stay valid)."""
    if not _T2S or not text:
        return text or ""
    out = []
    for ch in text:
        converted = _T2S(ch)
        # OpenCC may return a multi-char string for some Traditional chars
        # (e.g., compound characters). Take the first char so we keep 1:1.
        out.append(converted[:1] if converted else ch)
    return "".join(out)


@dataclass(frozen=True)
class SpeechSegment:
    start_sec: float
    end_sec: float

    @property
    def duration(self) -> float:
        return self.end_sec - self.start_sec


@dataclass(frozen=True)
class WhisperWord:
    """A single Whisper-emitted token (a Chinese 'word' is usually 1 char)."""

    text: str
    start_sec: float
    end_sec: float


@dataclass(frozen=True)
class WhisperSegment:
    """A sentence-level segment as emitted by faster-whisper. Whisper's decoder
    naturally breaks at sentence ends / long pauses, so merging *segments*
    (rather than VAD speech regions) keeps chunk boundaries on linguistic
    breaks — avoiding the mid-word splits VAD produces in continuous speech."""

    start_sec: float
    end_sec: float
    text: str
    words: Tuple["WhisperWord", ...] = ()

    @property
    def duration(self) -> float:
        return self.end_sec - self.start_sec


@dataclass
class ChunkAssignment:
    """Where a chunk lives in time and what transcript slice it owns."""

    t_start_sec: float
    t_end_sec: float
    gt_transcript: str
    whisper_transcript: str
    confidence: float

    @property
    def duration(self) -> float:
        return self.t_end_sec - self.t_start_sec


@dataclass
class ChunkResult(ChunkAssignment):
    audio: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.float32))
    sample_rate: int = 16000


# ---------------------------------------------------------------------------
# Pure logic — unit-testable without ML deps
# ---------------------------------------------------------------------------


def normalize_for_alignment(text: str) -> str:
    """Lower-case + strip whitespace + collapse Trad→Simp Chinese. Used only
    for char alignment; the original text (incl. Traditional chars and
    punctuation) is preserved in the output via norm_to_orig mapping."""
    stripped = _PUNCT_RE.sub("", text or "").lower()
    return _t2s_per_char(stripped)


def merge_segments_to_chunks(
    segments: Sequence[SpeechSegment],
    *,
    max_chunk_sec: float = DEFAULT_MAX_CHUNK_SEC,
    min_chunk_sec: float = DEFAULT_MIN_CHUNK_SEC,
    audio_duration_sec: Optional[float] = None,
) -> List[Tuple[float, float]]:
    """Greedy-merge speech segments into chunks bounded by max_chunk_sec.

    Returns a list of (start_sec, end_sec) tuples covering the speech regions.
    Trailing silence is excluded — no need to train on empty audio.

    If a single speech segment is longer than max_chunk_sec, it is hard-split
    at max_chunk_sec boundaries (lossy — VAD failed to find an internal silence
    so we just cut). The caller will be warned via the returned chunks.
    """
    if not segments:
        return []

    chunks: List[Tuple[float, float]] = []
    cur_start: Optional[float] = None
    cur_end: Optional[float] = None

    for seg in segments:
        # First handle pathological case: this single segment exceeds the cap.
        if seg.duration > max_chunk_sec:
            # Flush whatever we already built up.
            if cur_start is not None and cur_end is not None:
                if cur_end - cur_start >= min_chunk_sec:
                    chunks.append((cur_start, cur_end))
                cur_start = cur_end = None
            # Hard-split the long segment.
            t = seg.start_sec
            while t < seg.end_sec:
                end_t = min(t + max_chunk_sec, seg.end_sec)
                if end_t - t >= min_chunk_sec:
                    chunks.append((t, end_t))
                t = end_t
            continue

        if cur_start is None:
            cur_start, cur_end = seg.start_sec, seg.end_sec
            continue

        # Would adding this segment overflow max_chunk_sec?
        prospective_end = seg.end_sec
        if prospective_end - cur_start <= max_chunk_sec:
            cur_end = prospective_end
        else:
            if cur_end is not None and cur_end - cur_start >= min_chunk_sec:
                chunks.append((cur_start, cur_end))
            cur_start, cur_end = seg.start_sec, seg.end_sec

    if cur_start is not None and cur_end is not None:
        tail_dur = cur_end - cur_start
        # Whisper's hard limit is 30s; allow tail absorption up to 29s so a
        # tiny tail (1-2s) gets attached to the previous chunk rather than
        # becoming a hopelessly-short standalone chunk that always scores low
        # confidence. The 1s safety margin still avoids the truncation edge.
        absorb_cap_sec = max(max_chunk_sec, 29.0)
        if tail_dur < min_chunk_sec and chunks:
            prev_start, prev_end = chunks[-1]
            if cur_end - prev_start <= absorb_cap_sec:
                chunks[-1] = (prev_start, cur_end)
            else:
                chunks.append((cur_start, cur_end))
        elif tail_dur < 3.0 and chunks:
            # Even if the tail is technically ≥ min_chunk_sec, very short
            # standalone tails (a few seconds) align poorly because Whisper
            # has no context. Absorb when safe; keep otherwise.
            prev_start, prev_end = chunks[-1]
            if cur_end - prev_start <= absorb_cap_sec:
                chunks[-1] = (prev_start, cur_end)
            else:
                chunks.append((cur_start, cur_end))
        else:
            chunks.append((cur_start, cur_end))

    if audio_duration_sec is not None:
        chunks = [
            (max(0.0, s), min(audio_duration_sec, e)) for s, e in chunks if s < audio_duration_sec
        ]
    return chunks


def merge_whisper_segments_to_chunks(
    segments: Sequence["WhisperSegment"],
    *,
    max_chunk_sec: float = DEFAULT_MAX_CHUNK_SEC,
    min_chunk_sec: float = DEFAULT_MIN_CHUNK_SEC,
    audio_duration_sec: Optional[float] = None,
) -> List[Tuple[float, float]]:
    """Greedy-merge Whisper *segments* (sentence-grouped output from the
    decoder) into chunks bounded by max_chunk_sec.

    Unlike VAD speech regions — which are determined purely by silence and
    routinely split continuous speech mid-phrase — Whisper segments end on
    decoder-perceived sentence/clause breaks, so chunk boundaries from this
    function land on linguistic boundaries (after a sentence, after a clause,
    etc.) rather than mid-word.

    If a single segment exceeds max_chunk_sec (rare; usually Whisper itself
    caps segments around 30s), we fall back to a hard split.
    """
    if not segments:
        return []

    chunks: List[Tuple[float, float]] = []
    cur_start: Optional[float] = None
    cur_end: Optional[float] = None

    for seg in segments:
        # Pathological: single Whisper segment is longer than our cap. Flush
        # what we have, then hard-split this one.
        if seg.duration > max_chunk_sec:
            if cur_start is not None and cur_end is not None:
                if cur_end - cur_start >= min_chunk_sec:
                    chunks.append((cur_start, cur_end))
                cur_start = cur_end = None
            t = seg.start_sec
            while t < seg.end_sec:
                end_t = min(t + max_chunk_sec, seg.end_sec)
                if end_t - t >= min_chunk_sec:
                    chunks.append((t, end_t))
                t = end_t
            continue

        if cur_start is None:
            cur_start, cur_end = seg.start_sec, seg.end_sec
            continue

        if seg.end_sec - cur_start <= max_chunk_sec:
            cur_end = seg.end_sec
        else:
            # Flush the current chunk (boundary lands at the END of the
            # previously-included segment — i.e., at a Whisper segment end,
            # which is the whole point of this approach).
            if cur_end is not None and cur_end - cur_start >= min_chunk_sec:
                chunks.append((cur_start, cur_end))
            cur_start, cur_end = seg.start_sec, seg.end_sec

    if cur_start is not None and cur_end is not None:
        tail_dur = cur_end - cur_start
        absorb_cap_sec = max(max_chunk_sec, 29.0)
        # Tail absorption: short trailing segments get attached to the
        # previous chunk so we don't emit a 1-second standalone tail that
        # scores low confidence on its own.
        if tail_dur < 3.0 and chunks:
            prev_start, prev_end = chunks[-1]
            if cur_end - prev_start <= absorb_cap_sec:
                chunks[-1] = (prev_start, cur_end)
            else:
                chunks.append((cur_start, cur_end))
        else:
            chunks.append((cur_start, cur_end))

    if audio_duration_sec is not None:
        chunks = [
            (max(0.0, s), min(audio_duration_sec, e))
            for s, e in chunks
            if s < audio_duration_sec
        ]
    return chunks


def _build_alignment_mapping(whisper_text: str, gt_text: str) -> List[int]:
    """Map each position [0..len(whisper_text)] -> position in gt_text.

    Uses difflib.SequenceMatcher opcodes; for non-equal blocks the mapping is
    distributed linearly so chunk boundaries land in roughly the right place
    even when Whisper deletes / replaces text relative to GT.
    """
    n_w = len(whisper_text)
    mapping = [0] * (n_w + 1)
    sm = difflib.SequenceMatcher(a=whisper_text, b=gt_text, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        w_len = i2 - i1
        g_len = j2 - j1
        if tag == "equal":
            for k in range(w_len + 1):
                if i1 + k <= n_w:
                    mapping[i1 + k] = j1 + k
        elif tag == "replace":
            denom = max(w_len, 1)
            for k in range(w_len + 1):
                if i1 + k <= n_w:
                    mapping[i1 + k] = j1 + int(round(k * g_len / denom))
        elif tag == "delete":
            # Whisper produced characters not in GT — collapse to j1.
            for k in range(w_len + 1):
                if i1 + k <= n_w:
                    mapping[i1 + k] = j1
        elif tag == "insert":
            # GT has characters with no whisper counterpart — only the single
            # boundary i1 matters; subsequent opcodes update later indices.
            mapping[i1] = j1
    mapping[n_w] = len(gt_text)
    return mapping


def _confidence(whisper_chunk: str, gt_chunk: str) -> float:
    """0.0-1.0 char-overlap ratio. Empty strings return 0.0."""
    if not whisper_chunk and not gt_chunk:
        return 1.0  # Both empty — trivially aligned.
    if not whisper_chunk or not gt_chunk:
        return 0.0
    return difflib.SequenceMatcher(a=whisper_chunk, b=gt_chunk, autojunk=False).ratio()


def assign_gt_to_chunks(
    whisper_words: Sequence[WhisperWord],
    chunk_boundaries: Sequence[Tuple[float, float]],
    gt_transcript: str,
) -> List[ChunkAssignment]:
    """For each chunk window, slice gt_transcript to match Whisper's words
    inside that window. Char alignment is done once over the full text; per-
    chunk slices are extracted from the alignment."""
    if not chunk_boundaries:
        return []

    # 1) Build per-chunk Whisper text (raw + normalized).
    chunk_whisper_raw: List[str] = []
    chunk_whisper_norm: List[str] = []
    for t_start, t_end in chunk_boundaries:
        words_in_chunk = [
            w.text for w in whisper_words
            # Word is "in" the chunk if its midpoint falls inside the window.
            if (w.start_sec + w.end_sec) / 2.0 >= t_start
            and (w.start_sec + w.end_sec) / 2.0 < t_end
        ]
        raw = "".join(words_in_chunk)
        chunk_whisper_raw.append(raw)
        chunk_whisper_norm.append(normalize_for_alignment(raw))

    full_whisper_norm = "".join(chunk_whisper_norm)
    gt_norm = normalize_for_alignment(gt_transcript)

    # 2) Map normalized whisper positions -> normalized gt positions.
    mapping = _build_alignment_mapping(full_whisper_norm, gt_norm)

    # 3) For each chunk, read off the gt slice using cumulative whisper
    #    positions, then re-project that slice back into the original
    #    (un-normalized) gt_transcript so we keep the user's punctuation.
    norm_to_orig = _build_normalized_to_original_index(gt_transcript)
    assignments: List[ChunkAssignment] = []
    cum = 0
    for i, (t_start, t_end) in enumerate(chunk_boundaries):
        w_norm = chunk_whisper_norm[i]
        w_start = cum
        w_end = cum + len(w_norm)
        cum = w_end

        gt_norm_start = mapping[w_start] if w_start < len(mapping) else len(gt_norm)
        gt_norm_end = mapping[w_end] if w_end < len(mapping) else len(gt_norm)
        # Guard: alignment must be monotonic for sensible slicing.
        if gt_norm_end < gt_norm_start:
            gt_norm_end = gt_norm_start

        gt_slice_norm = gt_norm[gt_norm_start:gt_norm_end]
        gt_slice_orig = _slice_original_by_norm_range(
            gt_transcript, norm_to_orig, gt_norm_start, gt_norm_end
        )

        confidence = _confidence(w_norm, gt_slice_norm)
        assignments.append(
            ChunkAssignment(
                t_start_sec=float(t_start),
                t_end_sec=float(t_end),
                gt_transcript=gt_slice_orig.strip(),
                whisper_transcript=chunk_whisper_raw[i].strip(),
                confidence=confidence,
            )
        )
    return assignments


def _build_normalized_to_original_index(text: str) -> List[int]:
    """For each position in normalize_for_alignment(text), return the
    corresponding position in the original text. Length: len(normalized) + 1."""
    norm_chars: List[int] = []
    for i, ch in enumerate(text or ""):
        if not _PUNCT_RE.fullmatch(ch):
            norm_chars.append(i)
    norm_chars.append(len(text or ""))
    return norm_chars


def _slice_original_by_norm_range(
    original: str,
    norm_to_orig: Sequence[int],
    norm_start: int,
    norm_end: int,
) -> str:
    if not original:
        return ""
    # Clamp into valid range.
    norm_start = max(0, min(norm_start, len(norm_to_orig) - 1))
    norm_end = max(norm_start, min(norm_end, len(norm_to_orig) - 1))
    o_start = norm_to_orig[norm_start]
    o_end = norm_to_orig[norm_end]
    return original[o_start:o_end]


# ---------------------------------------------------------------------------
# ML-backed orchestration (lazy imports)
# ---------------------------------------------------------------------------


def detect_speech_segments(
    audio: np.ndarray,
    sample_rate: int,
    *,
    min_speech_ms: int = 250,
    min_silence_ms: int = 200,
) -> List[SpeechSegment]:
    """Run silero-vad over the audio and return non-overlapping speech regions.

    silero-vad requires 16kHz mono float32 in [-1, 1].
    """
    if sample_rate != 16000:
        raise ValueError("VAD requires 16kHz audio; resample upstream.")
    if audio.ndim != 1:
        raise ValueError("Mono audio expected.")

    import torch  # noqa: WPS433  (lazy)
    from silero_vad import get_speech_timestamps, load_silero_vad  # noqa: WPS433

    model = load_silero_vad()
    audio_tensor = torch.from_numpy(audio.astype(np.float32, copy=False))
    timestamps = get_speech_timestamps(
        audio_tensor,
        model,
        sampling_rate=sample_rate,
        min_speech_duration_ms=min_speech_ms,
        min_silence_duration_ms=min_silence_ms,
        return_seconds=True,
    )
    return [SpeechSegment(start_sec=ts["start"], end_sec=ts["end"]) for ts in timestamps]


def load_whisper_model(
    model_size: str = "small",
    device: str = "auto",
    compute_type: str = "default",
):
    """Load a faster-whisper model. Cache and reuse across many audio files
    when batch-processing — model load time dominates per-file cost."""
    from faster_whisper import WhisperModel  # noqa: WPS433  (lazy)

    if device == "auto":
        try:
            import torch  # noqa: WPS433
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"
    return WhisperModel(model_size, device=device, compute_type=compute_type)


def transcribe_with_word_timestamps(
    audio: np.ndarray,
    sample_rate: int,
    *,
    language: str = "zh",
    model=None,
    model_size: str = "small",
    device: str = "auto",
    compute_type: str = "default",
) -> List[WhisperWord]:
    """Run faster-whisper to get word-level (in Chinese: char-level) timestamps.
    Pass `model=` to reuse a preloaded WhisperModel across many calls."""
    _segments, words = _transcribe_full(
        audio, sample_rate,
        language=language, model=model, model_size=model_size,
        device=device, compute_type=compute_type,
    )
    return words


def transcribe_with_segments(
    audio: np.ndarray,
    sample_rate: int,
    *,
    language: str = "zh",
    model=None,
    model_size: str = "small",
    device: str = "auto",
    compute_type: str = "default",
) -> Tuple[List[WhisperSegment], List[WhisperWord]]:
    """Run faster-whisper and return both segment-level and word-level output.

    Segments are sentence-grouped by Whisper's decoder; words carry per-token
    timestamps. The chunker uses segments to pick chunk boundaries (avoiding
    mid-word splits) and uses words to map cumulative positions to the GT
    transcript during alignment."""
    return _transcribe_full(
        audio, sample_rate,
        language=language, model=model, model_size=model_size,
        device=device, compute_type=compute_type,
    )


def _transcribe_full(
    audio: np.ndarray,
    sample_rate: int,
    *,
    language: str,
    model,
    model_size: str,
    device: str,
    compute_type: str,
) -> Tuple[List[WhisperSegment], List[WhisperWord]]:
    if sample_rate != 16000:
        raise ValueError("Pass 16kHz audio.")
    if model is None:
        model = load_whisper_model(model_size, device, compute_type)

    raw_segments, _info = model.transcribe(
        audio.astype(np.float32, copy=False),
        language=language,
        word_timestamps=True,
        vad_filter=False,
    )

    segments: List[WhisperSegment] = []
    words: List[WhisperWord] = []
    for seg in raw_segments:
        seg_words: List[WhisperWord] = []
        if seg.words:
            for w in seg.words:
                if w.word is None:
                    continue
                ww = WhisperWord(text=w.word, start_sec=w.start, end_sec=w.end)
                seg_words.append(ww)
                words.append(ww)
        segments.append(WhisperSegment(
            start_sec=float(seg.start),
            end_sec=float(seg.end),
            text=seg.text or "",
            words=tuple(seg_words),
        ))
    return segments, words


def chunk_long_audio(
    audio: np.ndarray,
    sample_rate: int,
    gt_transcript: str,
    *,
    max_chunk_sec: float = DEFAULT_MAX_CHUNK_SEC,
    min_chunk_sec: float = DEFAULT_MIN_CHUNK_SEC,
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
    language: str = "zh",
    whisper_model=None,
    whisper_model_size: str = "small",
) -> List[ChunkResult]:
    """End-to-end: Whisper full transcribe → merge sentence-level segments
    into ≤max_chunk_sec chunks → align GT to chunk windows.

    Boundaries land on Whisper-decoder sentence breaks (not VAD silences),
    which keeps chunks from splitting mid-word on continuous speech. Audio
    short enough to fit Whisper's 30s window short-circuits without running
    Whisper at all (single chunk, confidence=1.0)."""
    duration_sec = len(audio) / sample_rate

    if duration_sec <= max_chunk_sec:
        return [
            ChunkResult(
                t_start_sec=0.0,
                t_end_sec=duration_sec,
                gt_transcript=(gt_transcript or "").strip(),
                whisper_transcript="",
                confidence=1.0,
                audio=audio,
                sample_rate=sample_rate,
            )
        ]

    whisper_segments, whisper_words = transcribe_with_segments(
        audio,
        sample_rate,
        language=language,
        model=whisper_model,
        model_size=whisper_model_size,
    )
    if not whisper_segments:
        logger.warning("Whisper returned no segments — skipping audio.")
        return []

    boundaries = merge_whisper_segments_to_chunks(
        whisper_segments,
        max_chunk_sec=max_chunk_sec,
        min_chunk_sec=min_chunk_sec,
        audio_duration_sec=duration_sec,
    )
    if not boundaries:
        return []

    assignments = assign_gt_to_chunks(whisper_words, boundaries, gt_transcript)

    results: List[ChunkResult] = []
    for a in assignments:
        i_start = max(0, int(a.t_start_sec * sample_rate))
        i_end = min(len(audio), int(a.t_end_sec * sample_rate))
        if i_end <= i_start:
            continue
        results.append(
            ChunkResult(
                t_start_sec=a.t_start_sec,
                t_end_sec=a.t_end_sec,
                gt_transcript=a.gt_transcript,
                whisper_transcript=a.whisper_transcript,
                confidence=a.confidence,
                audio=audio[i_start:i_end],
                sample_rate=sample_rate,
            )
        )
    _ = confidence_threshold  # caller filters; kept here for symmetry.
    return results
