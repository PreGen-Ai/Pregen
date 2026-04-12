import { jest } from "@jest/globals";

globalThis.jest = jest;

beforeEach(() => {
  jest.restoreAllMocks();
});
