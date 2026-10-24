# ProgressTrack

A position along a known span: a solid line for what has happened, a dotted line for what remains, and a downward triangle at "now".

Set the position with `--value` (a percentage) on `.eg-track`. Labels go in `eg-track__labels`: a start and an end, each with a `<small>` line. Typical uses: block of the day (89 of 96), the IEX trading window, landed tariff against the DISCOM benchmark.

The track inherits `currentColor`, so it is ink on canvas and white inside the folder or any `.eg-on-folder` panel. Always label both ends; the marker alone is not a value.
