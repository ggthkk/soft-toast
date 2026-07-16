import { describe, it, expect, beforeEach } from "bun:test";
import { toastStore } from "./toastStore";

const waitForExitCleanup = () =>
  new Promise((resolve) => setTimeout(resolve, 425));

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

    const toast = toastStore.toasts.value.find((t) => t.id === id);
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
    toastStore.add({
      id: "upd-id",
      title: "Error B",
      type: "warning",
      description: "Retry",
    });

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

  it("replaces a leaving toast before reusing its public id", () => {
    toastStore.add({ id: "leaving-id", title: "Leaving" });
    toastStore.toasts.value[0].isLeaving = true;

    toastStore.add({ id: "leaving-id", title: "New one" });
    expect(toastStore.toasts.value).toHaveLength(1);
    expect(toastStore.toasts.value[0].title).toBe("New one");
    expect(toastStore.toasts.value[0].isLeaving).toBe(false);
  });

  it("returned id is the same when dedup update occurs", () => {
    const id1 = toastStore.add({ id: "same-id", title: "A" });
    const id2 = toastStore.add({ id: "same-id", title: "B" });
    expect(id1).toBe("same-id");
    expect(id2).toBe("same-id");
  });
});

// ─── maxQueue / queueOverflow ─────────────────────────────────────────────────

