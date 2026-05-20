import { describe, it, expect, beforeEach } from "bun:test";
import { toastStore } from "./toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    toastStore.clearAll();
  });

  it("should add a toast with default options", () => {
    const id = toastStore.add({ title: "Test Toast" });
    const toasts = toastStore.toasts.value;
    expect(toasts.length).toBe(1);
    expect(toasts[0].id).toBe(id);
    expect(toasts[0].title).toBe("Test Toast");
    expect(toasts[0].position).toBe("top-right"); // Default position
    expect(toasts[0].type).toBe("default");
  });

  it("should remove a toast by id", () => {
    const id = toastStore.add({ title: "Toast to remove" });
    expect(toastStore.toasts.value.length).toBe(1);
    
    toastStore.remove(id);
    expect(toastStore.toasts.value.length).toBe(0);
  });

  it("should clear all toasts", () => {
    toastStore.add({ title: "1" });
    toastStore.add({ title: "2" });
    expect(toastStore.toasts.value.length).toBe(2);
    
    toastStore.clearAll();
    expect(toastStore.toasts.value.length).toBe(0);
  });

  it("should filter toasts by position", () => {
    toastStore.add({ title: "TR 1", position: "top-right" });
    toastStore.add({ title: "TR 2", position: "top-right" });
    toastStore.add({ title: "BL 1", position: "bottom-left" });
    
    const trToasts = toastStore.getToastsByPosition("top-right").value;
    const blToasts = toastStore.getToastsByPosition("bottom-left").value;
    
    expect(trToasts.length).toBe(2);
    expect(blToasts.length).toBe(1);
  });

  it("should set isLeaving to true when dismissing", () => {
    const id = toastStore.add({ title: "Dismiss me" });
    toastStore.dismiss(id);
    
    const toast = toastStore.toasts.value.find(t => t.id === id);
    expect(toast).toBeDefined();
    expect(toast?.isLeaving).toBe(true);
  });

  it("should pause and resume a toast", () => {
    const id = toastStore.add({ title: "1" });
    
    toastStore.pause(id);
    expect(toastStore.toasts.value[0].isPaused).toBe(true);
    
    toastStore.resume(id);
    expect(toastStore.toasts.value[0].isPaused).toBe(false);
  });

  it("should generate a unique id if not provided", () => {
    const id1 = toastStore.add({ title: "A" });
    const id2 = toastStore.add({ title: "B" });
    expect(id1).not.toBe(id2);
  });

  it("should use provided id", () => {
    const id = toastStore.add({ id: "my-custom-id", title: "C" });
    expect(id).toBe("my-custom-id");
  });
});

// ─── Smart Deduplication ──────────────────────────────────────────────────────

describe("toastStore — smart deduplication", () => {
  beforeEach(() => {
    toastStore.clearAll();
  });

  it("adding same id twice updates existing toast instead of creating a new one", () => {
    toastStore.add({ id: "dup-id", title: "Original" });
    toastStore.add({ id: "dup-id", title: "Updated" });

    const toasts = toastStore.toasts.value;
    expect(toasts.length).toBe(1);
    expect(toasts[0].title).toBe("Updated");
  });

  it("dedup updates description and type of existing toast", () => {
    toastStore.add({ id: "upd-id", title: "Error A", type: "error" });
    toastStore.add({ id: "upd-id", title: "Error B", type: "warning", description: "Retry" });

    const toasts = toastStore.toasts.value;
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe("warning");
    expect(toasts[0].description).toBe("Retry");
  });

  it("dedup resets remainingTime to new duration", () => {
    toastStore.add({ id: "timer-id", title: "First", duration: 2000 });
    // Manually reduce remaining time to simulate partial expiry
    toastStore.toasts.value[0].remainingTime = 500;

    toastStore.add({ id: "timer-id", title: "Refreshed", duration: 4000 });
    expect(toastStore.toasts.value[0].remainingTime).toBe(4000);
  });

  it("dedup skips a toast that is already leaving (creates new one)", () => {
    toastStore.add({ id: "leaving-id", title: "Leaving" });
    toastStore.toasts.value[0].isLeaving = true;

    toastStore.add({ id: "leaving-id", title: "New one" });
    // The original (leaving) toast stays + a new one is added
    expect(toastStore.toasts.value.length).toBe(2);
  });

  it("returned id is the same when dedup update occurs", () => {
    const id1 = toastStore.add({ id: "same-id", title: "A" });
    const id2 = toastStore.add({ id: "same-id", title: "B" });
    expect(id1).toBe("same-id");
    expect(id2).toBe("same-id");
  });
});
