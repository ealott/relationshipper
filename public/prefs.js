// Applies this device's display preferences to <html> before the first paint, so the page never
// flashes the wrong theme. It's a classic script in <head> because the CSP allows no inline
// scripts. Settings stores the preferences (src/lib/prefs.ts) and calls rsApplyPrefs().
(function () {
  var root = document.documentElement;
  var darkScheme = matchMedia('(prefers-color-scheme: dark)');
  var lessMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function pref(name, fallback) {
    try {
      return localStorage.getItem('rs:pref:' + name) || fallback;
    } catch (e) {
      return fallback; // storage can be unavailable, as in some private modes
    }
  }

  function apply() {
    var theme = pref('theme', 'system');
    var motion = pref('motion', 'system');
    var dark = theme === 'dark' || (theme !== 'light' && darkScheme.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.motion = motion === 'reduced' || (motion !== 'full' && lessMotion.matches) ? 'reduced' : 'full';
    root.dataset.text = pref('text', 'default');
    root.dataset.tips = pref('tips', 'on');
    root.dataset.streak = pref('streak', 'on');
    // The page background (--bg in styles.css), for the browser's toolbar and status bar.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#15120f' : '#f8f4ee');
  }

  apply();
  darkScheme.addEventListener('change', apply);
  lessMotion.addEventListener('change', apply);
  // A preference changed in another tab.
  addEventListener('storage', function (e) {
    if (e.key === null || e.key.indexOf('rs:pref:') === 0) apply();
  });
  window.rsApplyPrefs = apply;
})();
