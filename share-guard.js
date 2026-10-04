(() => {
  "use strict";

  function getShareToken() {
    const params = new URLSearchParams(location.search);
    const queryToken = params.get("share");
    if (queryToken) return queryToken;

    const hash = location.hash.replace(/^#/, "");
    if (!hash) return "";

    const hashParams = new URLSearchParams(hash);
    return hashParams.get("share") || "";
  }

  const token = getShareToken();

  if (!token) return;

  window.MiJuntitaSharedMode = true;
  document.documentElement.classList.add("mj-shared-mode-pending");

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    let url = "";

    try {
      url = new URL(
        typeof input === "string" ? input : input?.url,
        location.href
      ).toString();
    } catch {
      return nativeFetch(input, init);
    }

    const parsed = new URL(url);

    if (parsed.pathname.startsWith("/api/share")) {
      return nativeFetch(input, init);
    }

    if (parsed.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Vista compartida de solo lectura."
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    return nativeFetch(input, init);
  };
})();
