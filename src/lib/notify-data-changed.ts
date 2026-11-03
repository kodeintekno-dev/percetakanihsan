"use client";
export function notifyDataChanged() {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("ihsan-data-changed");
    channel.postMessage("changed");
    channel.close();
  }
}
