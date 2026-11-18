import { describe, expect, it } from "vitest";
import { validateProvisionInput } from "@/lib/liveavatarAdmin";

const valid = { baseUrl: "https://example.lovable.app/api/liveavatar/v1", modelName: "openai/gpt-6-astra" };

describe("validateProvisionInput", () => {
  it("accepts a valid https base_url and model name", () => {
    expect(validateProvisionInput(valid)).toBeNull();
  });

  it("rejects non-https base_url", () => {
    expect(validateProvisionInput({ ...valid, baseUrl: "http://example.com/x" })).toMatch(/https/);
  });

  it("rejects malformed base_url", () => {
    expect(validateProvisionInput({ ...valid, baseUrl: "not a url" })).toBeTruthy();
  });

  it("rejects empty base_url", () => {
    expect(validateProvisionInput({ ...valid, baseUrl: "" })).toBeTruthy();
  });

  it("rejects model names with spaces or Hebrew", () => {
    expect(validateProvisionInput({ ...valid, modelName: "gpt 6" })).toBeTruthy();
    expect(validateProvisionInput({ ...valid, modelName: "מודל" })).toBeTruthy();
  });

  it("rejects empty model name", () => {
    expect(validateProvisionInput({ ...valid, modelName: "" })).toBeTruthy();
  });
});
