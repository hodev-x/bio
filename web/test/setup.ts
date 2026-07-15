import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// RTL's auto-cleanup relies on a global `afterEach`, which vitest doesn't
// provide unless `test.globals: true` is set. Register it explicitly so DOM
// from one test doesn't leak into the next within the same file.
afterEach(() => cleanup());
