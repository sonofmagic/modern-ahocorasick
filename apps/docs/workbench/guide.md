---
title: "Workbench guide"
description: "Read the scan, compare results, and save reproducible examples in the browser workbench."
---

# Workbench guide

Read the scan, compare results, and save reproducible examples in the browser workbench.

[Open the workbench →](/visualization)

## Try a real text-processing task

Choose `all`, `leftmost-first`, or `leftmost-longest` in the lab to compare overlaps. The original text highlights the union of the selected ranges; the result list keeps every duplicate distinct. Click a result to seek to its exact emission in the scan, or click a highlighted span to select its first overlapping result. The lab shows complete results independently of playback; the animation always illustrates `all`.

Replacement is a literal string, including `$&` and HTML-looking text. With `all` selected, the replacement preview uses `leftmost-longest`; otherwise it uses the selected non-overlapping strategy. Copy TypeScript to reproduce both operations with the workspace v3 library.

## Read and revisit the scan

Use the timeline, Previous step, and Previous/Next match controls to move in either direction. Seeking pauses playback. Each tape cell displays a zero-based grapheme number and its original UTF-16 `[start, end)` range. Selecting a result shows the exact `text.slice(start, end)` value and marks its graphemes.

Select a state in the graph (mouse, Enter, or Space) or a table to inspect its prefix, longest proper suffix in the trie, own terminal patterns, and inherited matches with their source states. Root represents the empty prefix. The failure link remains visible during an active fallback even when other failure links are hidden.

## Save and share

Copy share link creates a URL fragment containing the current keywords, full text, speed, strategy, replacement, and failure visibility. It does not change the current address or send input to a backend. Anyone with the link can read the input. On opening a link, its configuration takes precedence over session storage. Locale is preserved in the URL; the same fragment works on either language page.

Export JSON saves a versioned configuration plus the complete selected results and replacement. Import validates the configuration and recomputes results; saved results are never trusted. Invalid files leave the current configuration intact. Clipboard and session-storage failures do not prevent using the workbench. The generated code is also visible for manual copying.

## Input size and responsiveness

Compilation and scanning run in a cancellable Worker after a 120 ms edit debounce. Text edits reuse the compiled dictionary and graph layout; strategy or replacement edits reuse the trace. Stale workers are terminated, and leaving the page disposes pending work and playback.

This teaching workbench accepts at most 2,000 UTF-16 keyword units, 200 comma-separated entries, 20,000 text units, 200 replacement units, 50,000 trace steps, and a conservative 20 MB complete-export budget (including repeated pattern strings and replacement output). Exceeding a limit produces an explicit error, never a partial result. The graph is laid out only for up to 150 states; larger dictionaries retain paginated tables and state inspection. Tape, state tables, and results show 100 entries per page; JSON export includes complete results. These are site limits, not library API restrictions. The displayed processing time includes edit debounce, Worker startup when needed, computation, and data transfer; it is not a library benchmark.
