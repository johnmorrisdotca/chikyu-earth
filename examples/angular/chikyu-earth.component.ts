import { Component, CUSTOM_ELEMENTS_SCHEMA, Input, OnInit } from "@angular/core";

@Component({
  selector: "app-chikyu-earth",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<chikyu-earth [attr.center]="center" [attr.look]="look" graticule></chikyu-earth>`,
})
export class ChikyuEarthComponent implements OnInit {
  @Input() center = "139.7,35.7";
  @Input() look: "line" | "thick" = "thick";

  ngOnInit(): void {
    // The element needs a browser: ngOnInit also runs when a server renders, so the import waits for one.
    if (typeof window !== "undefined") void import("@johnmorrisdotca/chikyu-earth/element");
  }
}