describe("toastStore — maxQueue cap", () => {
  beforeEach(() => {
    toastStore.clearAll();
    // Reset to disabled so each test sets its own cap explicitly.
    toastStore.setMaxQueue(Infinity, "drop-oldest");
  });

  it("does not limit when maxQueue is Infinity", () => {
    toastStore.setMaxQueue(Infinity);
    for (let i = 0; i < 25; i++) toastStore.add({ title: `t${i}` });
    expect(toastStore.toasts.value.length).toBe(25);
  });

  it("limits active toasts to maxQueue", () => {
    toastStore.setMaxQueue(3);
    for (let i = 0; i < 5; i++) toastStore.add({ title: `t${i}` });
    expect(toastStore.toasts.value.length).toBe(3);
  });

  it("drop-oldest removes the oldest inserts (tail of array)", () => {
    toastStore.setMaxQueue(3, "drop-oldest");
    // unshift puts newest at index 0: [t4, t3, t2, t1, t0]
    for (let i = 0; i < 5; i++) toastStore.add({ id: `t${i}`, title: `t${i}` });
    const ids = toastStore.toasts.value.map((t) => t.id);
    // Newest three survive: t4, t3, t2 (in array order)
    expect(ids).toEqual(["t4", "t3", "t2"]);
  });

  it("drop-newest removes the newest inserts (head of array)", () => {
    toastStore.setMaxQueue(3, "drop-newest");
    for (let i = 0; i < 5; i++) toastStore.add({ id: `t${i}`, title: `t${i}` });
    const ids = toastStore.toasts.value.map((t) => t.id);
    // Oldest three survive: t2, t1, t0
    expect(ids).toEqual(["t2", "t1", "t0"]);
  });

  it("does not count isLeaving toasts toward the cap", () => {
    toastStore.setMaxQueue(2);
    toastStore.add({ id: "a", title: "a" });
    toastStore.add({ id: "b", title: "b" });
    // Mark a as leaving — it should not block a new toast
    toastStore.toasts.value[1].isLeaving = true;
    toastStore.add({ id: "c", title: "c" });
    const ids = toastStore.toasts.value.map((t) => t.id);
    // b (leaving) stays for its exit animation, plus c and a
    expect(ids).toContain("c");
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("dedup update does not trigger the cap", () => {
    toastStore.setMaxQueue(2);
    toastStore.add({ id: "x", title: "x" });
    toastStore.add({ id: "y", title: "y" });
    // Same id → update existing, should NOT drop anything.
    // Dedup replaces in place (does not move to front), so order is [y, x].
    toastStore.add({ id: "x", title: "x-updated" });
    const ids = toastStore.toasts.value.map((t) => t.id);
    expect(ids).toEqual(["y", "x"]);
    const x = toastStore.toasts.value.find((t) => t.id === "x");
    expect(x?.title).toBe("x-updated");
  });

  it("enforces cap immediately when setMaxQueue shrinks the limit", () => {
    for (let i = 0; i < 5; i++) toastStore.add({ id: `t${i}`, title: `t${i}` });
    expect(toastStore.toasts.value.length).toBe(5);
    toastStore.setMaxQueue(2, "drop-oldest");
    expect(toastStore.toasts.value.length).toBe(2);
    // Newest two survive
    expect(toastStore.toasts.value.map((t) => t.id)).toEqual(["t4", "t3"]);
  });

  it("B3: does not drop loading/promise toasts (duration: Infinity) over cap", () => {
    toastStore.setMaxQueue(2);
    // Two protected loading toasts fill the cap.
    toastStore.add({ id: "load1", title: "Loading 1", duration: Infinity });
    toastStore.add({ id: "load2", title: "Loading 2", duration: Infinity });
    // A normal toast arrives — it should still be admitted, but the loading
    // toasts must not be dropped (otherwise the promise update would no-op).
    toastStore.add({ id: "norm", title: "Normal", duration: 4000 });
    const ids = toastStore.toasts.value.map((t) => t.id);
    expect(ids).toContain("load1");
    expect(ids).toContain("load2");
    expect(ids).toContain("norm");
  });

  it("B3: drops oldest NON-protected toasts first when protected fill the cap", () => {
    toastStore.setMaxQueue(2);
    toastStore.add({ id: "load", title: "Loading", duration: Infinity });
    // Three normal toasts + one protected. cap=2 counts ONLY normal toasts,
    // so the OLDEST normal toast (n1) is dropped, never the loading one.
    toastStore.add({ id: "n1", title: "n1", duration: 4000 });
    toastStore.add({ id: "n2", title: "n2", duration: 4000 });
    toastStore.add({ id: "n3", title: "n3", duration: 4000 });
    const ids = toastStore.toasts.value.map((t) => t.id);
    expect(ids).toContain("load");
    expect(ids).toContain("n3");
    expect(ids).toContain("n2");
    // n1 (oldest non-protected) was dropped to make room.
    expect(ids).not.toContain("n1");
  });
});

// ─── dismiss race conditions ──────────────────────────────────────────────────

describe("toastStore — dismiss race conditions", () => {
  beforeEach(() => {
    toastStore.clearAll();
    toastStore.setMaxQueue(Infinity, "drop-oldest");
  });

  it("dismissAll does not wipe a different-id toast after exit cleanup", async () => {
    toastStore.add({ id: "a", title: "a" });
    toastStore.add({ id: "b", title: "b" });
    toastStore.dismiss(); // start dismissAll — setTimeout filter queued
    // A new toast arrives DURING the 400ms exit window.
    toastStore.add({ id: "c", title: "c" });
    // The new toast must survive — only a and b were captured for dismissal.
    expect(toastStore.toasts.value.map((t) => t.id)).toContain("c");
    // a and b are still in the array (just leaving) during the window.
    expect(toastStore.toasts.value.some((t) => t.id === "a")).toBe(true);
    expect(toastStore.toasts.value.some((t) => t.id === "b")).toBe(true);
    await waitForExitCleanup();
    expect(toastStore.toasts.value.map((t) => t.id)).toEqual(["c"]);
  });

  it("dismiss-by-type does not wipe a same-type toast after exit cleanup", async () => {
    toastStore.add({ id: "e1", title: "e1", type: "error" });
    toastStore.add({ id: "s1", title: "s1", type: "success" });
    toastStore.dismiss({ type: "error" }); // queue filter for error type
    // New error toast arrives during the exit window — must NOT be wiped.
    toastStore.add({ id: "e2", title: "e2", type: "error" });
    const ids = toastStore.toasts.value.map((t) => t.id);
    expect(ids).toContain("e2");
    expect(ids).toContain("s1");
    // e1 was captured for dismissal (still leaving during the window).
    expect(toastStore.toasts.value.some((t) => t.id === "e1")).toBe(true);
    // The leaving e1 must not be counted as active for the cap.
    expect(
      toastStore.toasts.value.filter((t) => !t.isLeaving).map((t) => t.id),
    ).toEqual(["e2", "s1"]);
    await waitForExitCleanup();
    expect(toastStore.toasts.value.map((t) => t.id)).toEqual(["e2", "s1"]);
  });

  it("dismissAll cannot delete a replacement with the same public id", async () => {
    toastStore.add({ id: "save", title: "old" });
    toastStore.dismiss();
    toastStore.add({ id: "save", title: "new" });

    await waitForExitCleanup();
    expect(toastStore.toasts.value).toHaveLength(1);
    expect(toastStore.toasts.value[0].title).toBe("new");
    expect(toastStore.toasts.value[0].isLeaving).toBe(false);
  });

  it("dismiss-by-id cannot delete a replacement with the same public id", async () => {
    toastStore.add({ id: "save", title: "old" });
    toastStore.dismiss("save");
    toastStore.add({ id: "save", title: "new" });

    await waitForExitCleanup();
    expect(toastStore.toasts.value).toHaveLength(1);
    expect(toastStore.toasts.value[0].title).toBe("new");
    expect(toastStore.toasts.value[0].isLeaving).toBe(false);
  });

  it("stale instance cleanup cannot delete a same-id replacement", () => {
    toastStore.add({ id: "swipe", title: "old" });
    const oldToast = toastStore.toasts.value[0];
    toastStore.dismiss("swipe");
    toastStore.add({ id: "swipe", title: "new" });

    toastStore.remove(oldToast);

    expect(toastStore.toasts.value).toHaveLength(1);
    expect(toastStore.toasts.value[0].title).toBe("new");
  });

  it("dismiss-by-type cannot delete a same-id replacement", async () => {
    toastStore.add({ id: "network", title: "old", type: "error" });
    toastStore.dismiss({ type: "error" });
    toastStore.add({ id: "network", title: "new", type: "error" });

    await waitForExitCleanup();
    expect(toastStore.toasts.value).toHaveLength(1);
    expect(toastStore.toasts.value[0].title).toBe("new");
  });

  it("dismissAll calls onDismiss once for every active toast", () => {
    const dismissed: string[] = [];
    toastStore.add({
      id: "a",
      title: "a",
      onDismiss: (id) => dismissed.push(id),
    });
    toastStore.add({
      id: "b",
      title: "b",
      onDismiss: (id) => dismissed.push(id),
    });

    toastStore.dismiss();
    toastStore.dismiss();

    expect(dismissed).toEqual(["b", "a"]);
  });
});
