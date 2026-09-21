# Unicode grapheme fixtures

The versioned files are unmodified Unicode `GraphemeBreakTest.txt` data. Exact
download URLs and SHA-256 checksums are in `manifest.json`; Unicode's license is
in `LICENSE.txt`. Tests use local files and require no network access.

Node conformance tests select the version matching `process.versions.unicode`.
An unsupported version fails with an instruction to add its official fixture,
rather than silently skipping conformance. Browser differential tests use the
browser's native segmenter as the reference: browsers do not expose a reliable
Unicode version, and newly assigned characters can differ across engines.

These data test grapheme boundaries, not normalization or case folding.
