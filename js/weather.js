/* Weather from Open-Meteo: no key, no sign-up, CORS open.

   Two jobs. The visible one is the line in the top bar. The quiet one
   matters more: today's weather code is written into the log next to the
   habits, because stage 6 can only compare rain against habits if the
   rain was recorded on the day it happened. Forecasts cannot be looked
   up backwards for free, so if it is not saved now it is gone. */

var Weather = (function () {
  var FORECAST = 'https://api.open-meteo.com/v1/forecast';
  var GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
  var FRESH_FOR = 60 * 60 * 1000;

  /* WMO weather codes, folded into the handful of groups worth telling
     apart. The full table has 28 entries and no one needs "slight or
     moderate drizzle" on a dashboard. */
  function describe(code) {
    if (code === 0) return 'Clear';
    if (code <= 2) return 'Partly cloudy';
    if (code === 3) return 'Overcast';
    if (code <= 48) return 'Fog';
    if (code <= 57) return 'Drizzle';
    if (code <= 67) return 'Rain';
    if (code <= 77) return 'Snow';
    if (code <= 82) return 'Showers';
    if (code <= 86) return 'Snow showers';
    return 'Thunderstorm';
  }

  /* Rain-ish, for the correlations in stage 6. */
  function isWet(code) {
    return code >= 51 && code <= 86 || code >= 95;
  }

  function settings() {
    return Storage.load().settings;
  }

  function show(text, stale) {
    var el = document.getElementById('weather');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-stale', !!stale);
  }

  /* Written next to the habits so the day keeps its own weather. */
  function remember(code) {
    var day = Storage.day(Storage.today(), true);
    if (day.weather !== code) {
      day.weather = code;
      Storage.save();
    }
  }

  function render(cached) {
    var stale = Date.now() - cached.at > FRESH_FOR;
    show(Math.round(cached.temp) + '° ' + describe(cached.code) +
      ' · ' + cached.place + (stale ? ' (old)' : ''), stale);
  }

  function fetchFor(lat, lon, place) {
    var url = FORECAST + '?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code&timezone=auto';

    return fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        var cached = {
          temp: data.current.temperature_2m,
          code: data.current.weather_code,
          place: place,
          at: Date.now()
        };
        settings().weather = cached;
        Storage.save();
        remember(cached.code);
        render(cached);
        /* The widget shows the weather in its top line, which can take
           the line from nothing to a row of text: it redraws and is made
           tall enough again, instead of cutting off its last line. */
        if (typeof window.repaint === 'function') window.repaint();
      });
  }

  function lookUpCity(name) {
    return fetch(GEOCODE + '?name=' + encodeURIComponent(name) + '&count=1')
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (!data.results || !data.results.length) return 'No city by that name.';

        var hit = data.results[0];
        settings().place = { lat: hit.latitude, lon: hit.longitude, name: hit.name };
        Storage.save();
        return fetchFor(hit.latitude, hit.longitude, hit.name).then(function () { return null; });
      })
      .catch(function () { return 'Could not reach the weather service.'; });
  }


  /* Finding the city ------------------------------------------------

     Two ways, tried in order. The browser's own location is precise but
     needs permission and, inside Electron, an API key that this app does
     not have — so it usually declines. Looking the city up from the
     internet address needs neither, and a city is all the weather needs.

     Both are asked about first. Either one tells a third party something
     about where this computer is, and that is not a thing to do quietly
     on someone's behalf. Once answered, the question is not asked again. */

  function askedAlready() {
    return !!settings().locationAsked;
  }

  function rememberAsked() {
    settings().locationAsked = true;
    Storage.save();
  }

  /* Raced against a timer of our own. getCurrentPosition takes a
     timeout, but inside Electron without a Google key it can answer
     neither way and simply never call back — and a promise that never
     settles leaves the button saying 'Looking…' forever. */
  function withDeadline(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_resolve, reject) {
        setTimeout(function () { reject(new Error('timed out')); }, ms);
      })
    ]);
  }

  function byBrowser() {
    if (!navigator.geolocation) return Promise.reject();
    return withDeadline(new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: null });
      }, reject, { timeout: 6000 });
    }), 7000);
  }

  /* No key, no sign-up. Accurate to the city, which is the resolution
     the weather is reported at anyway. */
  function byAddress() {
    return fetch('https://ipwho.is/?fields=success,city,latitude,longitude')
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (!data || !data.success) throw new Error('lookup failed');
        return { lat: data.latitude, lon: data.longitude, name: data.city };
      });
  }

  /* Resolves with the place found, or null if nothing worked. */
  function detect() {
    return byBrowser()
      .then(function (where) {
        /* Coordinates without a name: ask Open-Meteo what is there, so
           the panel can say Kyiv rather than a pair of numbers. */
        return fetch(GEOCODE + '?latitude=' + where.lat + '&longitude=' + where.lon + '&count=1')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            var hit = data && data.results && data.results[0];
            where.name = hit ? hit.name : 'Here';
            return where;
          })
          .catch(function () { where.name = 'Here'; return where; });
      })
      .catch(function () { return withDeadline(byAddress(), 8000); })
      .then(function (where) {
        settings().place = { lat: where.lat, lon: where.lon, name: where.name };
        Storage.save();
        return fetchFor(where.lat, where.lon, where.name).then(function () { return where; });
      })
      .catch(function () { return null; });
  }

  function start() {
    var saved = settings().weather;

    /* Something on screen immediately, even if it is an hour old: the
       network call can then quietly replace it. */
    if (saved) {
      render(saved);
      if (Date.now() - saved.at < FRESH_FOR) return;
    } else {
      show('Weather: set a city in Settings', false);
    }

    var place = settings().place;
    if (place) {
      fetchFor(place.lat, place.lon, place.name).catch(function () {
        /* Offline is not a crash. Whatever was last known stays up. */
        if (saved) render(saved);
        else show('Weather unavailable', true);
      });
      return;
    }

    /* No city, and none is guessed at here. Startup used to reach for
       the device's location on its own, which meant the operating system
       put up its own permission prompt before the panel had asked
       anything — and inside Electron that request can hang, leaving the
       page half-initialised. Finding the city is now only ever started
       by pressing the button. */
    show('Weather: set a city in Settings', false);
  }

  return {
    start: start,
    detect: detect,
    askedAlready: askedAlready,
    rememberAsked: rememberAsked,
    lookUpCity: lookUpCity,
    describe: describe,
    isWet: isWet
  };
})();
