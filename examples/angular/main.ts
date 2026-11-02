import "@angular/compiler";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideZonelessChangeDetection } from "@angular/core";
import { ChikyuEarthComponent } from "./chikyu-earth.component";

void bootstrapApplication(ChikyuEarthComponent, { providers: [provideZonelessChangeDetection()] });
