import { describe, expect, it } from "vitest";
import { classifyReply } from "./reply";

describe("classifyReply", () => {
  it.each(["ok", "Hi, sure", "Thank you!", "Okay 👍", "🙏🙏", "சரி", "நன்றி", "super", "Thanks sir", "Will do"])("%s is a simple okay", (t) => {
    expect(classifyReply(t)).toBe("ack");
  });
  it.each([
    "Food was cold",
    "not good",
    "ok but the bill was wrong",
    "Why did you charge extra?",
    "😡",
    "👎",
    "சாப்பாடு சரியில்லை",
    "",
    "good good good good good good good good good",
  ])("%s needs the owner", (t) => {
    expect(classifyReply(t)).toBe("needs_owner");
  });
  it("voice notes and photos need the owner", () => {
    expect(classifyReply(null, "audio")).toBe("needs_owner");
    expect(classifyReply(null, "image")).toBe("needs_owner");
  });
});
