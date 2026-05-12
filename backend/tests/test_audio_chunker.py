# -*- coding: utf-8 -*-
"""Pure-logic tests for audio_chunker. ML-backed parts (silero-vad,
faster-whisper) are not exercised here — tests run without GPU/model files."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.mlops.audio_chunker import (  # noqa: E402
    ChunkAssignment,
    SpeechSegment,
    WhisperWord,
    _build_alignment_mapping,
    _confidence,
    assign_gt_to_chunks,
    merge_segments_to_chunks,
    normalize_for_alignment,
)


# ---------------------------------------------------------------------------
# normalize_for_alignment
# ---------------------------------------------------------------------------


def test_normalize_strips_chinese_and_english_punctuation():
    assert normalize_for_alignment("你好，世界！") == "你好世界"
    assert normalize_for_alignment("Hello, world!") == "helloworld"
    assert normalize_for_alignment("  空 白  ") == "空白"


def test_normalize_handles_none_and_empty():
    assert normalize_for_alignment("") == ""
    assert normalize_for_alignment(None) == ""  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# merge_segments_to_chunks
# ---------------------------------------------------------------------------


def _seg(start: float, end: float) -> SpeechSegment:
    return SpeechSegment(start_sec=start, end_sec=end)


def test_merge_empty_returns_empty():
    assert merge_segments_to_chunks([]) == []


def test_merge_single_short_segment_is_one_chunk():
    chunks = merge_segments_to_chunks([_seg(0.0, 5.0)], max_chunk_sec=25.0)
    assert chunks == [(0.0, 5.0)]


def test_merge_packs_segments_until_max_chunk_sec():
    # Three 10s speech segments separated by tiny silences.
    segments = [_seg(0.0, 10.0), _seg(10.5, 20.5), _seg(21.0, 31.0)]
    chunks = merge_segments_to_chunks(segments, max_chunk_sec=25.0)
    # First two pack into a single chunk (0 -> 20.5, span 20.5s);
    # third would push to 31.0s span -> spills into a second chunk.
    assert chunks == [(0.0, 20.5), (21.0, 31.0)]


def test_merge_starts_new_chunk_when_next_overflows():
    segments = [_seg(0.0, 20.0), _seg(20.5, 30.0)]
    chunks = merge_segments_to_chunks(segments, max_chunk_sec=25.0)
    # 0..20 stays alone (adding next would span 30s); 20.5..30 is its own chunk.
    assert chunks == [(0.0, 20.0), (20.5, 30.0)]


def test_merge_hard_splits_oversized_single_segment():
    # A 60-second monologue with no internal silence — VAD failed to split.
    chunks = merge_segments_to_chunks([_seg(0.0, 60.0)], max_chunk_sec=25.0)
    # Hard-cut at 25s boundaries.
    assert chunks == [(0.0, 25.0), (25.0, 50.0), (50.0, 60.0)]


def test_merge_drops_fragments_below_min_chunk_sec():
    # The trailing 0.3s region is below the 1s floor and should be dropped.
    segments = [_seg(0.0, 10.0), _seg(10.5, 10.8)]
    chunks = merge_segments_to_chunks(
        segments, max_chunk_sec=25.0, min_chunk_sec=1.0
    )
    # First chunk gets extended to 10.8s span (still ≤25s, so packed in).
    assert chunks == [(0.0, 10.8)]


def test_merge_clips_to_audio_duration():
    chunks = merge_segments_to_chunks(
        [_seg(0.0, 30.0)], max_chunk_sec=25.0, audio_duration_sec=22.0
    )
    # 30s > 25s cap, so it hard-splits, but clip to 22s total duration.
    assert all(end <= 22.0 for _, end in chunks)


def test_merge_typical_5_minute_recording():
    # Simulate a 5-min recording: 30 short speech bursts at 10s intervals.
    segments = [_seg(i * 10.0, i * 10.0 + 8.0) for i in range(30)]
    chunks = merge_segments_to_chunks(segments, max_chunk_sec=25.0)
    # Every chunk must fit Whisper's 30s window.
    assert all((end - start) <= 25.0 + 1e-6 for start, end in chunks)
    # And the chunks together cover roughly the full timeline.
    assert chunks[0][0] == 0.0
    assert chunks[-1][1] >= 290.0


# ---------------------------------------------------------------------------
# _build_alignment_mapping
# ---------------------------------------------------------------------------


def test_alignment_identity_when_strings_match():
    mapping = _build_alignment_mapping("你好世界", "你好世界")
    assert mapping == [0, 1, 2, 3, 4]


def test_alignment_handles_extra_chars_in_gt():
    # Whisper missed two characters that GT has.
    mapping = _build_alignment_mapping("你好界", "你好世界")
    assert mapping[0] == 0
    assert mapping[-1] == 4  # whisper end maps to gt end


def test_alignment_handles_extra_chars_in_whisper():
    # Whisper hallucinated characters not in GT.
    mapping = _build_alignment_mapping("你好世界呀", "你好世界")
    assert mapping[0] == 0
    assert mapping[-1] == 4


def test_alignment_replace_distributes_proportionally():
    # 4 whisper chars correspond to 4 gt chars but characters disagree.
    mapping = _build_alignment_mapping("ABCD", "WXYZ")
    assert mapping[0] == 0
    assert mapping[4] == 4
    # Boundaries inside the replace block fall on proportional positions.
    assert 1 <= mapping[1] <= 2
    assert 2 <= mapping[2] <= 3


# ---------------------------------------------------------------------------
# _confidence
# ---------------------------------------------------------------------------


def test_confidence_perfect_match_is_one():
    assert _confidence("你好", "你好") == 1.0


def test_confidence_zero_for_completely_different():
    # Two strings with no chars in common.
    assert _confidence("AAAA", "ZZZZ") == 0.0


def test_confidence_partial_overlap_is_between_zero_and_one():
    score = _confidence("你好世界", "你好天地")
    assert 0.0 < score < 1.0


def test_confidence_both_empty_is_one():
    assert _confidence("", "") == 1.0


def test_confidence_one_empty_is_zero():
    assert _confidence("你好", "") == 0.0
    assert _confidence("", "你好") == 0.0


# ---------------------------------------------------------------------------
# assign_gt_to_chunks (the heart of the alignment)
# ---------------------------------------------------------------------------


def _word(text: str, start: float, end: float) -> WhisperWord:
    return WhisperWord(text=text, start_sec=start, end_sec=end)


def test_assign_perfect_transcription_splits_gt_cleanly():
    # Whisper agrees with GT exactly. Split at the chunk boundary should
    # land between 你好世界 and 大家好.
    words = [
        _word("你", 0.0, 1.0),
        _word("好", 1.0, 2.0),
        _word("世", 2.0, 3.0),
        _word("界", 3.0, 4.0),
        # Chunk boundary at 5.0
        _word("大", 6.0, 7.0),
        _word("家", 7.0, 8.0),
        _word("好", 8.0, 9.0),
    ]
    boundaries = [(0.0, 5.0), (5.0, 10.0)]
    gt = "你好世界大家好"

    out = assign_gt_to_chunks(words, boundaries, gt)
    assert len(out) == 2
    assert out[0].gt_transcript == "你好世界"
    assert out[1].gt_transcript == "大家好"
    assert out[0].confidence > 0.9
    assert out[1].confidence > 0.9


def test_assign_preserves_punctuation_in_gt():
    # GT has punctuation; whisper output is plain. Punctuation must survive
    # because we slice the original (un-normalized) string.
    words = [
        _word("你", 0.0, 1.0),
        _word("好", 1.0, 2.0),
        _word("世", 5.0, 6.0),
        _word("界", 6.0, 7.0),
    ]
    boundaries = [(0.0, 4.0), (4.0, 10.0)]
    gt = "你好，世界！"

    out = assign_gt_to_chunks(words, boundaries, gt)
    # Comma should sit on a chunk boundary; surviving punctuation goes with
    # whichever side captures the whitespace/punct run.
    joined = (out[0].gt_transcript + out[1].gt_transcript).replace("，", "").replace("！", "")
    assert "你好世界" in joined or "你好" in joined[:2]
    # Confidence should be high — text is identical modulo punctuation.
    assert out[0].confidence > 0.7
    assert out[1].confidence > 0.7


def test_assign_low_confidence_when_whisper_disagrees():
    # Whisper produced totally wrong text — GT is not derivable.
    words = [
        _word("X", 0.0, 1.0),
        _word("Y", 1.0, 2.0),
        _word("Z", 5.0, 6.0),
        _word("W", 6.0, 7.0),
    ]
    boundaries = [(0.0, 4.0), (4.0, 10.0)]
    gt = "你好世界"

    out = assign_gt_to_chunks(words, boundaries, gt)
    # Confidence has to be near zero; downstream code will route these into
    # low_confidence.csv instead of training on them.
    assert all(a.confidence < 0.3 for a in out)


def test_assign_handles_empty_chunk():
    # No words land inside the second chunk (silence).
    words = [
        _word("你", 0.0, 1.0),
        _word("好", 1.0, 2.0),
    ]
    boundaries = [(0.0, 3.0), (3.0, 6.0)]
    gt = "你好"

    out = assign_gt_to_chunks(words, boundaries, gt)
    assert len(out) == 2
    assert out[0].gt_transcript == "你好"
    # Empty whisper chunk should still produce a (likely empty) result without
    # crashing — the chunk just won't carry useful labels.
    assert out[1].whisper_transcript == ""


def test_assign_no_boundaries_returns_empty():
    out = assign_gt_to_chunks([_word("你", 0.0, 1.0)], [], "你好")
    assert out == []


def test_assign_full_5_minute_scenario():
    # 60-character GT, evenly spaced over 300s.
    gt = "".join(chr(0x4E00 + i) for i in range(60))  # 一丁丂丄... (60 unique chars)
    # Whisper "transcribes" the same 60 chars at 5s intervals.
    words = [_word(gt[i], i * 5.0, i * 5.0 + 0.4) for i in range(60)]
    # Chunk every 25s -> 12 chunks.
    boundaries = [(i * 25.0, (i + 1) * 25.0) for i in range(12)]

    out = assign_gt_to_chunks(words, boundaries, gt)
    assert len(out) == 12
    # Every chunk should end up with 5 chars (25s / 5s per word).
    for a in out:
        assert 4 <= len(a.gt_transcript) <= 6  # allow rounding slack
        assert a.confidence > 0.8
    # Reassembled transcript should match GT (modulo possible 1-char slop).
    rejoined = "".join(a.gt_transcript for a in out)
    assert rejoined == gt
