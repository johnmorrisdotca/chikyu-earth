# Security

If you find a security problem in Chikyu Earth, please report it privately by opening a security advisory on
the GitHub repository (https://github.com/johnmorrisdotca/chikyu-earth/security/advisories), rather than in a
public issue.

This package draws a globe from data baked in at build time and makes no network requests at runtime.
It never asks the browser where the reader is: a page that wants the reader's place asks for it itself, on a press,
and sets `center`. The package stores and sends no location.
