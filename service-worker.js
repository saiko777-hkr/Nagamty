"use strict";

const CACHE_NAME = "naghamti-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./songs.js",
  "./app.js",
  "./pwa.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("naghamti-shell-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  const isAppShellRequest = APP_SHELL.some((asset) => new URL(asset, self.registration.scope).href === request.url);
  if (!isAppShellRequest) return;

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => cachedResponse || fetch(request))
      .catch(async (error) => {
        if (request.mode === "navigate") {
          const cachedPage = await caches.match("./index.html");
          if (cachedPage) return cachedPage;
        }
        throw error;
      })
  );
});
