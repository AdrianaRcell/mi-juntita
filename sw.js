const CACHE_NAME = "mi-juntita-v6";

const STATIC_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});


self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});


self.addEventListener("fetch", event => {

  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  /*
    APIs:
    nunca usar caché.
  */
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  /*
    JavaScript:
    siempre pedir la versión actual.
  */
  if (
    url.pathname.endsWith(".js")
  ) {
    event.respondWith(
      fetch(request, {
        cache: "no-store"
      }).catch(() =>
        caches.match(request)
      )
    );

    return;
  }

  /*
    Navegación:
    primero intenta obtener index.html actual.
    Solo usa caché si no hay conexión.
  */
  if (request.mode === "navigate") {

    event.respondWith(
      fetch(request, {
        cache: "no-store"
      })
        .then(response => {

          const copy =
            response.clone();

          caches.open(CACHE_NAME)
            .then(cache =>
              cache.put(
                "./index.html",
                copy
              )
            );

          return response;
        })
        .catch(() =>
          caches.match("./index.html")
        )
    );

    return;
  }

  /*
    CSS y recursos estáticos:
    usamos caché, pero actualizamos cuando
    la red entrega una versión nueva.
  */
  event.respondWith(
    caches.match(request)
      .then(cached => {

        const network =
          fetch(request)
            .then(response => {

              if (
                response &&
                response.status === 200
              ) {

                const copy =
                  response.clone();

                caches.open(CACHE_NAME)
                  .then(cache =>
                    cache.put(
                      request,
                      copy
                    )
                  );
              }

              return response;
            })
            .catch(() =>
              cached
            );

        return cached || network;
      })
  );
});
