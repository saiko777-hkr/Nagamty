(() => {
  "use strict";

  const STORAGE_KEY = "naghamti-library-v1";
  const library = Array.isArray(window.MUSIC_LIBRARY) ? window.MUSIC_LIBRARY : [];
  const RECENT_TRACK_LIMIT = 20;
  const tracks = library.map((track, index) => ({
    id: String(track.id || track.src || `${track.title || "track"}-${index}`),
    title: track.title || "أغنية بدون اسم",
    artist: track.artist || "فنان غير معروف",
    src: track.src || "",
    download: track.download || track.src || "",
    fileName: track.fileName || "",
    genre: track.genre || "متنوع",
    album: track.album || "",
    cover: track.cover || coverFor(index),
    coverImage: track.coverImage || track.artwork || ""
  }));
  const audio = document.querySelector("#audio");
  const player = document.querySelector("#player");
  const searchInput = document.querySelector("#search-input");
  const trackList = document.querySelector("#track-list");
  const filterRow = document.querySelector("#filter-row");
  const emptyState = document.querySelector("#empty-state");
  const toast = document.querySelector("#toast");
  const sortSelect = document.querySelector("#sort-select");
  const playlistList = document.querySelector("#playlist-list");
  const menuToggle = document.querySelector("#menu-toggle");
  const siteMenu = document.querySelector("#site-menu");
  const arabicDigits = new Intl.NumberFormat("ar");
  const knownTrackIds = new Set(tracks.map((track) => track.id));
  let state = loadState();
  let activeGenre = "الكل";
  let activeCollection = { type: "all", id: "" };
  let activeTrack = null;
  let pendingPlayCountTrackId = "";
  let pendingPlaylistTrack = null;
  let shuffleEnabled = false;
  let repeatEnabled = false;
  let toastTimer;
  let storageWarningShown = false;

  function coverFor(index) {
    const covers = [
      "linear-gradient(135deg, #7757b7, #d47ea4)",
      "linear-gradient(135deg, #3e86a0, #7a75c8)",
      "linear-gradient(135deg, #bd795c, #e3b46d)",
      "linear-gradient(135deg, #587d68, #a8b86c)",
      "linear-gradient(135deg, #9b568a, #e09ba7)"
    ];
    return covers[index % covers.length];
  }

  function loadState() {
    const empty = { favorites: [], plays: {}, playlists: [], recentTrackIds: [] };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return empty;
      return {
        favorites: Array.isArray(saved.favorites)
          ? [...new Set(saved.favorites.filter((id) => typeof id === "string" && knownTrackIds.has(id)))]
          : [],
        plays: saved.plays && typeof saved.plays === "object" && !Array.isArray(saved.plays)
          ? Object.fromEntries(
              Object.entries(saved.plays).filter(([id, count]) => knownTrackIds.has(id) && Number.isSafeInteger(count) && count > 0)
            )
          : {},
        playlists: Array.isArray(saved.playlists)
          ? saved.playlists
              .filter((playlist) => playlist && typeof playlist.id === "string" && typeof playlist.name === "string")
              .map((playlist) => ({
                id: playlist.id,
                name: playlist.name,
                trackIds: Array.isArray(playlist.trackIds)
                  ? [...new Set(playlist.trackIds.filter((id) => typeof id === "string" && knownTrackIds.has(id)))]
                  : []
              }))
          : [],
        recentTrackIds: Array.isArray(saved.recentTrackIds)
          ? [...new Set(saved.recentTrackIds.filter((id) => typeof id === "string" && knownTrackIds.has(id)))].slice(0, RECENT_TRACK_LIMIT)
          : []
      };
    } catch {
      return empty;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      if (!storageWarningShown) {
        notify("تعذّر حفظ اختياراتك في هذا المتصفح.");
        storageWarningShown = true;
      }
      return false;
    }
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
  }

  function closeSiteMenu(restoreFocus = false) {
    siteMenu.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "فتح القائمة");
    if (restoreFocus) menuToggle.focus();
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "٠:٠٠";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function getDownloadName(track) {
    if (track.fileName) return track.fileName;
    if (!track.download) return `${track.title}.mp3`;
    try {
      return decodeURIComponent(new URL(track.download, document.baseURI).pathname.split("/").pop()) || `${track.title}.mp3`;
    } catch {
      return `${track.title}.mp3`;
    }
  }

  function setArtwork(element, track) {
    element.style.background = track.cover;
    element.replaceChildren();
    if (track.coverImage) {
      const image = document.createElement("img");
      image.src = track.coverImage;
      image.alt = "";
      image.addEventListener("error", () => {
        image.remove();
        notify(`تعذّر تحميل صورة غلاف ${track.title}.`);
      }, { once: true });
      element.append(image);
    } else {
      element.textContent = "♪";
    }
  }

  function getSortedTracks(source) {
    const result = [...source];
    const sort = sortSelect.value;
    if (sort === "title") result.sort((a, b) => a.title.localeCompare(b.title, "ar"));
    if (sort === "artist") result.sort((a, b) => a.artist.localeCompare(b.artist, "ar"));
    if (sort === "popular") result.sort((a, b) => (state.plays[b.id] || 0) - (state.plays[a.id] || 0));
    if (activeCollection.type === "recent" && sort === "default") {
      result.sort((a, b) => state.recentTrackIds.indexOf(a.id) - state.recentTrackIds.indexOf(b.id));
    }
    if (activeCollection.type === "popular" && sort === "default") {
      result.sort((a, b) => (state.plays[b.id] || 0) - (state.plays[a.id] || 0));
    }
    return result;
  }

  function getVisibleTracks() {
    const query = searchInput.value.trim().toLocaleLowerCase("ar");
    const playlist = state.playlists.find((item) => item.id === activeCollection.id);
    const filtered = tracks.filter((track) => {
      const matchesGenre = activeGenre === "الكل" || track.genre === activeGenre;
      const searchable = `${track.title} ${track.artist} ${track.album} ${track.genre}`.toLocaleLowerCase("ar");
      const matchesQuery = !query || searchable.includes(query);
      const matchesCollection =
        activeCollection.type === "all" ||
        (activeCollection.type === "favorites" && state.favorites.includes(track.id)) ||
        (activeCollection.type === "popular" && (state.plays[track.id] || 0) > 0) ||
        (activeCollection.type === "recent" && state.recentTrackIds.includes(track.id)) ||
        (activeCollection.type === "playlist" && Boolean(playlist?.trackIds.includes(track.id)));
      return matchesGenre && matchesQuery && matchesCollection;
    });
    return getSortedTracks(filtered);
  }

  function renderFilters() {
    const genres = ["الكل", ...new Set(tracks.map((track) => track.genre).filter(Boolean))];
    filterRow.replaceChildren();
    genres.forEach((genre) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-chip${activeGenre === genre ? " active" : ""}`;
      button.textContent = genre;
      button.setAttribute("aria-pressed", String(activeGenre === genre));
      button.addEventListener("click", () => {
        activeGenre = genre;
        renderFilters();
        renderTracks();
      });
      filterRow.append(button);
    });
  }

  function renderCollectionControls() {
    const collections = [
      ["all-tracks", "all"],
      ["favorites-filter", "favorites"],
      ["popular-filter", "popular"],
      ["recent-filter", "recent"]
    ];
    collections.forEach(([id, type]) => {
      const button = document.querySelector(`#${id}`);
      const active = activeCollection.type === type;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll(".playlist-chip").forEach((button) => {
      const active = activeCollection.type === "playlist" && activeCollection.id === button.dataset.playlistId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderPlaylists() {
    playlistList.replaceChildren();
    if (state.playlists.length === 0) {
      const note = document.createElement("p");
      note.className = "playlist-empty";
      note.textContent = "أنشئ قائمة واجمع فيها أغانيك المفضلة. القوائم محفوظة على جهازك.";
      playlistList.append(note);
      return;
    }
    state.playlists.forEach((playlist) => {
      const item = document.createElement("div");
      item.className = "playlist-item";
      const select = document.createElement("button");
      select.type = "button";
      select.className = "filter-chip playlist-chip";
      select.dataset.playlistId = playlist.id;
      select.textContent = `${playlist.name} · ${arabicDigits.format(playlist.trackIds.length)}`;
      select.setAttribute("aria-pressed", String(activeCollection.type === "playlist" && activeCollection.id === playlist.id));
      select.addEventListener("click", () => {
        activeCollection = { type: "playlist", id: playlist.id };
        renderCollectionControls();
        renderTracks();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "playlist-remove";
      remove.textContent = "×";
      remove.title = `حذف قائمة ${playlist.name}`;
      remove.setAttribute("aria-label", `حذف قائمة ${playlist.name}`);
      remove.addEventListener("click", () => {
        state.playlists = state.playlists.filter((itemToKeep) => itemToKeep.id !== playlist.id);
        if (activeCollection.type === "playlist" && activeCollection.id === playlist.id) {
          activeCollection = { type: "all", id: "" };
        }
        saveState();
        renderPlaylists();
        renderCollectionControls();
        renderTracks();
        notify(`تم حذف قائمة ${playlist.name}.`);
      });
      item.append(select, remove);
      playlistList.append(item);
    });
  }

  function makeButton(className, label, icon, pressed, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", label);
    button.title = label;
    if (pressed !== undefined) button.setAttribute("aria-pressed", String(pressed));
    button.textContent = icon;
    if (onClick) button.addEventListener("click", onClick);
    return button;
  }

  function renderTracks() {
    const visibleTracks = getVisibleTracks();
    const count = visibleTracks.length;
    document.querySelector("#track-count").textContent = `${arabicDigits.format(count)} ${count === 1 ? "أغنية" : "أغاني"}`;
    trackList.replaceChildren();
    visibleTracks.forEach((track) => {
      const row = document.createElement("article");
      row.className = `track-row glass-card${activeTrack?.id === track.id ? " is-playing" : ""}`;
      const cover = document.createElement("div");
      cover.className = "track-cover";
      cover.setAttribute("aria-hidden", "true");
      setArtwork(cover, track);

      const main = document.createElement("div");
      main.className = "track-main";
      const title = document.createElement("span");
      title.className = "track-name";
      title.textContent = track.title;
      const artist = document.createElement("span");
      artist.className = "track-artist";
      artist.textContent = track.artist;
      main.append(title, artist);

      const details = document.createElement("div");
      details.className = "track-details";
      const genre = document.createElement("span");
      genre.className = "track-genre";
      genre.textContent = track.genre;
      const duration = document.createElement("span");
      duration.className = "track-duration";
      duration.textContent = track.duration ? formatTime(track.duration) : "—:—";
      details.append(genre);
      if (track.album) {
        const album = document.createElement("span");
        album.className = "track-album";
        album.textContent = track.album;
        album.title = `الألبوم: ${track.album}`;
        details.append(album);
      }
      details.append(duration);

      const actions = document.createElement("div");
      actions.className = "track-actions";
      const isFavorite = state.favorites.includes(track.id);
      actions.append(makeButton("track-action favorite-action", isFavorite ? "إزالة من المفضلة" : "أضف للمفضلة", "♥", isFavorite, () => {
        state.favorites = isFavorite
          ? state.favorites.filter((id) => id !== track.id)
          : [...state.favorites, track.id];
        saveState();
        renderTracks();
        renderCollectionControls();
      }));

      actions.append(makeButton("track-action playlist-action", "أضف لقائمة تشغيل", "＋", undefined, () => openAddToPlaylist(track)));
      if (activeCollection.type === "playlist") {
        actions.append(makeButton("track-action remove-playlist-action", "احذف من قائمة التشغيل", "−", undefined, () => {
          const playlist = state.playlists.find((item) => item.id === activeCollection.id);
          if (!playlist) return;
          playlist.trackIds = playlist.trackIds.filter((id) => id !== track.id);
          saveState();
          renderPlaylists();
          renderTracks();
        }));
      }
      const playCount = state.plays[track.id] || 0;
      if (playCount) {
        const plays = document.createElement("span");
        plays.className = "track-play-count";
        plays.textContent = `${arabicDigits.format(playCount)} استماع على جهازك`;
        details.append(plays);
      }

      const play = makeButton("track-play", activeTrack?.id === track.id && !audio.paused ? "إيقاف مؤقت" : `استمع إلى ${track.title}`, "", undefined, () => playTrack(track));
      play.innerHTML = activeTrack?.id === track.id && !audio.paused
        ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-13Z"/></svg><span class="track-action-label">إيقاف</span>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8c0-.8.9-1.3 1.6-.9l9.1 5.6a1.7 1.7 0 0 1 0 2.9l-9.1 5.6c-.7.4-1.6-.1-1.6-.9V5.8Z"/></svg><span class="track-action-label">تشغيل</span>';

      const download = document.createElement("a");
      download.className = "track-download";
      download.href = track.download || "#";
      download.download = getDownloadName(track);
      download.setAttribute("aria-label", `حمّل ${track.title}`);
      download.title = "تحميل MP3";
      download.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="track-action-label">تحميل</span>';
      if (!track.download) {
        download.setAttribute("aria-disabled", "true");
        download.addEventListener("click", (event) => {
          event.preventDefault();
          notify("ملف التحميل غير متاح حاليًا.");
        });
      }
      actions.append(play, download);
      row.append(cover, main, details, actions);
      trackList.append(row);
    });

    emptyState.hidden = visibleTracks.length > 0;
    trackList.hidden = visibleTracks.length === 0;
    if (!tracks.length) {
      document.querySelector("#empty-title").textContent = "المكتبة لسه بتستعد";
      document.querySelector("#empty-copy").textContent = "الأغاني الجديدة هتظهر هنا قريبًا. ارجع تاني واكتشف موسيقى على مزاجك.";
    } else if (activeCollection.type === "favorites" && visibleTracks.length === 0 && !searchInput.value.trim()) {
      document.querySelector("#empty-title").textContent = "لسه مفيش أغاني مفضلة";
      document.querySelector("#empty-copy").textContent = "اضغط على علامة القلب جنب أي أغنية عشان تحفظها هنا على جهازك.";
    } else if (activeCollection.type === "recent" && visibleTracks.length === 0 && !searchInput.value.trim()) {
      document.querySelector("#empty-title").textContent = "لسه مفيش أغاني في سجل الاستماع";
      document.querySelector("#empty-copy").textContent = "الأغاني اللي يبدأ تشغيلها هتظهر هنا، والسجل محفوظ على جهازك.";
    } else {
      document.querySelector("#empty-title").textContent = searchInput.value.trim() ? "مفيش نتائج للبحث ده" : "مفيش أغاني في الاختيار ده";
      document.querySelector("#empty-copy").textContent = searchInput.value.trim()
        ? "جرّب كلمة تانية أو امسح البحث عشان تشوف كل الأغاني."
        : "اختار تصنيف أو قائمة تانية عشان تستكشف باقي المكتبة.";
    }
  }

  function updatePlayerArtwork(track) {
    setArtwork(document.querySelector("#player-art"), track);
    document.querySelector("#player-title").textContent = track.title;
    document.querySelector("#player-artist").textContent = track.artist;
  }

  async function playTrack(track, countPlay = false) {
    if (!track.src) {
      notify("ملف الأغنية غير موجود. راجع المسار في songs.js.");
      return;
    }
    if (activeTrack?.id === track.id && !audio.paused) {
      audio.pause();
      return;
    }
    const isNewTrack = activeTrack?.id !== track.id;
    if (isNewTrack) {
      activeTrack = track;
      audio.src = track.src;
      updatePlayerArtwork(track);
      player.hidden = false;
      document.querySelector("#progress").value = "0";
      document.querySelector("#current-time").textContent = formatTime(0);
      document.querySelector("#total-time").textContent = track.duration ? formatTime(track.duration) : formatTime(0);
    }
    if (isNewTrack || countPlay) pendingPlayCountTrackId = track.id;
    try {
      await audio.play();
    } catch {
      if (pendingPlayCountTrackId === track.id) pendingPlayCountTrackId = "";
      notify("تعذّر تشغيل الملف. تأكد من صيغة الأغنية ومسارها.");
    }
  }

  function openCreatePlaylist() {
    const dialog = document.querySelector("#create-playlist-dialog");
    document.querySelector("#playlist-name").value = "";
    dialog.showModal();
    document.querySelector("#playlist-name").focus();
  }

  function openAddToPlaylist(track) {
    if (!state.playlists.length) {
      notify("أنشئ قائمة تشغيل الأول، وبعدها أضف لها الأغاني.");
      openCreatePlaylist();
      return;
    }
    pendingPlaylistTrack = track;
    const select = document.querySelector("#playlist-select");
    select.replaceChildren();
    state.playlists.forEach((playlist) => {
      const option = document.createElement("option");
      option.value = playlist.id;
      option.textContent = playlist.name;
      select.append(option);
    });
    document.querySelector("#add-to-playlist-title").textContent = track.title;
    document.querySelector("#add-to-playlist-dialog").showModal();
  }

  function selectCollection(type, id = "") {
    activeCollection = { type, id };
    activeGenre = "الكل";
    renderFilters();
    renderCollectionControls();
    renderTracks();
  }

  function playRelativeTrack(direction) {
    const queue = getVisibleTracks();
    if (!queue.length) return;
    const currentIndex = queue.findIndex((track) => track.id === activeTrack?.id);
    let nextIndex = currentIndex + direction;
    if (shuffleEnabled && direction > 0 && queue.length > 1) {
      const alternatives = queue.filter((track) => track.id !== activeTrack?.id);
      playTrack(alternatives[Math.floor(Math.random() * alternatives.length)]);
      return;
    }
    if (currentIndex === -1) nextIndex = direction > 0 ? 0 : queue.length - 1;
    if (nextIndex < 0 || nextIndex >= queue.length) {
      if (!repeatEnabled) return;
      nextIndex = direction > 0 ? 0 : queue.length - 1;
    }
    playTrack(queue[nextIndex]);
  }

  document.querySelector("#all-tracks").addEventListener("click", () => selectCollection("all"));
  document.querySelector("#favorites-filter").addEventListener("click", () => selectCollection("favorites"));
  document.querySelector("#popular-filter").addEventListener("click", () => selectCollection("popular"));
  document.querySelector("#recent-filter").addEventListener("click", () => selectCollection("recent"));
  menuToggle.addEventListener("click", () => {
    const shouldOpen = siteMenu.hidden;
    siteMenu.hidden = !shouldOpen;
    menuToggle.setAttribute("aria-expanded", String(shouldOpen));
    menuToggle.setAttribute("aria-label", shouldOpen ? "إغلاق القائمة" : "فتح القائمة");
  });
  siteMenu.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) closeSiteMenu();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!siteMenu.hidden && !siteMenu.contains(event.target) && !menuToggle.contains(event.target)) {
      closeSiteMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !siteMenu.hidden) closeSiteMenu(true);
  });
  document.querySelector("#create-playlist").addEventListener("click", openCreatePlaylist);
  document.querySelector("#create-playlist-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#playlist-name");
    const name = input.value.trim();
    if (!name) return;
    const duplicate = state.playlists.some((playlist) => playlist.name.toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar"));
    if (duplicate) {
      notify("فيه قائمة بنفس الاسم بالفعل.");
      input.focus();
      return;
    }
    const playlist = { id: `playlist-${Date.now()}-${Math.random().toString(36).slice(2)}`, name, trackIds: [] };
    state.playlists.push(playlist);
    saveState();
    document.querySelector("#create-playlist-dialog").close();
    renderPlaylists();
    renderCollectionControls();
    notify(`تم إنشاء قائمة ${name}.`);
  });
  document.querySelector("#add-to-playlist-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const playlist = state.playlists.find((item) => item.id === document.querySelector("#playlist-select").value);
    if (!playlist || !pendingPlaylistTrack) return;
    if (playlist.trackIds.includes(pendingPlaylistTrack.id)) {
      notify("الأغنية موجودة بالفعل في القائمة دي.");
    } else {
      playlist.trackIds.push(pendingPlaylistTrack.id);
      saveState();
      renderPlaylists();
      notify(`اتضافت الأغنية لقائمة ${playlist.name}.`);
    }
    document.querySelector("#add-to-playlist-dialog").close();
    pendingPlaylistTrack = null;
  });
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog").close());
  });
  searchInput.addEventListener("input", renderTracks);
  sortSelect.addEventListener("change", renderTracks);
  document.querySelector("#search-form").addEventListener("submit", (event) => event.preventDefault());
  document.querySelector("#play-toggle").addEventListener("click", () => {
    if (!activeTrack) return;
    if (audio.paused) {
      playTrack(activeTrack, audio.ended);
    } else {
      audio.pause();
    }
  });
  document.querySelector("#previous-track").addEventListener("click", () => {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    playRelativeTrack(-1);
  });
  document.querySelector("#next-track").addEventListener("click", () => playRelativeTrack(1));
  document.querySelector("#shuffle-toggle").addEventListener("click", (event) => {
    shuffleEnabled = !shuffleEnabled;
    event.currentTarget.setAttribute("aria-pressed", String(shuffleEnabled));
    event.currentTarget.classList.toggle("active", shuffleEnabled);
    notify(shuffleEnabled ? "التشغيل العشوائي مفعّل." : "التشغيل العشوائي متوقف.");
  });
  document.querySelector("#repeat-toggle").addEventListener("click", (event) => {
    repeatEnabled = !repeatEnabled;
    event.currentTarget.setAttribute("aria-pressed", String(repeatEnabled));
    event.currentTarget.classList.toggle("active", repeatEnabled);
    notify(repeatEnabled ? "تكرار الأغنية مفعّل." : "تكرار الأغنية متوقف.");
  });
  document.querySelector("#progress").addEventListener("input", (event) => {
    if (Number.isFinite(audio.duration)) audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
  });
  document.querySelector("#volume").addEventListener("input", (event) => {
    audio.volume = Number(event.target.value);
  });
  audio.volume = 0.8;
  audio.addEventListener("loadedmetadata", () => {
    if (!activeTrack) return;
    activeTrack.duration = audio.duration;
    document.querySelector("#total-time").textContent = formatTime(audio.duration);
    renderTracks();
  });
  audio.addEventListener("timeupdate", () => {
    document.querySelector("#current-time").textContent = formatTime(audio.currentTime);
    document.querySelector("#progress").value = audio.duration ? String((audio.currentTime / audio.duration) * 100) : "0";
  });
  audio.addEventListener("play", () => {
    player.classList.add("playing");
    document.querySelector("#play-toggle").setAttribute("aria-label", "إيقاف مؤقت");
    document.querySelector("#play-toggle").title = "إيقاف مؤقت";
    renderTracks();
  });
  audio.addEventListener("playing", () => {
    if (!activeTrack) return;
    state.recentTrackIds = [activeTrack.id, ...state.recentTrackIds.filter((id) => id !== activeTrack.id)].slice(0, RECENT_TRACK_LIMIT);
    if (pendingPlayCountTrackId === activeTrack.id) {
      state.plays[activeTrack.id] = (state.plays[activeTrack.id] || 0) + 1;
      pendingPlayCountTrackId = "";
    }
    saveState();
    renderCollectionControls();
    renderTracks();
  });
  audio.addEventListener("pause", () => {
    player.classList.remove("playing");
    document.querySelector("#play-toggle").setAttribute("aria-label", "تشغيل");
    document.querySelector("#play-toggle").title = "تشغيل";
    renderTracks();
  });
  audio.addEventListener("ended", () => {
    if (repeatEnabled && activeTrack) {
      audio.currentTime = 0;
      playTrack(activeTrack, true);
      return;
    }
    playRelativeTrack(1);
  });
  audio.addEventListener("error", () => {
    player.classList.remove("playing");
    document.querySelector("#play-toggle").setAttribute("aria-label", "تشغيل");
    document.querySelector("#play-toggle").title = "تشغيل";
    if (activeTrack && pendingPlayCountTrackId === activeTrack.id) pendingPlayCountTrackId = "";
    if (activeTrack) notify("تعذّر تحميل الملف. تأكد من وجوده داخل مجلد الموقع.");
    renderTracks();
  });

  renderFilters();
  renderPlaylists();
  renderCollectionControls();
  renderTracks();
})();
