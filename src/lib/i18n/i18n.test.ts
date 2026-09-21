import { describe, expect, it } from "vitest";
import { en } from "./dictionaries/en";
import { vi } from "./dictionaries/vi";
import { ja } from "./dictionaries/ja";
import { ko } from "./dictionaries/ko";
import { zh } from "./dictionaries/zh";
import { SUPPORTED_LANGUAGES } from "./types";

describe("i18n Dictionaries & Types (Ticket 6.2)", () => {
  it("defines 5 supported languages with code and flag", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(5);
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toEqual(["en", "vi", "ja", "ko", "zh"]);
  });

  const dicts = { vi, ja, ko, zh };

  it("all dictionaries have identical sections as English reference", () => {
    const enSections = Object.keys(en).sort();
    for (const [langCode, dict] of Object.entries(dicts)) {
      const langSections = Object.keys(dict).sort();
      expect(langSections, `Sections mismatch for ${langCode}`).toEqual(enSections);
    }
  });

  it("all dictionary sub-keys match English reference exactly", () => {
    for (const section of Object.keys(en) as Array<keyof typeof en>) {
      const enKeys = Object.keys(en[section]).sort();
      for (const [langCode, dict] of Object.entries(dicts)) {
        const dictKeys = Object.keys(dict[section]).sort();
        expect(dictKeys, `Section "${section}" sub-keys mismatch for ${langCode}`).toEqual(enKeys);
      }
    }
  });

  it("no em-dash (—) in any dictionary string (per taste-skill rules)", () => {
    const allDicts = [en, vi, ja, ko, zh];
    for (const dict of allDicts) {
      for (const section of Object.values(dict)) {
        for (const [key, val] of Object.entries(section)) {
          if (typeof val === "string") {
            expect(val.includes("—"), `Found forbidden em-dash in key "${key}": "${val}"`).toBe(false);
          }
        }
      }
    }
  });
});
