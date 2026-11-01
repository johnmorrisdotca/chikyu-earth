# Security

If you find a security problem in Chikyu Earth, please report it privately by opening a security advisory on
the GitHub repository (https://github.com/johnmorrisdotca/chikyu-earth/security/advisories), rather than in a
public issue.

This package draws a globe from data baked in at build time and makes no network requests at runtime, except
the browser's own geolocation prompt when a page asks `<chikyu-earth>` to centre on the reader. No location is
stored or sent anywhere: it only sets the starting rotation.
