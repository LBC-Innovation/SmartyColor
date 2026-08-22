export function PwaShellScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){var h=document.documentElement;var ua=navigator.userAgent;var ios=/iphone|ipad|ipod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);var standalone=window.matchMedia("(display-mode: standalone)").matches||window.matchMedia("(display-mode: fullscreen)").matches||("standalone" in navigator&&navigator.standalone===true);if(ios)h.classList.add("ios");if(standalone)h.classList.add("standalone");})();`,
      }}
    />
  );
}

export function PwaSplashDismissScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){function hide(){document.documentElement.classList.add("pwa-splash-hiding");window.setTimeout(function(){document.documentElement.classList.add("pwa-splash-done");},220);}if(document.readyState==="complete"){hide();}else{window.addEventListener("load",hide,{once:true});}})();`,
      }}
    />
  );
}
