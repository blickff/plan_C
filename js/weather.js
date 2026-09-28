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
    var state = Storage.load();
    var key = Storage.today();
    if (!state.log[key]) state.log[key] = {};
    if (state.log[key].weather !== code) {
      state.log[key].weather = code;
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

  function askBrowser() {
    if (!navigator.geolocation) return Promise.reject();

    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      }, reject, { timeout: 8000 });
    });
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

    askBrowser().then(function (where) {
      return fetchFor(where.lat, where.lon, 'Here').then(function () {
        settings().place = { lat: where.lat, lon: where.lon, name: 'Here' };
        Storage.save();
      });
    }).catch(function () {
      if (!saved) show('Weather: set a city in Settings', false);
    });
  }

  return {
    start: start,
    lookUpCity: lookUpCity,
    describe: describe,
    isWet: isWet
  };
})();
