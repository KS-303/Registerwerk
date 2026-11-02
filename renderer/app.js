

(() => {
  'use strict';
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const app = {
    port: null,
    transportMode: 'rtu',
    tcpSessionId: null,
    reader: null,
    writer: null,
    readerTask: null,
    pending: null,
    rxBuffer: [],
    lastBusActivity: 0,
    connected: false,
    connecting: false,
    updateInstalling: false,
    running: false,
    stopRequested: false,
    stopReason: null,
    scanning: false,
    scanStop: false,
    writing: false,
    blockReading: false,
    points: [],
    projectInfo: { deviceName: '', notes: '' },
    projectLoaded: false,
    lastStart: 0,
    blockedUntil: 0,
    writeSpec: null,
    saveTimer: null,
    cooldowns: new Map(),
    runErrors: new Map(),
    exchanging: false,
    resyncing: false,
    cancelResync: false,
  };
  const types = [
    'UINT16',
    'INT16',
    'UINT32 ABCD',
    'UINT32 BADC',
    'UINT32 CDAB',
    'UINT32 DCBA',
    'INT32 ABCD',
    'INT32 BADC',
    'INT32 CDAB',
    'INT32 DCBA',
    'FLOAT32 ABCD',
    'FLOAT32 BADC',
    'FLOAT32 CDAB',
    'FLOAT32 DCBA',
    'HEX16',
    'BOOL',
  ];
  const readFns = [
    ['03', '03 · Holding Register (4xxxx)'],
    ['04', '04 · Input Register (3xxxx)'],
    ['01', '01 · Coil (0xxxx)'],
    ['02', '02 · Discrete Input (1xxxx)'],
  ];
  const $log = $('#log');
  const makeId = () =>
    globalThis.crypto?.randomUUID
      ? crypto.randomUUID()
      : 'rw-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const TAB_ID = makeId();
  const LEGACY_KEY = 'registerwerk-local-project';
  const LOCAL_PREFIX = LEGACY_KEY + ':';
  const LOCAL_KEY = LOCAL_PREFIX + TAB_ID;
  const DEFAULT_SETTINGS = {
    transport: 'rtu',
    tcpHost: '',
    tcpPort: 502,
    baud: 9600,
    parity: 'none',
    dataBits: 8,
    stopBits: 1,
    timeout: 1200,
    guard: 180,
    pollDelay: 250,
    roundDelay: 1000,
    regOffset: 0,
    addressBase: 'zero',
    scanFrom: 1,
    scanTo: 247,
    scanAddress: 0,
    scanTimeout: 250,
    skipErrors: true,
    sameDeviceAddress: false,
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function transactionError(message, code) {
    return Object.assign(fail(message), { code });
  }

  function silenceMs() {
    return Number($('#baud').value) > 19200 ? 1.75 : charTimeMs() * 3.5;
  }

  function channelKey(device, fc) {
    return `${device}:${fc}`;
  }

  function matchesPending(candidate, p) {
    if (candidate[0] !== p.device) return false;
    if (candidate[1] === (p.func | 128)) return candidate.length === 5;
    if (candidate[1] !== p.func) return false;
    const request = p.request;
    if ([1, 2, 3, 4].includes(p.func)) {
      const qty = (request[4] << 8) | request[5];
      const bytes = [1, 2].includes(p.func) ? Math.ceil(qty / 8) : qty * 2;
      return candidate[2] === bytes && candidate.length === bytes + 5;
    }
    return candidate.length === 8 && candidate.slice(2, 6).every((v, i) => v === request[i + 2]);
  }

  async function waitBusReady(port, key = null, effectiveTimeout = 0) {
    const cooldown = key ? app.cooldowns.get(key) : null;
    const quietMs = cooldown ? Math.max(250, cooldown.timeout, effectiveTimeout) : 0;
    const baseTimeout = Math.max(100, effectiveTimeout || Number($('#timeout').value) || 1200, quietMs);
    // A deliberately longer fixed error guard must not be misreported as bus noise.
    const maxWaitMs = Math.max(3 * baseTimeout, Math.max(0, app.blockedUntil - Date.now())),
      started = performance.now();
    let waited = false;
    while (true) {
      if (!app.connected || app.port !== port)
        throw transactionError('Verbindung wurde getrennt.', 'CANCELLED');
      if (
        (app.running && app.stopRequested) ||
        (app.scanning && app.scanStop) ||
        (app.resyncing && app.cancelResync)
      )
        throw transactionError('Abfrage manuell abgebrochen.', 'CANCELLED');
      const quietUntil = cooldown ? Math.max(cooldown.since, app.lastBusActivity) + quietMs : 0;
      const wait = Math.ceil(
        Math.max(app.blockedUntil, app.lastBusActivity + silenceMs(), quietUntil) - Date.now(),
      );
      if (wait <= 0) {
        if (cooldown) {
          app.cooldowns.delete(key);
          app.rxBuffer = [];
        }
        $('#recoveryState').textContent = 'Bus bereit';
        const elapsed = Math.round(performance.now() - started);
        if (cooldown && waited && elapsed >= 20)
          log(`Busruhe nach ${elapsed} ms Wartezeit erreicht · ${key}.`);
        return;
      }
      const elapsed = performance.now() - started;
      if (elapsed >= maxWaitMs) {
        const message = `Bus nicht ruhig: Innerhalb von ${maxWaitMs} ms wurde keine ausreichende Ruhephase erkannt. Keine Anfrage gesendet. Busverdrahtung, Bias und weitere sendende Teilnehmer prüfen.`;
        $('#recoveryState').textContent = 'Bus nicht ruhig · keine Anfrage gesendet';
        log(message, 'error');
        throw Object.assign(transactionError(message, 'BUS_NOT_IDLE'), {
          timeoutMs: baseTimeout,
          waitedMs: Math.round(elapsed),
        });
      }
      if (!waited) {
        $('#recoveryState').textContent =
          `Warte auf ${quietMs || Math.ceil(silenceMs())} ms Busruhe · höchstens ${maxWaitMs} ms`;
        waited = true;
      }
      await sleep(Math.max(1, Math.min(wait, 100, maxWaitMs - elapsed)));
    }
  }

  async function releaseBus() {
    if (
      !app.connected ||
      app.running ||
      app.scanning ||
      app.writing ||
      app.blockReading ||
      app.exchanging ||
      app.resyncing
    )
      return;
    const timeout = Math.max(
      250,
      Number($('#timeout').value) || 1200,
      ...[...app.cooldowns.values()].map((x) => x.timeout),
    );
    const key = 'manuelle Freigabe',
      port = app.port;
    app.cooldowns.set(key, { since: Date.now(), timeout });
    app.cancelResync = false;
    app.resyncing = true;
    configureControls();
    try {
      await waitBusReady(port, key, timeout);
      app.cooldowns.clear();
      app.rxBuffer = [];
      $('#recoveryState').textContent = 'Bus freigegeben · bereit für neue Abfragen';
      log('Bus nach beobachteter Ruhezeit freigegeben. Es wurde kein Telegramm gesendet.', 'ok');
    } catch (e) {
      $('#recoveryState').textContent =
        e.code === 'BUS_NOT_IDLE' ? 'Bus nicht ruhig · Freigabe abgebrochen' : 'Freigabe abgebrochen';
      if (e.code !== 'CANCELLED') showTopError(e.message);
      else if (app.connected) log('Busfreigabe manuell abgebrochen.');
    } finally {
      app.cooldowns.delete(key);
      app.cancelResync = false;
      app.resyncing = false;
      configureControls();
    }
  }

  function renderRunErrors() {
    if (!app.runErrors.size) {
      clearTopError();
      return;
    }
    const rows = [...app.runErrors.values()],
      devices = [...new Set(rows.map((x) => x.device))];
    const lines = rows.slice(0, 8).map((x) => `• ${x.name} (Gerät ${x.device}): ${x.message}`);
    if (rows.length > 8)
      lines.push(`… ${rows.length - 8} weitere Datenpunkte; Details stehen an den Zeilen und im Protokoll.`);
    showTopError(
      `${rows.length} Datenpunkt(e) mit Fehler/Überspringen · Geräte: ${devices.join(', ')}\n${lines.join('\n')}`,
    );
  }

  function pointFailed(p, message) {
    p.value = '—';
    p.raw = '—';
    mark(p, message, 'fail');
    app.runErrors.set(p.id, { device: p.device, name: p.name, message });
    renderRunErrors();
  }

  function handlePointChange(e) {
    const tr = e.target.closest('tr');
    if (!tr || app.running || app.scanning || app.writing || app.blockReading || app.resyncing) return;
    const point = app.points.find((p) => p.id === tr.dataset.id),
      previousFunc = point?.func;
    sync(tr);
    if (e.target.classList.contains('function-select') && point) {
      if (['01', '02'].includes(point.func)) point.format = 'BOOL';
      else if (['01', '02'].includes(previousFunc)) point.format = 'UINT16';
      render();
    }
    configureControls();
    scheduleLocalSave();
  }

  function handlePointInput(e) {
    // Function transitions belong to change: input fires first for selects.
    if (e.target.classList.contains('function-select')) return;
    const tr = e.target.closest('tr');
    if (!tr || app.running || app.scanning || app.writing || app.blockReading || app.resyncing) return;
    sync(tr);
    scheduleLocalSave();
  }

  function snapshotEntries() {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== LEGACY_KEY && !key.startsWith(LOCAL_PREFIX)) continue;
      try {
        const data = JSON.parse(localStorage.getItem(key));
        entries.push({ key, data, time: Date.parse(data.savedAt) || 0 });
      } catch {
        entries.push({ key, data: null, time: 0 });
      }
    }
    return entries.sort(
      (a, b) => b.time - a.time || (a.key === LOCAL_KEY ? -1 : b.key === LOCAL_KEY ? 1 : 0),
    );
  }

  function saveLocalProjectNow() {
    if (!app.saveDirty) return;
    clearTimeout(app.saveTimer);
    try {
      const snapshot = project();
      validateProject(snapshot);
      localStorage.setItem(
        LOCAL_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), project: snapshot }),
      );
      try {
        sessionStorage.setItem('registerwerk-last-snapshot', LOCAL_KEY);
      } catch {}
      const entries = snapshotEntries();
      for (const item of entries.slice(5)) localStorage.removeItem(item.key);
      app.saveDirty = false;
      $('#localSaveState').textContent =
        `Lokal gesichert · ${new Date().toLocaleTimeString('de-DE', { hour12: false })} · bis zu 5 Sitzungen`;
    } catch (e) {
      $('#localSaveState').textContent =
        e.name === 'QuotaExceededError'
          ? 'Lokale Sicherung voll · Export verwenden'
          : 'Sicherung pausiert · Eingaben oder Browserspeicher prüfen';
    }
  }

  function addScanResult(
    address,
    result,
    detail,
    responseMs,
    raw,
    kind = 'ok',
    func = '03',
    probeAddress = 0,
  ) {
    const tr = el('tr'),
      state = el('td');
    state.appendChild(el('span', { class: 'badge ' + (kind === 'ok' ? 'ok' : 'fail') }, result));
    tr.append(
      el('td', { class: 'val' }, String(address)),
      state,
      el('td', {}, detail),
      el('td', { class: 'val' }, responseMs === null ? '—' : responseMs.toFixed(1) + ' ms'),
      el('td', { class: 'val' }, raw || '—'),
    );
    const action = el('td');
    if (kind === 'ok') {
      const button = el(
        'button',
        {
          class: 'btn',
          type: 'button',
          title: 'Übernimmt Adresse und tatsächlich geprüftes Register als Datenpunkt.',
        },
        'Datenpunkt anlegen',
      );
      button.disabled = app.scanning;
      button.onclick = () => {
        if (app.running || app.scanning || app.writing || app.blockReading) return;
        const base = $('#addressBase').value === 'one' ? 1 : 0,
          offset = Number($('#regOffset').value),
          adr = probeAddress - offset + base;
        if (!Number.isInteger(adr) || adr < 0 || adr > 65535) {
          showTopError(
            'Prüfpunkt kann mit der aktuellen Adressbasis und dem Offset nicht übernommen werden.',
          );
          return;
        }
        newPoint({
          device: address,
          func,
          address: adr,
          name: `Gerät ${address} · FC ${func}`,
          format: ['01', '02'].includes(func) ? 'BOOL' : 'UINT16',
        });
      };
      action.appendChild(button);
    }
    tr.append(action);
    $('#scanRows').appendChild(tr);
    $('#scanEmpty').classList.add('hidden');
  }

  async function runBusScan() {
    if (!app.connected || app.running || app.scanning || app.writing || app.blockReading || app.resyncing)
      return;
    clearTopError();
    if (!validateFields([...$('#scanPanel').querySelectorAll('input[type=number]')])) return;
    const from = Number($('#scanFrom').value),
      to = Number($('#scanTo').value),
      addr = Number($('#scanAddress').value),
      timeout = Number($('#scanTimeout').value),
      fcs = $$('.scan-fc:checked').map((x) => Number(x.value));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 247 || from > to) {
      showTopError('Bus Scan: Bereich muss innerhalb 1–247 liegen; Start darf nicht größer als Ende sein.');
      return;
    }
    if (!fcs.length || fcs.some((fc) => ![1, 2, 3, 4].includes(fc))) {
      showTopError('Bus Scan: Mindestens eine gültige Prüf-Funktion auswählen.');
      return;
    }
    if (!$('#scanAddress').value.trim() || !Number.isInteger(addr) || addr < 0 || addr > 65535) {
      showTopError('Bus Scan: Ungültige Prüfadresse.');
      return;
    }
    if (!Number.isInteger(timeout) || timeout < 50 || timeout > 10000) {
      showTopError('Bus Scan: Timeout muss zwischen 50 und 10000 ms liegen.');
      return;
    }
    const total = to - from + 1;
    let found = 0,
      silent = 0,
      bad = 0,
      done = 0;
    app.scanning = true;
    app.scanStop = false;
    $('#scanRows').replaceChildren();
    $('#scanEmpty').classList.remove('hidden');
    $('#scanEmpty').textContent = 'Scan läuft.';
    $('#scanProgress').style.width = '0%';
    $('#scanProgressText').textContent = `0 / ${total}`;
    configureControls();
    log(`Bus Scan gestartet · ${from}–${to} · FC ${fcs.join(', ')} · Prüfadresse ${addr}.`);
    try {
      for (let device = from; device <= to; device++) {
        if (app.scanStop || !app.connected) break;
        $('#scanSummary').textContent = `Prüfe Adresse ${device} von ${to}`;
        let reply = null;
        const errors = [];
        for (const fc of fcs) {
          if (app.scanStop || !app.connected) break;
          const began = performance.now(),
            req = frame([device, fc, addr >> 8, addr & 255, 0, 1]);
          try {
            const resp = await exchange(req, { device }, fc, timeout, 0, true);
            const detail =
              resp[1] === (fc | 128)
                ? `FC ${String(fc).padStart(2, '0')} · Ausnahme ${resp[2]}: ${exceptionLabel(resp[2])}`
                : `FC ${String(fc).padStart(2, '0')} · gültige Antwort`;
            reply = { fc, detail, elapsed: performance.now() - began, raw: hex(resp) };
            break;
          } catch (e) {
            if (e.code === 'BUS_NOT_IDLE') {
              app.scanStop = true;
              showTopError('Bus Scan: ' + e.message);
              break;
            }
            if (!['TIMEOUT', 'CANCELLED'].includes(e.code)) errors.push(`FC ${fc}: ${e.message}`);
          }
        }
        if (app.scanStop || !app.connected) break;
        if (reply) {
          found++;
          addScanResult(
            device,
            'Antwortet',
            reply.detail,
            reply.elapsed,
            reply.raw,
            'ok',
            String(reply.fc).padStart(2, '0'),
            addr,
          );
        } else if (errors.length) {
          bad++;
          addScanResult(device, 'Prüffehler', errors.join(' · '), null, '—', 'fail');
        } else silent++;
        done++;
        $('#scanProgress').style.width = `${Math.round((done / total) * 100)}%`;
        $('#scanProgressText').textContent = `${done} / ${total}`;
      }
    } finally {
      const stopped = app.scanStop || !app.connected;
      app.scanning = false;
      $('#scanEmpty').classList.toggle('hidden', found + bad > 0);
      $('#scanEmpty').textContent = stopped
        ? 'Scan abgebrochen.'
        : 'Keine Geräte haben rechtzeitig geantwortet. Prüfadresse, Funktion und Timeout prüfen; der Scan kann erneut gestartet werden.';
      $('#scanSummary').textContent =
        `${stopped ? 'Abgebrochen · ' : ''}${found} antwortend · ${silent} ohne rechtzeitige Antwort · ${bad} Prüffehler`;
      log('Bus Scan ' + (stopped ? 'abgebrochen' : 'abgeschlossen') + ' · ' + $('#scanSummary').textContent);
      app.scanStop = false;
      configureControls();
    }
  }
  function addTooltips() {
    const tips = {
      '#openHelp': 'Öffnet die integrierte Offline-Hilfe. Tastenkürzel: F1.',
      '#saveProject': 'Öffnet den Dialog zum Benennen und Exportieren der JSON-Projektdatei.',
      '#loadProject':
        'Lädt eine zuvor gespeicherte Registerwerk-Projektdatei. Der aktuelle Port muss getrennt sein.',
      '#exportFilename': 'Name der heruntergeladenen Projektdatei; .json wird automatisch ergänzt.',
      '#projectDeviceName': 'Geräte- oder Anlagenname; wird zusammen mit der Projektdatei gespeichert.',
      '#projectNotes': 'Freie Hinweise zu Besonderheiten und wird beim späteren Import angezeigt.',
      '#confirmExport': 'Erstellt die Projektdatei mit dem angezeigten Namen.',
      '#cancelExport': 'Schließt den Exportdialog ohne Download.',
      '#connect': 'Öffnet die Browserauswahl für einen seriellen COM-Port.',
      '#disconnect': 'Schließt den COM-Port und beendet laufende Abfragen.',
      '#baud': 'Muss mit der Baudrate des Modbus-Geräts übereinstimmen.',
      '#parity': 'Parität des seriellen Geräts: keine, gerade oder ungerade.',
      '#dataBits':
        'Modbus RTU verwendet 8 Datenbits. RTS lässt sich über Web Serial nicht steuern; RS485-Adapter mit automatischer Senderichtung nutzen.',
      '#stopBits': 'Anzahl der Stopbits; muss zur Geräteeinstellung passen.',
      '#timeout':
        'Mindestwartezeit auf eine Antwort; bei niedriger Baudrate oder langen Frames automatisch verlängert. Nach Timeout: Busruhe mindestens eine Timeout-Länge oder 250 ms. Warten höchstens 3× diese Zeit, mindestens die gewählte Fehler-Wartezeit. Danach Fehler ohne Senden.',
      '#guard': 'Wartezeit nach einem Kommunikationsfehler, bevor die nächste Anfrage gesendet wird.',
      '#pollDelay': 'Pause zwischen zwei Datenpunkten innerhalb eines Messdurchlaufs.',
      '#roundDelay': 'Pause nach einem vollständigen Messdurchlauf, bevor er wiederholt wird.',
      '#addressBase':
        'Legt fest, ob deine Eingabe direkt als Protokolladresse oder als 1-basierte Adresse behandelt wird.',
      '#regOffset': 'Wird zusätzlich zur Adresse addiert; für normale Register meist 0.',
      '#addPoint': 'Fügt eine neue Zeile für ein Register, Coil oder Eingangssignal hinzu.',
      '#clearPoints':
        'Entfernt nach Bestätigung alle Datenpunkte aus der Liste. Während eines Messlaufs oder Scans ist die Schaltfläche gesperrt.',
      '#openScan': 'Sucht nacheinander nach antwortenden Modbus-RTU-Geräten.',
      '#openBlock': 'Liest einen zusammenhängenden Bereich von 1 bis 125 Registern.',
      '#scanOpenBlock': 'Öffnet den Leser für einen zusammenhängenden Registerbereich.',
      '#readBlock': 'Liest den eingestellten Registerbereich einmal und zeigt Dezimal-, Hex- und Binärwerte.',
      '#blockDevice': 'Geräteadresse des Modbus-Slaves (1–247).',
      '#blockFunction': 'Liest Holding Register (FC 03) oder Input Register (FC 04).',
      '#blockAddress':
        'Startadresse in derselben Basis wie die Datenpunktliste. Basis und Registeroffset werden berücksichtigt.',
      '#blockCount': 'Anzahl zusammenhängender Register; Modbus erlaubt höchstens 125 in einer Anfrage.',
      '#closeBlock': 'Schließt die Registerbereich-Ansicht.',
      '#openWrite':
        'Bereitet einen einzelnen oder mehrfachen Schreibzugriff vor; jeder Zugriff erfordert eine Bestätigung.',
      '#readOnce': 'Fragt jeden aktivierten Datenpunkt genau einmal ab.',
      '#start': 'Startet die wiederholte Abfrage aller aktivierten Datenpunkte.',
      '#stop': 'Beendet den Messlauf nach Abschluss der aktuellen Anfrage.',
      '#scanFrom': 'Erste Geräteadresse des Suchbereichs; gültig sind 1 bis 247.',
      '#scanTo': 'Letzte Geräteadresse des Suchbereichs; gültig sind 1 bis 247.',
      '#scanAddress': 'Registeradresse, mit der jede Geräteadresse geprüft wird.',
      '#scanTimeout':
        'Wartezeit pro Adresse und Funktion; wird an die Baudrate angepasst. Wiederholte Scans sind nach automatischer Busruhe möglich. Schweigen kann auch eine ungeeignete Prüfadresse bedeuten.',
      '#startScan': 'Startet den Scan über den eingestellten Gerätebereich.',
      '#stopScan': 'Bricht den Scan nach der aktuell offenen Antwort oder Zeitüberschreitung ab.',
      '#closeScan': 'Schließt die Scanansicht; ein laufender Scan muss zuerst beendet werden.',
      '#clearLog': 'Leert nur das sichtbare Kommunikationsprotokoll.',
      '#writeDevice': 'Modbus-Geräteadresse des Empfängers (1–247).',
      '#writeFunction': 'Wählt Einzel- oder Mehrfachschreiben für Register oder Coils.',
      '#writeAddress': 'Startadresse nach eingestellter 0-/1-Basis und Registeroffset.',
      '#writeValues':
        'Mehrere Werte mit Semikolon oder Leerzeichen trennen. FLOAT32 erlaubt Dezimalkomma und Dezimalpunkt.',
      '#previewWrite': 'Prüft Eingaben und zeigt eine Zusammenfassung vor der endgültigen Bestätigung.',
      '#cancelCompose': 'Schließt die Eingabemaske, ohne einen Schreibbefehl zu senden.',
      '#cancelWrite': 'Verwirft den vorbereiteten Schreibbefehl.',
      '#doWrite': 'Sendet den bestätigten Schreibbefehl genau einmal; danach wird der Bereich zurückgelesen.',
    };
    for (const [selector, tip] of Object.entries(tips)) {
      const node = $(selector);
      if (node) node.title = tip;
    }
    $('#statPoints').title = 'Anzahl aller angelegten Datenpunkte.';
    $('#statLast').title = 'Zeitpunkt der zuletzt erfolgreichen Datenpunktabfrage.';
    $('#statRun').title = 'Zeigt, ob das Tool bereit ist, misst oder scannt.';
    $('#headStatus').title = 'Status der seriellen Verbindung.';
    $('#localSaveState').title = 'Zeigt, ob eine lokale Sitzungssicherung verfügbar ist.';
    $('#scanProgress').parentElement.title = 'Fortschritt über die geprüften Geräteadressen.';
    $('#scanSummary').title = 'Zusammenfassung der antwortenden Geräte, stillen Adressen und Prüffehler.';
    $('#scanProgressText').title = 'Anzahl der bereits geprüften Adressen.';
  }
  addTooltips();
  function validationLabel(field) {
    return (
      field.labels?.[0]?.textContent?.trim() ||
      field.getAttribute('aria-label') ||
      field.getAttribute('title') ||
      field.id ||
      'Eingabefeld'
    );
  }
  function validationMessage(field) {
    const v = field.validity;
    if (v.valueMissing) return 'Bitte einen Wert eingeben.';
    if (v.badInput) return 'Bitte eine gültige Zahl eingeben.';
    if (v.rangeUnderflow) return `Wert muss mindestens ${field.min} sein.`;
    if (v.rangeOverflow) return `Wert darf höchstens ${field.max} sein.`;
    if (v.stepMismatch) return 'Bitte eine ganze Zahl eingeben.';
    if (v.typeMismatch) return 'Bitte einen gültigen Wert eingeben.';
    return 'Bitte Eingabe prüfen.';
  }
  function validateFields(fields) {
    for (const field of fields) {
      if (!field || field.disabled || field.type === 'checkbox' || field.type === 'file') continue;
      if (field.closest('[hidden],.hidden')) {
        field.removeAttribute('aria-invalid');
        continue;
      }
      if (!field.checkValidity()) {
        field.setAttribute('aria-invalid', 'true');
        const message = `${validationLabel(field)}: ${validationMessage(field)}`;
        showTopError(message);
        const details = field.closest('details');
        if (details) details.open = true;
        field.reportValidity();
        field.focus();
        return false;
      }
      field.removeAttribute('aria-invalid');
    }
    return true;
  }
  function initializeValidation() {
    for (const field of $$('input[type="number"]')) field.required = true;
    $('#exportFilename').required = true;
    $('#writeValues').required = true;
    const update = (e) => {
      const f = e.target;
      if (
        !(f instanceof HTMLInputElement || f instanceof HTMLSelectElement) ||
        f.type === 'checkbox' ||
        f.type === 'file'
      )
        return;
      if (f.closest('[hidden],.hidden')) {
        f.removeAttribute('aria-invalid');
        return;
      }
      if (f.checkValidity()) f.removeAttribute('aria-invalid');
      else f.setAttribute('aria-invalid', 'true');
    };
    document.addEventListener('input', update);
    document.addEventListener('change', update);
    document.addEventListener('focusout', update, true);
  }
  initializeValidation();
  function timestamp() {
    return new Date().toLocaleTimeString('de-DE', { hour12: false });
  }
  function log(message, kind = '') {
    if ($log.textContent.startsWith('Noch keine Kommunikation')) $log.textContent = '';
    const line = document.createElement('div');
    if (kind)
      line.className =
        kind === 'error' ? 'badline' : kind === 'ok' ? 'okline' : kind === 'warn' ? 'warnline' : '';
    line.textContent = `[${timestamp()}] ${message}`;
    $log.appendChild(line);
    while ($log.childElementCount > 500) $log.firstElementChild.remove();
    $log.scrollTop = $log.scrollHeight;
  }
  function showTopError(message) {
    const el = $('#topError');
    el.textContent = message;
    el.hidden = false;
  }
  function clearTopError() {
    $('#topError').hidden = true;
  }
  function renderProjectInfo(settings = {}, pointCount = app.points.length) {
    const meta = app.projectInfo || { deviceName: '', notes: '' };
    if (!meta.deviceName && !meta.notes) {
      $('#projectInfoPanel').classList.add('hidden');
      return;
    }
    const parity = { none: 'N', even: 'E', odd: 'O' }[settings.parity] || 'N';
    const serial = settings.baud
      ? `${settings.baud} Baud · ${settings.dataBits ?? 8}${parity}${settings.stopBits ?? 1}`
      : 'Serielle Parameter nicht angegeben';
    const transport = settings.transport ?? 'rtu';
    const connection = transport === 'rtu'
      ? `RTU seriell · ${serial}`
      : `${transport === 'tcp' ? 'Modbus TCP' : 'Ethernet-RTU-Brücke'} · ${settings.tcpHost || 'IP nicht eingetragen'}:${settings.tcpPort ?? 502}`;
    const base = settings.addressBase === 'one' ? '1-basiert' : '0-basiert';
    const offset = Number(settings.regOffset || 0);
    const registerInfo = `Adresseingabe ${base} · Registeroffset ${offset}`;
    $('#projectInfoTitle').textContent = meta.deviceName ? `Projekt: ${meta.deviceName}` : 'Projekt geladen';
    $('#projectInfoSettings').textContent =
      `${connection} · ${registerInfo} · ${pointCount} Datenpunkt${pointCount === 1 ? '' : 'e'}. Die Verbindung muss am Zielgerät neu hergestellt werden.`;
    $('#projectInfoNotes').textContent = meta.notes || '';
    $('#projectInfoNotes').hidden = !meta.notes;
    $('#projectInfoPanel').classList.remove('hidden');
  }
  function setHeader(text, mode = '') {
    $('#headStatus').textContent = text;
    $('#headLamp').className = 'lamp ' + (mode === 'ok' ? 'on' : mode === 'error' ? 'err' : '');
  }
  function configureControls() {
    const c = app.connected,
      busy = app.running || app.scanning || app.writing || app.blockReading || app.resyncing || app.connecting || app.updateInstalling,
      transport = $('#transport').value,
      network = transport !== 'rtu';
    $('#connect').disabled = busy;
    $('#releaseBus').disabled = !c || busy || network;
    $('#releaseBus').classList.toggle('hidden', network);
    $('#cancelReleaseBus').classList.toggle('hidden', !app.resyncing);
    $('#addPoint').disabled = busy;
    $$('#scanRows button,#scanPanel input').forEach((x) => (x.disabled = busy));
    $('#skipErrors').disabled = busy;
    $('#sameDeviceAddress').disabled = busy;
    $('#pointRows')
      .querySelectorAll('input,select,.delete')
      .forEach((x) => (x.disabled = busy));
    $('#connect').classList.toggle('hidden', c);
    $('#disconnect').classList.toggle('hidden', !c);
    $('#serialSettings').disabled = c || transport === 'tcp';
    $('#transport').disabled = c || busy;
    $('#tcpHost').disabled = c || busy;
    $('#tcpPort').disabled = c || busy;
    $('#tcpSettings').classList.toggle('hidden', !network);
    $('#browserNotice').hidden = transport !== 'rtu' || ('serial' in navigator);
    for (const id of ['timeout', 'guard']) $(`#${id}`).disabled = c || busy;
    $('#transportHint').textContent = transport === 'tcp'
      ? 'Modbus TCP nutzt MBAP-Telegramme. Die Geräteadresse in der Datenpunktliste ist die Unit-ID.'
      : transport === 'ethRtu'
        ? 'Die RTU-Telegramme werden mit CRC transparent über TCP weitergegeben. Serielle Parameter müssen am Gateway und Endgerät übereinstimmen.'
        : 'RTU verwendet 8 Datenbits. Für RS485 bitte einen Adapter mit automatischer Senderichtungsumschaltung nutzen; die App steuert RTS nicht.';
    $('#connect').textContent = network ? 'TCP-Verbindung herstellen' : 'Port auswählen und verbinden';
    $('#releaseBus').title = network
      ? 'Bei TCP nicht verfügbar.'
      : 'Busruhe abwarten (mindestens Timeout oder 250 ms, höchstens dreifache Wartezeit). Abbrechen ist jederzeit möglich. Es wird kein Telegramm gesendet.';
    $('#readOnce').disabled = !c || busy;
    $('#start').disabled = !c || busy || !app.points.some((p) => p.enabled);
    $('#stop').classList.toggle('hidden', !app.running);
    $('#statRun').textContent = app.scanning ? 'Bus Scan' : app.running ? 'Läuft' : 'Bereit';
    $('#openScan').disabled = !c || busy;
    $('#openBlock').disabled = !c || busy;
    $('#scanOpenBlock').disabled = !c || busy;
    $('#readBlock').disabled = !c || busy;
    $('#openWrite').disabled = !c || busy;
    $('#clearPoints').disabled = !app.points.length || busy;
    $('#startScan').disabled = !c || busy;
    $('#stopScan').classList.toggle('hidden', !app.scanning);
  }
  function updateCount() {
    const n = app.points.length;
    $('#statPoints').textContent = n;
    $('#pointCount').textContent = `${n} Datenpunkt${n === 1 ? '' : 'e'}`;
    configureControls();
    $('#empty').classList.toggle('hidden', n > 0);
  }
  function newPoint(p = {}) {
    app.points.push({
      id: makeId(),
      enabled: p.enabled !== false,
      name: p.name ?? `Datenpunkt ${app.points.length + 1}`,
      device: $('#sameDeviceAddress').checked && app.points.length ? app.points[0].device : p.device ?? 1,
      func: p.func ?? '03',
      address: p.address ?? 1000,
      format: p.format ?? 'UINT16',
      scale: p.scale ?? 1,
      offset: p.offset ?? 0,
      decimals: p.decimals ?? 2,
      bit: p.bit ?? 0,
      value: '—',
      raw: '—',
      status: 'Bereit',
      statusType: '',
    });
    render();
    scheduleLocalSave();
  }
  function el(tag, attrs = {}, text) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'type' || k === 'min' || k === 'max' || k === 'step' || k === 'value' || k === 'title')
        e.setAttribute(k, v);
      else e[k] = v;
    }
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function input(value, cls, kind = 'text') {
    const x = el('input', { class: `compact-input ${cls}`, type: kind, value: String(value) });
    if (kind === 'number') x.required = true;
    return x;
  }
  function select(items, value, cls) {
    const x = el('select', { class: cls });
    for (const [v, label] of items) {
      const o = el('option', { value: v }, label);
      x.appendChild(o);
    }
    x.value = value;
    return x;
  }
  function render() {
    const body = $('#pointRows');
    body.replaceChildren();
    for (const p of app.points) {
      const tr = el('tr');
      const enabled = el('input', { type: 'checkbox', class: 'check' });
      enabled.checked = p.enabled;
      enabled.title = 'Datenpunkt in Einzelabfragen und Messläufen aktivieren oder überspringen.';
      enabled.setAttribute('aria-label', `Datenpunkt ${p.name} aktivieren`);
      const td0 = el('td');
      td0.appendChild(enabled);
      tr.append(td0);
      const nameTd = el('td', { class: 'name-cell' });
      const nameInput = input(p.name, 'name-input');
      nameInput.required = true;
      nameInput.title = 'Freier Name zur Wiedererkennung in Tabelle und Fehlermeldungen.';
      nameTd.appendChild(nameInput);
      tr.append(nameTd);
      const devTd = el('td');
      const dev = input(p.device, 'device-input', 'number');
      dev.min = '1';
      dev.max = '247';
      dev.readOnly = $('#sameDeviceAddress').checked && p !== app.points[0];
      dev.title = dev.readOnly
        ? 'Gemeinsame Geräteadresse. Zum Ändern die erste Zeile verwenden oder „Alle Geräteadressen gleich“ ausschalten.'
        : 'Modbus-Geräteadresse (Slave-ID), gültig von 1 bis 247.';
      devTd.appendChild(dev);
      tr.append(devTd);
      const fnTd = el('td');
      const fnSelect = select(readFns, p.func, 'function-select');
      fnSelect.title = 'Modbus-Funktion und Registerbereich dieses Datenpunkts.';
      fnTd.appendChild(fnSelect);
      tr.append(fnTd);
      const addrTd = el('td');
      const adr = input(p.address, 'address-input', 'number');
      adr.min = '0';
      adr.max = '65535';
      adr.title = 'Register- oder Bitadresse vor Basis- und Offset-Umrechnung.';
      addrTd.appendChild(adr);
      tr.append(addrTd);
      const fmtTd = el('td');
      const fmtSelect = select(
        types.map((x) => [x, x]),
        p.format,
        'dtype-select',
      );
      fmtSelect.title = 'Datentyp und bei 32-Bit-Werten zusätzlich die Byte-Reihenfolge.';
      fmtTd.appendChild(fmtSelect);
      tr.append(fmtTd);
      const scaleTd = el('td');
      const scale = input(p.scale, 'scale-input', 'number');
      scale.step = 'any';
      scale.title = 'Skalierungsfaktor: Wenn Rohwert 216 dem Gerätewert 21,6 entspricht, hier 0,1 eintragen.';
      scaleTd.appendChild(scale);
      tr.append(scaleTd);
      const offsetTd = el('td');
      const offset = input(p.offset ?? 0, 'offset-input', 'number');
      offset.step = 'any';
      offset.title = 'Wird nach der Multiplikation mit dem Faktor addiert.';
      offsetTd.appendChild(offset);
      tr.append(offsetTd);
      const decimalsTd = el('td');
      const decimals = input(p.decimals ?? 2, 'decimals-input', 'number');
      decimals.min = '0';
      decimals.max = '9';
      decimals.title = 'Nur Anzeigeformat; ändert nicht den übertragenen Rohwert.';
      decimalsTd.appendChild(decimals);
      tr.append(decimalsTd);
      const bitTd = el('td', { class: 'bit-cell' });
      const bit = input(p.bit, 'bit-input', 'number');
      bit.min = '0';
      bit.max = '15';
      bit.title = 'Bitnummer im Registerwort (0–15); bei Coil-Abfragen wird dieses Feld nicht verwendet.';
      if (['01', '02'].includes(p.func)) {
        bit.classList.add('hidden');
        bit.disabled = true;
        bitTd.appendChild(bit);
      } else bitTd.appendChild(bit);
      tr.insertBefore(bitTd, tr.querySelector('.scale-input').parentElement);
      tr.append(el('td', { class: 'val value-cell' }, p.value));
      tr.append(el('td', { class: 'val raw-cell' }, p.raw));
      const st = el('td', { class: 'state-cell' });
      st.appendChild(el('span', { class: `badge ${p.statusType}` }, p.status));
      tr.append(st);
      const del = el('button', { class: 'delete', type: 'button', title: 'Datenpunkt entfernen' }, '×');
      del.setAttribute('aria-label', `Datenpunkt ${p.name} entfernen`);
      const delTd = el('td');
      delTd.append(del);
      tr.append(delTd);
      tr.dataset.id = p.id;
      body.appendChild(tr);
    }
    updateCount();
  }
  function sync(tr) {
    const p = app.points.find((x) => x.id === tr.dataset.id);
    if (!p) return;
    const v = (s) => tr.querySelector(s).value,
      n = (s) => (v(s).trim() === '' ? NaN : Number(v(s)));
    p.enabled = tr.querySelector('.check').checked;
    p.name = v('.name-input').trim();
    p.device = n('.device-input');
    p.func = v('.function-select');
    p.address = n('.address-input');
    p.format = v('.dtype-select');
    p.bit = n('.bit-input');
    p.scale = n('.scale-input');
    p.offset = n('.offset-input');
    p.decimals = n('.decimals-input');
    if ($('#sameDeviceAddress').checked && p === app.points[0]) syncSharedDeviceAddress();
  }
  function syncSharedDeviceAddress() {
    if (!$('#sameDeviceAddress').checked || !app.points.length) return;
    const device = app.points[0].device;
    if (!Number.isInteger(device) || device < 1 || device > 247) return;
    for (const p of app.points) p.device = device;
    $$('#pointRows .device-input').forEach((input) => {
      if (input.value !== String(device)) input.value = String(device);
    });
  }
  $('#pointRows').addEventListener('change', handlePointChange);
  $('#pointRows').addEventListener('input', handlePointInput);
  $('#pointRows').addEventListener('click', (e) => {
    if (app.running || app.scanning || app.writing || app.blockReading || !e.target.closest('.delete'))
      return;
    const id = e.target.closest('tr').dataset.id;
    app.points = app.points.filter((p) => p.id !== id);
    render();
    scheduleLocalSave();
  });
  function mark(p, status, type = '') {
    p.status = status;
    p.statusType = type;
    const tr = $('#pointRows').querySelector('tr[data-id="' + CSS.escape(p.id) + '"]');
    if (tr) {
      const value = tr.querySelector('.value-cell'),
        raw = tr.querySelector('.raw-cell'),
        b = tr.querySelector('.badge');
      if (value) value.textContent = p.value ?? '—';
      if (raw) raw.textContent = p.raw ?? '—';
      b.className = 'badge ' + type;
      b.textContent = status;
    }
  }
  function record(p, result) {
    p.value = result.value;
    p.raw = result.raw;
    p.status = 'OK';
    p.statusType = 'ok';
    const tr = $(`#pointRows tr[data-id="${CSS.escape(p.id)}"]`);
    if (tr) {
      tr.querySelector('.value-cell').textContent = p.value;
      tr.querySelector('.raw-cell').textContent = p.raw;
      mark(p, 'OK', 'ok');
    }
    $('#statLast').textContent = timestamp();
  }
  const crc16 = (bytes) => {
    let crc = 0xffff;
    for (const b of bytes) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc & 0xffff;
  };
  const frame = (arr) => {
    const c = crc16(arr);
    return Uint8Array.from([...arr, c & 255, c >>> 8]);
  };
  const hex = (arr) => [...arr].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  function fail(message) {
    const e = new Error(message);
    return e;
  }
  function validate(p) {
    if (!['01', '02', '03', '04'].includes(String(p.func))) throw fail('Unbekannte Modbus-Lesefunktion.');
    if (!types.includes(p.format)) throw fail('Unbekanntes Datenformat.');
    if (!p.name) throw fail('Bitte eine Bezeichnung eintragen.');
    if (!Number.isInteger(p.device) || p.device < 1 || p.device > 247)
      throw fail('Geräteadresse muss zwischen 1 und 247 liegen.');
    if (!Number.isInteger(p.address) || p.address < 0 || p.address > 65535)
      throw fail('Registeradresse muss zwischen 0 und 65535 liegen.');
    if (!Number.isFinite(p.scale)) throw fail('Der Umrechnungsfaktor ist keine gültige Zahl.');
    if (!Number.isFinite(p.offset)) throw fail('Der Offset ist keine gültige Zahl.');
    if (!Number.isInteger(p.decimals) || p.decimals < 0 || p.decimals > 9)
      throw fail('Dezimalstellen müssen zwischen 0 und 9 liegen.');
    if (!['01', '02'].includes(String(p.func)) && (!Number.isInteger(p.bit) || p.bit < 0 || p.bit > 15))
      throw fail('Registerbit muss zwischen 0 und 15 liegen.');
  }
  function pointQuantity(p) {
    return p.format.includes('32') ? 2 : 1;
  }
  function buildRead(p) {
    validate(p);
    const offsetRaw = $('#regOffset').value.trim();
    if (offsetRaw === '') throw fail('Der Registeroffset darf nicht leer sein.');
    const offset = Number(offsetRaw);
    if (!Number.isInteger(offset) || offset < -65535 || offset > 65535)
      throw fail('Registeroffset muss eine ganze Zahl zwischen -65535 und 65535 sein.');
    const base = $('#addressBase').value === 'one' ? 1 : 0,
      address = p.address - base + offset;
    if (!Number.isInteger(address) || address < 0 || address > 65535)
      throw fail('Adresse nach Basis- und Offset-Umrechnung liegt außerhalb 0 bis 65535.');
    const bitArea = ['01', '02'].includes(p.func),
      qty = bitArea ? 1 : pointQuantity(p);
    if (bitArea && p.format !== 'BOOL') throw fail('Coils und diskrete Eingänge benötigen das Format BOOL.');
    if (!bitArea && p.format === 'BOOL' && (p.bit < 0 || p.bit > 15))
      throw fail('Registerbit muss zwischen 0 und 15 liegen.');
    if (address + qty - 1 > 65535)
      throw fail(
        `Der ${p.format.includes('32') ? '32-Bit-Datenpunkt' : 'Abfragebereich'} überschreitet Adresse 65535.`,
      );
    return frame([p.device, +p.func, (address >> 8) & 255, address & 255, 0, qty]);
  }
  function expectedLen(bytes, offset = 0) {
    if (bytes.length - offset < 2) return null;
    if (bytes[offset] < 1 || bytes[offset] > 247) return -1;
    const fc = bytes[offset + 1];
    if ([129, 130, 131, 132, 133, 134, 143, 144].includes(fc)) return 5;
    if ([1, 2, 3, 4].includes(fc)) {
      if (bytes.length - offset < 3) return null;
      const count = bytes[offset + 2];
      if (count < 1 || count > 250 || ([3, 4].includes(fc) && count % 2)) return -1;
      return count + 5;
    }
    return [5, 6, 15, 16].includes(fc) ? 8 : -1;
  }
  function rejectPending(err) {
    if (!app.pending) return;
    const p = app.pending;
    app.pending = null;
    clearTimeout(p.timer);
    app.rxBuffer = [];
    p.reject(err);
  }
  function exceptionLabel(code) {
    const labels = {
      1: 'Unzulässige Funktion',
      2: 'Unzulässige Datenadresse',
      3: 'Unzulässiger Datenwert',
      4: 'Gerätefehler',
    };
    return labels[code] || `Unbekannter Fehlercode ${code}`;
  }
  function charTimeMs() {
    const baud = Number($('#baud').value) || 9600,
      bits = 1 + 8 + ($('#parity').value === 'none' ? 0 : 1) + Number($('#stopBits').value || 1);
    return (bits * 1000) / baud;
  }
  function stripEcho() {
    const p = app.pending;
    if (!p?.request || [5, 6].includes(p.func) || !app.rxBuffer.length) return 0;
    for (let i = 0; i < Math.min(p.request.length, app.rxBuffer.length); i++) {
      if (p.request[i] !== app.rxBuffer[i]) return 0;
    }
    if (app.rxBuffer.length < p.request.length) {
      const size = expectedLen(app.rxBuffer);
      if (size > 0 && size <= app.rxBuffer.length) {
        const candidate = app.rxBuffer.slice(0, size);
        if (
          crc16(candidate.slice(0, -2)) === (candidate.at(-2) | (candidate.at(-1) << 8)) &&
          matchesPending(candidate, p)
        )
          return 0;
      }
      return 2;
    }
    app.rxBuffer.splice(0, p.request.length);
    log('RX · Echo des eigenen Telegramms ignoriert · ' + hex(p.request), 'warn');
    return 1;
  }
  function receiveByte(byte) {
    // USB/Web Serial chunks carry no wire-level character timestamps.
    // Never discard a partial frame based on the delay between read() chunks.
    app.lastBusActivity = Date.now();
    app.rxBuffer.push(byte);
    if (app.rxBuffer.length > 512) app.rxBuffer.splice(0, app.rxBuffer.length - 512);
    while (app.rxBuffer.length >= 2) {
      const echo = stripEcho();
      if (echo === 2) break;
      if (echo === 1) continue;
      let found = -1,
        sizeFound = 0;
      for (let offset = 0; offset + 4 < app.rxBuffer.length; offset++) {
        const size = expectedLen(app.rxBuffer, offset);
        if (!size || size < 0 || offset + size > app.rxBuffer.length) continue;
        const candidate = app.rxBuffer.slice(offset, offset + size);
        if (crc16(candidate.slice(0, -2)) === (candidate.at(-2) | (candidate.at(-1) << 8))) {
          found = offset;
          sizeFound = size;
          break;
        }
      }
      if (found >= 0) {
        if (found) log(`RX · ${found} Störbyte(s) vor gültigem Frame verworfen.`, 'warn');
        const candidate = Uint8Array.from(app.rxBuffer.splice(0, found + sizeFound).slice(found));
        const p = app.pending;
        log(
          'RX · ' +
            hex(candidate) +
            ' · CRC OK' +
            (candidate[1] & 128 ? ' · ' + exceptionLabel(candidate[2]) : ''),
          candidate[1] & 128 ? 'warn' : 'ok',
        );
        if (!p || !matchesPending(candidate, p)) {
          if (p && !p.stray++) log('RX · Fremde, verspätete oder unpassende Antwort ignoriert.', 'warn');
          continue;
        }
        app.pending = null;
        clearTimeout(p.timer);
        p.resolve(candidate);
        continue;
      }
      const size = expectedLen(app.rxBuffer);
      if (size === -1) {
        app.rxBuffer.shift();
        continue;
      }
      if (size === null || app.rxBuffer.length < size) break;
      if (app.pending && !app.pending.badCrc++)
        log('RX · CRC ungültig; Empfang wird byteweise neu ausgerichtet.', 'warn');
      app.rxBuffer.shift();
    }
  }
  async function readerLoop() {
    let failures = 0,
      lastLog = 0;
    while (app.connected && app.port) {
      const port = app.port;
      if (!port.readable) {
        handleConnectionLost(fail('Der serielle Empfangsstrom wurde geschlossen.'));
        break;
      }
      let reader;
      try {
        reader = port.readable.getReader();
        app.reader = reader;
        while (app.connected && app.port === port && app.reader === reader) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.length) {
            if (failures) log(`Serieller Empfang nach ${failures} Lesefehler(n) wiederhergestellt.`, 'ok');
            failures = 0;
            for (const byte of value) receiveByte(byte);
          }
        }
      } catch (e) {
        if (app.connected && app.port === port) {
          failures++;
          app.rxBuffer = [];
          if (failures === 1 || Date.now() - lastLog >= 5000) {
            log(`Serieller Lesefehler (${failures}); Empfang wird neu gestartet: ${e.message}`, 'warn');
            lastLog = Date.now();
          }
        }
      } finally {
        try {
          reader?.releaseLock();
        } catch {}
        if (app.reader === reader) app.reader = null;
      }
      if (!app.connected || app.port !== port) break;
      if (!port.readable) {
        handleConnectionLost(fail('Der serielle Empfangsstrom wurde geschlossen.'));
        break;
      }
      await sleep(Math.min(1000, 20 * 2 ** Math.min(failures, 6)));
    }
  }
  function handleConnectionLost(err) {
    app.connected = false;
    app.stopRequested = true;
    const lostSession = app.tcpSessionId;
    app.tcpSessionId = null;
    if (lostSession) window.registerwerkDesktop?.tcpDisconnect(lostSession).catch(() => {});
    rejectPending(fail(`Verbindung unterbrochen: ${err?.message || 'COM-Port nicht mehr verfügbar'}`));
    setHeader('Verbindung unterbrochen', 'error');
    $('#connectionInfo').textContent =
      'Die Verbindung wurde getrennt. Stelle sie erneut her, bevor du weiterarbeitest.';
    $('#connectionInfo').classList.add('show');
    configureControls();
    const reader = app.reader,
      writer = app.writer,
      port = app.port;
    app.reader = app.writer = app.port = null;
    (async () => {
      try {
        if (reader) {
          await reader.cancel();
          reader.releaseLock();
        }
      } catch {}
      try {
        if (writer) writer.releaseLock();
      } catch {}
      try {
        if (port) await port.close();
      } catch {}
    })();
  }
  function minTimeout(request, fc) {
    const qty = (request[4] << 8) | request[5];
    let rx = 8;
    if (fc === 1 || fc === 2) rx = 5 + Math.ceil(qty / 8);
    else if (fc === 3 || fc === 4) rx = 5 + qty * 2;
    return Math.ceil((request.length + rx) * charTimeMs() * 1.5 + 50);
  }
  async function exchange(request, p, fc, timeoutOverride = null, guardOverride = null, quiet = false) {
    if (app.exchanging) throw fail('Eine andere Anfrage ist noch offen.');
    const transport = app.transportMode;
    if (!app.connected || (transport === 'rtu' ? !app.writer : !app.tcpSessionId))
      throw transactionError('Keine aktive Verbindung.', 'CANCELLED');
    const key = channelKey(p.device, fc);
    const configured = timeoutOverride ?? Number($('#timeout').value.trim() || NaN);
    const guard = guardOverride ?? Number($('#guard').value.trim() || NaN);
    if (
      !Number.isInteger(configured) ||
      configured < (timeoutOverride === null ? 100 : 50) ||
      configured > (timeoutOverride === null ? 30000 : 10000)
    )
      throw fail('Antwort-Timeout liegt außerhalb des erlaubten Bereichs.');
    if (!Number.isInteger(guard) || guard < (guardOverride === null ? 50 : 0) || guard > 5000)
      throw fail('Fehler-Wartezeit liegt außerhalb des erlaubten Bereichs.');
    if (crc16(request.slice(0, -2)) !== (request.at(-2) | (request.at(-1) << 8)))
      throw fail('Interner CRC-Fehler vor dem Senden.');
    const timeout = Math.max(configured, transport === 'ethRtu' ? minTimeout(request, fc) : configured),
      port = app.port;
    if (timeout > configured && !quiet)
      log(`Timeout wegen Baudrate und Framelänge auf ${timeout} ms erhöht.`, 'warn');
    app.exchanging = true;
    try {
      if (transport !== 'rtu') {
        $('#recoveryState').textContent = 'TCP-Anfrage läuft …';
        log(`TX · ${transport === 'tcp' ? 'Modbus TCP' : 'Ethernet-RTU'} · Gerät ${p.device} · FC ${String(fc).padStart(2, '0')} · ${hex(request)}${transport === 'ethRtu' ? ' · CRC OK' : ''}`);
        try {
          const received = Uint8Array.from(await window.registerwerkDesktop.tcpExchange(
            app.tcpSessionId, request, transport, timeout,
          ));
          let response;
          if (transport === 'tcp') {
            if (received.length < 9) throw fail('Modbus-TCP-Antwort ist zu kurz.');
            const protocolId = (received[2] << 8) | received[3],
              length = (received[4] << 8) | received[5];
            if (protocolId !== 0 || length !== received.length - 6)
              throw fail('Ungültiger Modbus-TCP-Header oder falsche Antwortlänge.');
            if (received[6] !== p.device)
              throw fail(`Falsche Unit-ID ${received[6]}, erwartet ${p.device}.`);
            response = frame(received.slice(6));
          } else response = received;
          log(`RX · ${hex(received)}${transport === 'tcp' ? ' · Modbus TCP' : ' · RTU-Frame; CRC-Prüfung folgt'}`, 'ok');
          $('#recoveryState').textContent = 'TCP bereit';
          return response;
        } catch (error) {
          if (/Timeout|unterbrochen|fehlgeschlagen|geschlossen|getrennt/i.test(error.message))
            handleConnectionLost(error);
          throw error;
        }
      }
      await waitBusReady(port, key, timeout);
      app.rxBuffer = [];
      $('#recoveryState').textContent = 'Anfrage läuft …';
      const response = await new Promise((resolve, reject) => {
        const pending = {
          device: p.device,
          func: fc,
          request: Uint8Array.from(request),
          resolve,
          reject,
          stray: 0,
          badCrc: 0,
          timer: null,
        };
        app.pending = pending;
        pending.timer = setTimeout(() => {
          if (app.pending !== pending) return;
          app.pending = null;
          app.rxBuffer = [];
          app.cooldowns.set(key, { since: Date.now(), timeout });
          app.blockedUntil = Math.max(app.blockedUntil, Date.now() + guard);
          const message = `Keine gültige Antwort innerhalb von ${timeout} ms. Vor der nächsten Anfrage an Gerät ${p.device} / FC ${String(fc).padStart(2, '0')} wird erneut Busruhe abgewartet.`;
          $('#recoveryState').textContent = 'Timeout · automatische Wiederfreigabe nach Busruhe';
          log('RX · ' + message, 'error');
          reject(Object.assign(transactionError(message, 'TIMEOUT'), { timeoutMs: timeout }));
        }, timeout);
        log(`TX · Gerät ${p.device} · FC ${String(fc).padStart(2, '0')} · ${hex(request)} · CRC OK`);
        app.lastBusActivity = Date.now() + Math.ceil(request.length * charTimeMs());
        let write;
        try {
          write = app.writer.write(request);
        } catch (e) {
          write = Promise.reject(e);
        }
        Promise.resolve(write).then(
          () => {
            app.lastBusActivity = Math.max(app.lastBusActivity, Date.now());
          },
          (e) => {
            if (app.pending !== pending) return;
            app.pending = null;
            app.rxBuffer = [];
            clearTimeout(pending.timer);
            app.cooldowns.set(key, { since: Date.now(), timeout });
            app.blockedUntil = Math.max(app.blockedUntil, Date.now() + guard);
            $('#recoveryState').textContent = 'Sendefehler · vor erneutem Versuch Busruhe abwarten';
            reject(
              Object.assign(
                transactionError(
                  'Senden fehlgeschlagen; vor dem nächsten Versuch wird Busruhe abgewartet: ' + e.message,
                  'SEND_FAILED',
                ),
                { timeoutMs: timeout },
              ),
            );
          },
        );
      });
      $('#recoveryState').textContent = 'Bus bereit';
      return response;
    } catch (e) {
      if (e.code === 'CANCELLED')
        $('#recoveryState').textContent = app.connected ? 'Abfrage abgebrochen' : 'Nicht verbunden';
      throw e;
    } finally {
      app.exchanging = false;
    }
  }
  function checkResponse(resp, p, fc) {
    if (resp.length < 5) throw fail('Antwort ist zu kurz.');
    if (resp[0] !== p.device) throw fail(`Falsche Geräteadresse ${resp[0]}, erwartet ${p.device}.`);
    const got = resp.at(-2) | (resp.at(-1) << 8),
      want = crc16(resp.slice(0, -2));
    if (got !== want)
      throw fail(
        `CRC-Prüfung fehlgeschlagen. Empfang ${got.toString(16).padStart(4, '0').toUpperCase()}, erwartet ${want.toString(16).padStart(4, '0').toUpperCase()}.`,
      );
    const actual = resp[1];
    if (actual === (fc | 128)) {
      const codes = {
        1: 'Unzulässige Funktion',
        2: 'Unzulässige Datenadresse',
        3: 'Unzulässiger Datenwert',
        4: 'Gerätefehler',
      };
      throw fail(`Modbus-Ausnahme ${resp[2]}: ${codes[resp[2]] || 'Unbekannter Fehlercode ' + resp[2]}.`);
    }
    if (actual !== fc) throw fail(`Unerwartete Funktion ${actual}, erwartet ${fc}.`);
    if ([1, 2].includes(fc) && resp[2] !== 1)
      throw fail('Antwort enthält nicht die erwartete Anzahl Bitdaten.');
    if ([3, 4].includes(fc) && resp[2] !== pointQuantity(p) * 2)
      throw fail(`Antwort enthält ${resp[2]} Byte, erwartet ${pointQuantity(p) * 2}.`);
  }
  function checkRegisterBlockResponse(resp, device, fc, count) {
    if (resp.length < 5) throw fail('Antwort ist zu kurz.');
    if (resp[0] !== device) throw fail(`Falsche Geräteadresse ${resp[0]}, erwartet ${device}.`);
    const got = resp.at(-2) | (resp.at(-1) << 8),
      want = crc16(resp.slice(0, -2));
    if (got !== want)
      throw fail(
        `CRC-Prüfung fehlgeschlagen. Empfang ${got.toString(16).padStart(4, '0').toUpperCase()}, erwartet ${want.toString(16).padStart(4, '0').toUpperCase()}.`,
      );
    if (resp[1] === (fc | 128)) throw fail(`Modbus-Ausnahme ${resp[2]}: ${exceptionLabel(resp[2])}.`);
    if (resp[1] !== fc) throw fail(`Unerwartete Funktion ${resp[1]}, erwartet ${fc}.`);
    if (resp[2] !== count * 2 || resp.length !== count * 2 + 5)
      throw fail(`Antwort enthält ${resp[2]} Datenbytes, erwartet ${count * 2}.`);
  }
  async function readRegisterBlock() {
    if (!app.connected || app.running || app.scanning || app.writing || app.blockReading || app.resyncing)
      return;
    clearTopError();
    if (!validateFields([...$('#blockPanel').querySelectorAll('input[type=number]'), $('#regOffset')]))
      return;
    const device = Number($('#blockDevice').value),
      fc = Number($('#blockFunction').value),
      userAddress = Number($('#blockAddress').value),
      count = Number($('#blockCount').value);
    $('#blockRows').replaceChildren();
    $('#blockEmpty').classList.remove('hidden');
    $('#blockEmpty').textContent = 'Lese Register …';
    $('#blockStatus').textContent = 'Anfrage läuft …';
    $('#blockStatus').className = 'scan-summary';
    if (!Number.isInteger(device) || device < 1 || device > 247) {
      showTopError('Geräteadresse muss zwischen 1 und 247 liegen.');
      $('#blockStatus').textContent = 'Ungültige Geräteadresse.';
      $('#blockEmpty').textContent = 'Bitte Eingabe prüfen.';
      return;
    }
    if (![3, 4].includes(fc)) {
      showTopError('Wähle Holding Register (FC 03) oder Input Register (FC 04).');
      $('#blockStatus').textContent = 'Ungültiger Registerbereich.';
      $('#blockEmpty').textContent = 'Bitte Eingabe prüfen.';
      return;
    }
    if (
      $('#blockAddress').value.trim() === '' ||
      !Number.isInteger(userAddress) ||
      userAddress < 0 ||
      userAddress > 65535
    ) {
      showTopError('Startadresse muss ausgefüllt sein und zwischen 0 und 65535 liegen.');
      $('#blockStatus').textContent = 'Ungültige Startadresse.';
      $('#blockEmpty').textContent = 'Bitte Eingabe prüfen.';
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 125) {
      showTopError('Anzahl muss zwischen 1 und 125 Register liegen.');
      $('#blockStatus').textContent = 'Ungültige Registeranzahl.';
      $('#blockEmpty').textContent = 'Bitte Eingabe prüfen.';
      return;
    }
    const offsetText = $('#regOffset').value.trim(),
      offset = Number(offsetText),
      base = $('#addressBase').value === 'one' ? 1 : 0,
      protocolAddress = userAddress - base + offset;
    if (offsetText === '' || !Number.isInteger(offset) || offset < -65535 || offset > 65535) {
      showTopError('Registeroffset muss eine ganze Zahl zwischen -65535 und 65535 sein.');
      $('#blockStatus').textContent = 'Ungültiger Registeroffset.';
      $('#blockEmpty').textContent = 'Bitte Eingabe prüfen.';
      return;
    }
    if (protocolAddress < 0 || protocolAddress + count - 1 > 65535) {
      showTopError('Der Registerbereich liegt nach Basis- und Offset-Umrechnung außerhalb 0 bis 65535.');
      $('#blockStatus').textContent = 'Registerbereich außerhalb des Adressraums.';
      $('#blockEmpty').textContent = 'Bitte Eingabe prüfen.';
      return;
    }
    app.blockReading = true;
    configureControls();
    try {
      const req = frame([
          device,
          fc,
          (protocolAddress >> 8) & 255,
          protocolAddress & 255,
          (count >> 8) & 255,
          count & 255,
        ]),
        resp = await exchange(req, { device }, fc);
      checkRegisterBlockResponse(resp, device, fc, count);
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const word = (resp[3 + i * 2] << 8) | resp[4 + i * 2],
          tr = el('tr');
        tr.append(
          el('td', { class: 'val' }, String(userAddress + i)),
          el('td', { class: 'val' }, String(protocolAddress + i)),
          el('td', { class: 'val' }, `0x${word.toString(16).padStart(4, '0').toUpperCase()}`),
          el('td', { class: 'val' }, String(word)),
          el('td', { class: 'val' }, word.toString(2).padStart(16, '0')),
        );
        fragment.append(tr);
      }
      $('#blockRows').append(fragment);
      $('#blockEmpty').classList.add('hidden');
      $('#blockStatus').textContent =
        `${count} Register gelesen · Gerät ${device} · FC ${String(fc).padStart(2, '0')} · ${timestamp()}`;
      log(
        `Registerbereich gelesen · Gerät ${device} · FC ${String(fc).padStart(2, '0')} · Protokolladresse ${protocolAddress}–${protocolAddress + count - 1}.`,
        'ok',
      );
    } catch (e) {
      $('#blockStatus').textContent = `Fehler · ${e.message}`;
      $('#blockStatus').className = 'scan-summary badge fail';
      $('#blockEmpty').textContent = 'Keine gültigen Registerdaten.';
      showTopError(`Registerbereich: ${e.message}`);
      log(`Registerbereich · ${e.message}`, 'error');
    } finally {
      app.blockReading = false;
      configureControls();
    }
  }
  function decode(resp, p) {
    const fc = +p.func;
    if ([1, 2].includes(fc)) {
      const bit = resp[3] & 1;
      return { value: bit ? 'Ein' : 'Aus', raw: `Coil = ${bit}` };
    }
    const bytes = resp.slice(3, 3 + resp[2]),
      words = [];
    for (let i = 0; i < bytes.length; i += 2) words.push((bytes[i] << 8) | bytes[i + 1]);
    if (words.length < pointQuantity(p)) throw fail('Zu wenige Register in der Antwort.');
    if (p.format === 'HEX16')
      return { value: '0x' + words[0].toString(16).padStart(4, '0').toUpperCase(), raw: hex(bytes) };
    if (p.format === 'BOOL') {
      const bit = p.bit ?? 0,
        value = (words[0] >> bit) & 1;
      return {
        value: value ? 'Ein' : 'Aus',
        raw: '0x' + words[0].toString(16).padStart(4, '0').toUpperCase(),
      };
    }
    let value = words[0],
      raw = hex(bytes);
    if (p.format === 'INT16' && value & 0x8000) value -= 0x10000;
    if (p.format.includes('32')) {
      if (bytes.length < 4) throw fail('Der gewählte 32-Bit-Datentyp benötigt zwei Register.');
      const order = p.format.split(' ').at(-1),
        orders = { ABCD: [0, 1, 2, 3], BADC: [1, 0, 3, 2], CDAB: [2, 3, 0, 1], DCBA: [3, 2, 1, 0] },
        ordered = (orders[order] || orders.ABCD).map((i) => bytes[i]),
        b = new ArrayBuffer(4),
        dv = new DataView(b);
      ordered.forEach((v, i) => dv.setUint8(i, v));
      if (p.format.startsWith('FLOAT32')) value = dv.getFloat32(0);
      else if (p.format.startsWith('INT32')) value = dv.getInt32(0);
      else value = dv.getUint32(0);
    }
    if (!Number.isFinite(value)) throw fail('Der Datentyp ergibt keinen endlichen Zahlenwert.');
    value = value * p.scale + p.offset;
    const decimals = Math.max(0, Math.min(9, p.decimals));
    return { value: value.toFixed(decimals), raw };
  }
  async function queryPoint(p) {
    mark(p, 'Wird abgefragt', 'wait');
    try {
      const req = buildRead(p),
        resp = await exchange(req, p, +p.func);
      checkResponse(resp, p, +p.func);
      record(p, decode(resp, p));
      app.runErrors.delete(p.id);
      renderRunErrors();
      return { ok: true };
    } catch (error) {
      if (error.code === 'CANCELLED' || app.stopReason === 'disconnect' || app.stopReason === 'user') {
        p.value = '—';
        p.raw = '—';
        mark(p, 'Abgebrochen', '');
        return { ok: false, error };
      }
      pointFailed(p, error.message);
      log(`Fehler · ${p.name}: ${error.message}`, 'error');
      return { ok: false, error };
    }
  }
  async function queryAll(once = false) {
    if (!app.connected || app.running || app.scanning || app.writing || app.blockReading || app.resyncing)
      return;
    clearTopError();
    if (
      !validateFields([
        ...$$('#timeout,#guard,#pollDelay,#roundDelay,#regOffset'),
        ...$$('#pointRows input:not([type=checkbox]),#pointRows select'),
      ])
    )
      return;
    const active = app.points.filter((p) => p.enabled);
    if (!active.length) {
      showTopError('Es gibt keine aktiven Datenpunkte.');
      return;
    }
    const pointBackoff = new Map(),
      deviceBackoff = new Map(),
      probeNext = new Map(),
      skip = $('#skipErrors').checked;
    app.runErrors = new Map();
    app.running = true;
    app.stopRequested = false;
    app.stopReason = null;
    configureControls();
    try {
      let cycle = 0;
      while (!app.stopRequested && app.connected) {
        cycle++;
        const failedDevices = new Set(),
          order = [...active];
        // After a timeout, probe a different point of that device first next round.
        // An invalid first point must not hide every other point indefinitely.
        for (const [device, id] of probeNext) {
          const i = order.findIndex((p) => p.id === id),
            first = order.findIndex((p) => p.device === device);
          if (i > first && first >= 0) {
            const [p] = order.splice(i, 1);
            order.splice(first, 0, p);
          }
        }
        // Keep healthy devices ahead of occasional recovery probes.
        order.sort((a, b) => Number(deviceBackoff.has(a.device)) - Number(deviceBackoff.has(b.device)));
        for (const p of order) {
          if (app.stopRequested || !app.connected) break;
          if (!once && failedDevices.has(p.device)) {
            pointFailed(p, 'In dieser Runde ausgesetzt · automatische Prüfung in der nächsten Runde');
            continue;
          }
          const devicePause = deviceBackoff.get(p.device);
          if (!once && devicePause && Date.now() < devicePause.retryAt) {
            pointFailed(
              p,
              'Gerät pausiert · nächste Verbindungsprüfung ' +
                new Date(devicePause.retryAt).toLocaleTimeString('de-DE'),
            );
            continue;
          }
          const backoff = pointBackoff.get(p.id);
          if (!once && backoff && Date.now() < backoff.retryAt) {
            pointFailed(
              p,
              'Datenpunkt pausiert · erneute Prüfung spätestens ' +
                new Date(backoff.retryAt).toLocaleTimeString('de-DE'),
            );
            continue;
          }
          const result = await queryPoint(p);
          if (!result.ok) {
            if (!app.connected || app.stopRequested || result.error.code === 'CANCELLED') break;
            if (result.error.code === 'BUS_NOT_IDLE') {
              app.stopRequested = true;
              app.stopReason = 'bus';
              break;
            }
            if (['TIMEOUT', 'SEND_FAILED'].includes(result.error.code)) {
              failedDevices.add(p.device);
              const timeoutMs = result.error.timeoutMs || 1200;
              const failures = (backoff?.failures || 0) + 1,
                delay = Math.min(30000, Math.max(3000, timeoutMs * 3) * 2 ** Math.min(failures - 1, 5));
              pointBackoff.set(p.id, { failures, retryAt: Date.now() + delay });
              const deviceFailures = (devicePause?.failures || 0) + 1,
                deviceDelay = Math.min(
                  30000,
                  Math.max(2000, timeoutMs * 2) * 2 ** Math.min(deviceFailures - 1, 5),
                );
              deviceBackoff.set(p.device, { failures: deviceFailures, retryAt: Date.now() + deviceDelay });
              const group = active.filter((x) => x.device === p.device),
                index = group.findIndex((x) => x.id === p.id);
              probeNext.set(p.device, group[(index + 1) % group.length].id);
            }
            if (!skip) {
              app.stopRequested = true;
              app.stopReason = 'error';
              break;
            }
          } else {
            pointBackoff.delete(p.id);
            deviceBackoff.delete(p.device);
            probeNext.delete(p.device);
          }
          if (!app.stopRequested) await sleep(Number($('#pollDelay').value) || 0);
        }
        if (once || app.stopRequested || !app.connected) break;
        log(`Durchlauf ${cycle} abgeschlossen.`, 'ok');
        let left = Number($('#roundDelay').value) || 1000;
        while (left > 0 && !app.stopRequested && app.connected) {
          const step = Math.min(left, 100);
          await sleep(step);
          left -= step;
        }
      }
      if (app.connected) {
        if (app.stopReason === 'error') log('Messlauf wegen eines Datenpunktfehlers angehalten.', 'error');
        else if (app.stopReason === 'bus')
          log('Messlauf angehalten: Bus nicht ruhig; es wurde keine weitere Anfrage gesendet.', 'error');
        else if (app.stopReason === 'user') log('Messlauf manuell angehalten.', 'ok');
      }
    } finally {
      app.running = false;
      app.stopRequested = false;
      app.stopReason = null;
      configureControls();
    }
  }
  async function startRun() {
    setHeader('Messlauf aktiv', 'ok');
    await queryAll(false);
    if (app.connected) setHeader('Verbunden', 'ok');
  }
  async function connect() {
    if (app.updateInstalling || app.connecting || app.connected) return;
    clearTopError();
    const transport = $('#transport').value;
    if (transport === 'rtu' && !('serial' in navigator)) {
      showTopError(
        'Dieser Browser unterstützt keinen seriellen Zugriff. Verwende Chrome oder Edge über localhost oder HTTPS.',
      );
      return;
    }
    let port = null,
      reader = null,
      writer = null,
      tcpSessionId = null;
    app.connecting = true;
    configureControls();
    try {
      if (transport !== 'rtu') {
        const host = $('#tcpHost').value.trim(), tcpPort = Number($('#tcpPort').value);
        if (!host || !Number.isInteger(tcpPort) || tcpPort < 1 || tcpPort > 65535)
          throw fail('Bitte IP-Adresse/Hostname und einen gültigen TCP-Port eingeben.');
        tcpSessionId = await window.registerwerkDesktop.tcpConnect(host, tcpPort);
        app.transportMode = transport;
        app.tcpSessionId = tcpSessionId;
        app.port = app.reader = app.writer = null;
        app.connected = true;
        app.cooldowns.clear();
        $('#recoveryState').textContent = 'TCP bereit';
        const label = transport === 'tcp' ? 'Modbus TCP' : 'Ethernet-RTU-Brücke';
        $('#connectionInfo').textContent = `Verbindung aktiv · ${label} · ${host}:${tcpPort}`;
        $('#connectionInfo').classList.add('show');
        $('#portSummary').textContent = `${label} · ${host}:${tcpPort}`;
        setHeader('Verbunden', 'ok');
        configureControls();
        log(`${label} aufgebaut · ${host}:${tcpPort}`, 'ok');
      } else {
      app.transportMode = 'rtu';
      const settings = {
        baudRate: +$('#baud').value,
        dataBits: +$('#dataBits').value,
        parity: $('#parity').value,
        stopBits: +$('#stopBits').value,
        bufferSize: 256,
      };
      port = await navigator.serial.requestPort();
      await port.open(settings);
      writer = port.writable.getWriter();
      app.port = port;
      app.reader = null;
      app.writer = writer;
      app.connected = true;
      app.cooldowns.clear();
      app.rxBuffer = [];
      app.lastBusActivity = Date.now();
      $('#recoveryState').textContent = 'Bus bereit';
      $('#connectionInfo').textContent =
        `Verbindung aktiv · ${settings.baudRate} Baud · ${settings.dataBits}${settings.parity === 'none' ? 'N' : settings.parity === 'even' ? 'E' : 'O'}${settings.stopBits}`;
      $('#connectionInfo').classList.add('show');
      $('#portSummary').textContent =
        `RTU · ${settings.baudRate} ${settings.dataBits}${settings.parity === 'none' ? 'N' : settings.parity === 'even' ? 'E' : 'O'}${settings.stopBits}`;
      setHeader('Verbunden', 'ok');
      configureControls();
      log(
        `Port geöffnet · ${settings.baudRate} ${settings.dataBits}${settings.parity === 'none' ? 'N' : settings.parity === 'even' ? 'E' : 'O'}${settings.stopBits}`,
        'ok',
      );
      app.readerTask = readerLoop();
      }
    } catch (e) {
      if (tcpSessionId) {
        try { await window.registerwerkDesktop.tcpDisconnect(tcpSessionId); } catch {}
      }
      if (reader) {
        try {
          await reader.cancel();
          reader.releaseLock();
        } catch {}
      }
      if (writer) {
        try {
          writer.releaseLock();
        } catch {}
      }
      if (port) {
        try {
          await port.close();
        } catch {}
      }
      app.port = app.reader = app.writer = null;
      app.tcpSessionId = null;
      app.connected = false;
      if (e.name === 'NotFoundError') {
        log('Kein Port ausgewählt. Verbindung wurde nicht geändert.');
        return;
      }
      const msg =
        e.name === 'SecurityError'
          ? 'Der Browser hat den Zugriff blockiert. Öffne die Seite über localhost oder HTTPS.'
          : e.message || 'Unbekannter Verbindungsfehler';
      showTopError(`${transport === 'rtu' ? 'Port konnte nicht geöffnet werden' : 'TCP-Verbindung fehlgeschlagen'}: ${msg}`);
      setHeader('Verbindung fehlgeschlagen', 'error');
      configureControls();
      log(`Verbindungsfehler: ${msg}`, 'error');
    } finally {
      app.connecting = false;
      configureControls();
    }
  }
  async function disconnect() {
    app.stopReason = 'disconnect';
    app.stopRequested = true;
    app.scanStop = true;
    if (app.writing) app.writeSpec = null;
    if (app.pending) rejectPending(fail('Verbindung wurde getrennt.'));
    app.connected = false;
    if (app.tcpSessionId) {
      try { await window.registerwerkDesktop.tcpDisconnect(app.tcpSessionId); }
      catch (e) { log(`TCP-Verbindung konnte nicht sauber geschlossen werden: ${e.message}`, 'warn'); }
    }
    try {
      if (app.reader) {
        await app.reader.cancel();
        app.reader.releaseLock();
      }
    } catch {}
    try {
      if (app.writer) app.writer.releaseLock();
    } catch {}
    try {
      if (app.port) await app.port.close();
    } catch (e) {
      log(`Port konnte nicht sauber geschlossen werden: ${e.message}`, 'error');
    }
    app.reader = app.writer = app.port = null;
    app.tcpSessionId = null;
    app.transportMode = $('#transport').value;
    $('#connectionInfo').classList.remove('show');
    $('#portSummary').textContent = app.transportMode === 'rtu' ? 'RTU · kein Port ausgewählt' : `${app.transportMode === 'tcp' ? 'Modbus TCP' : 'Ethernet-RTU-Brücke'} · nicht verbunden`;
    setHeader('Nicht verbunden');
    configureControls();
    log('Verbindung getrennt.');
  }
  $('#connect').onclick = connect;
  $('#releaseBus').onclick = releaseBus;
  $('#cancelReleaseBus').onclick = () => {
    app.cancelResync = true;
    $('#recoveryState').textContent = 'Freigabe wird abgebrochen …';
  };
  $('#disconnect').onclick = disconnect;
  $('#addPoint').onclick = () => newPoint();
  $('#clearPoints').onclick = () => {
    if (!app.points.length || app.running || app.scanning || app.writing) return;
    const count = app.points.length;
    if (
      !window.confirm(
        `Alle ${count} Datenpunkte aus der Liste entfernen?\n\nDie Aktion kann nicht rückgängig gemacht werden.`,
      )
    )
      return;
    app.points = [];
    render();
    scheduleLocalSave();
    log(`Datenpunktliste geleert · ${count} Datenpunkte entfernt.`, 'ok');
  };
  $('#readOnce').onclick = () => queryAll(true);
  $('#start').onclick = startRun;
  $('#stop').onclick = () => {
    app.stopReason = 'user';
    app.stopRequested = true;
    log('Manueller Stopp angefordert. Die aktuelle Anfrage wird noch abgeschlossen.');
  };
  $('#clearLog').onclick = () => {
    $log.replaceChildren();
  };
  $('#openScan').onclick = () => {
    $('#scanPanel').classList.remove('hidden');
    $('#scanPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const showBlockPanel = () => {
    $('#blockPanel').classList.remove('hidden');
    $('#blockPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#openBlock').onclick = showBlockPanel;
  $('#scanOpenBlock').onclick = () => {
    if (app.scanning || app.running || app.writing || app.blockReading) return;
    $('#scanPanel').classList.add('hidden');
    showBlockPanel();
  };
  $('#closeBlock').onclick = () => {
    if (!app.blockReading) $('#blockPanel').classList.add('hidden');
  };
  $('#readBlock').onclick = readRegisterBlock;
  $('#closeScan').onclick = () => {
    if (!app.scanning) $('#scanPanel').classList.add('hidden');
  };
  $('#startScan').onclick = runBusScan;
  $('#stopScan').onclick = () => {
    app.scanStop = true;
    $('#scanSummary').textContent = 'Abbruch angefordert · aktuelle Antwort wird noch abgeschlossen';
  };
  function project() {
    return {
      format: 'registerwerk-modbus-rtu',
      version: 3,
      metadata: { deviceName: app.projectInfo.deviceName, notes: app.projectInfo.notes },
      settings: {
        transport: $('#transport').value,
        tcpHost: $('#tcpHost').value.trim(),
        tcpPort: Number($('#tcpPort').value || DEFAULT_SETTINGS.tcpPort),
        baud: +$('#baud').value,
        parity: $('#parity').value,
        dataBits: +$('#dataBits').value,
        stopBits: +$('#stopBits').value,
        timeout: +$('#timeout').value,
        guard: +$('#guard').value,
        pollDelay: +$('#pollDelay').value,
        roundDelay: +$('#roundDelay').value,
        regOffset: +$('#regOffset').value,
        addressBase: $('#addressBase').value,
        scanFrom: +$('#scanFrom').value,
        scanTo: +$('#scanTo').value,
        scanFunctions: $$('.scan-fc:checked').map((x) => x.value),
        scanAddress: +$('#scanAddress').value,
        scanTimeout: +$('#scanTimeout').value,
        skipErrors: $('#skipErrors').checked,
        sameDeviceAddress: $('#sameDeviceAddress').checked,
      },
      points: app.points.map(({ id, value, raw, status, statusType, ...p }) => p),
    };
  }
  function validateProject(o) {
    if (o?.format !== 'registerwerk-modbus-rtu' || !Array.isArray(o.points))
      throw fail('Die Datei ist keine gültige Registerwerk-Projektdatei.');
    if (!Number.isInteger(o.version) || o.version < 1 || o.version > 3)
      throw fail('Nicht unterstützte Projektversion. Unterstützt werden Version 1 bis 3.');
    if (o.points.length > 500) throw fail('Das Projekt enthält mehr als 500 Datenpunkte.');
    const rawMeta = o.metadata ?? {};
    if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta))
      throw fail('Ungültige Gerätehinweise in der Projektdatei.');
    if (rawMeta.deviceName !== undefined && typeof rawMeta.deviceName !== 'string')
      throw fail('Geräte-/Projektname in der Projektdatei muss Text sein.');
    if (rawMeta.notes !== undefined && typeof rawMeta.notes !== 'string')
      throw fail('Gerätehinweise in der Projektdatei müssen Text sein.');
    const metadata = {
      deviceName: String(rawMeta.deviceName ?? '').trim(),
      notes: String(rawMeta.notes ?? '').trim(),
    };
    if (metadata.deviceName.length > 80 || metadata.notes.length > 2000)
      throw fail('Gerätebeschreibung oder Hinweise überschreiten die zulässige Länge.');
    const s = o.settings || {},
      rules = {
        tcpPort: [1, 65535],
        baud: [1200, 115200],
        dataBits: [8, 8],
        stopBits: [1, 2],
        timeout: [100, 30000],
        guard: [50, 5000],
        pollDelay: [0, 60000],
        roundDelay: [100, 600000],
        regOffset: [-65535, 65535],
        scanFrom: [1, 247],
        scanTo: [1, 247],
        scanAddress: [0, 65535],
        scanTimeout: [50, 10000],
      };
    for (const [k, [min, max]] of Object.entries(rules)) {
      if (s[k] === undefined) continue;
      if (typeof s[k] === 'string' && s[k].trim() === '') throw fail(`Leerer Projektwert für „${k}“.`);
      const v = Number(s[k]);
      if (!Number.isFinite(v) || v < min || v > max || !Number.isInteger(v))
        throw fail(`Ungültiger Projektwert für „${k}“.`);
    }
    if (
      s.baud !== undefined &&
      ![1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(Number(s.baud))
    )
      throw fail('Ungültige Baudrate im Projekt.');
    if (s.skipErrors !== undefined && typeof s.skipErrors !== 'boolean')
      throw fail('Ungültige Einstellung für Fehler überspringen.');
    if (s.sameDeviceAddress !== undefined && typeof s.sameDeviceAddress !== 'boolean')
      throw fail('Ungültige Einstellung für gemeinsame Geräteadressen.');
    if (s.parity !== undefined && !['none', 'even', 'odd'].includes(s.parity))
      throw fail('Ungültige Parität im Projekt.');
    if (s.addressBase !== undefined && !['zero', 'one'].includes(s.addressBase))
      throw fail('Ungültige Adresseingabe im Projekt.');
    if (s.transport !== undefined && !['rtu', 'tcp', 'ethRtu'].includes(s.transport))
      throw fail('Ungültige Verbindungsart im Projekt.');
    if (s.tcpHost !== undefined && (typeof s.tcpHost !== 'string' || s.tcpHost.length > 253))
      throw fail('Ungültige IP-Adresse oder Hostname im Projekt.');
    if (s.scanFrom !== undefined && s.scanTo !== undefined && Number(s.scanFrom) > Number(s.scanTo))
      throw fail('Bus-Scan-Startadresse liegt hinter der Endadresse.');
    const selected = s.scanFunctions ?? (s.scanFunction ? [s.scanFunction] : ['03', '04']);
    if (!Array.isArray(selected) || selected.some((x) => !['01', '02', '03', '04'].includes(String(x))))
      throw fail('Ungültige Prüf-Funktion im Bus Scan.');
    const points = o.points.map((p, i) => {
      if (
        !p ||
        String(p.address ?? '').trim() === '' ||
        String(p.device ?? '').trim() === '' ||
        String(p.scale ?? 1).trim() === '' ||
        String(p.offset ?? 0).trim() === '' ||
        String(p.decimals ?? 2).trim() === ''
      )
        throw fail(`Datenpunkt ${i + 1}: numerische Pflichtfelder dürfen nicht leer sein.`);
      if (!String(p.name ?? '').trim()) throw fail(`Datenpunkt ${i + 1}: Bezeichnung darf nicht leer sein.`);
      const q = {
        id: `project-${i}`,
        enabled: p.enabled !== false,
        name: String(p.name).trim().slice(0, 80),
        device: Number(p.device),
        func: String(p.func),
        address: Number(p.address),
        format: String(p.format),
        scale: Number(p.scale ?? 1),
        offset: Number(p.offset ?? 0),
        decimals: Number(p.decimals ?? 2),
        bit: Number(p.bit ?? 0),
        value: '—',
        raw: '—',
        status: 'Bereit',
        statusType: '',
      };
      try {
        validate(q);
      } catch (e) {
        throw fail('Datenpunkt ' + (i + 1) + ' (' + q.name + '): ' + e.message);
      }
      return q;
    });
    return { s, selected: [...new Set(selected.map(String))], points, metadata };
  }
  function applyProject(o, { recovery = false } = {}) {
    if (app.connected) throw fail('Trenne zuerst den Port, bevor du ein Projekt öffnest.');
    const { s, selected, points, metadata } = validateProject(o);
    const map = {
      transport: 'transport',
      tcpHost: 'tcpHost',
      tcpPort: 'tcpPort',
      baud: 'baud',
      parity: 'parity',
      dataBits: 'dataBits',
      stopBits: 'stopBits',
      timeout: 'timeout',
      guard: 'guard',
      pollDelay: 'pollDelay',
      roundDelay: 'roundDelay',
      regOffset: 'regOffset',
      addressBase: 'addressBase',
      scanFrom: 'scanFrom',
      scanTo: 'scanTo',
      scanAddress: 'scanAddress',
      scanTimeout: 'scanTimeout',
      skipErrors: 'skipErrors',
      sameDeviceAddress: 'sameDeviceAddress',
    };
    for (const [k, id] of Object.entries(map)) {
      if (['skipErrors', 'sameDeviceAddress'].includes(id)) $('#' + id).checked = s[k] ?? DEFAULT_SETTINGS[k];
      else $('#' + id).value = s[k] ?? DEFAULT_SETTINGS[k];
    }
    app.transportMode = $('#transport').value;
    $$('.scan-fc').forEach((x) => (x.checked = selected.includes(x.value)));
    app.points = points;
    app.projectInfo = metadata;
    app.projectLoaded = !recovery || points.length > 0 || Boolean(metadata.deviceName || metadata.notes);
    $('#unloadProject').disabled = !app.projectLoaded;
    syncSharedDeviceAddress();
    render();
    $('#addressBaseSummary').textContent =
      `Datenpunkt-Adressen: ${$('#addressBase').value === 'one' ? '1-basiert' : '0-basiert'}`;
    if (recovery) $('#projectInfoPanel').classList.add('hidden');
    else renderProjectInfo(s, points.length);
    clearTopError();
    scheduleLocalSave();
    if (!recovery) log('Projekt geöffnet. Einstellungen und Datenpunkte wurden geladen.', 'ok');
  }
  function scheduleLocalSave() {
    app.saveDirty = true;
    clearTimeout(app.saveTimer);
    app.saveTimer = setTimeout(saveLocalProjectNow, 500);
  }
  function restoreLocalProject() {
    try {
      const entries = snapshotEntries();
      let previous;
      try {
        previous = sessionStorage.getItem('registerwerk-last-snapshot');
      } catch {}
      const preferred = entries.find((x) => x.key === previous);
      const ordered = preferred ? [preferred, ...entries.filter((x) => x !== preferred)] : entries;
      for (const entry of ordered) {
        if (!entry.data) continue;
        try {
          applyProject(entry.data.project, { recovery: true });
          $('#localSaveState').textContent =
            `Sitzung wiederhergestellt · ${new Date(entry.time).toLocaleString('de-DE')}`;
          log(
            'Lokale Sitzung wurde wiederhergestellt. Weitere Tabs speichern in getrennten, auf fünf begrenzten Sicherungen.',
            'ok',
          );
          return true;
        } catch (e) {
          log('Ungültige lokale Sicherung übersprungen: ' + e.message, 'warn');
        }
      }
      return false;
    } catch (e) {
      $('#localSaveState').textContent = 'Browserspeicher nicht verfügbar · Export verwenden';
      return false;
    }
  }
  function parseWriteSpec() {
    if (!$('#writeDevice').value.trim() || !$('#writeAddress').value.trim())
      throw fail('Geräteadresse und Startadresse müssen ausgefüllt sein.');
    const device = Number($('#writeDevice').value),
      fc = Number($('#writeFunction').value),
      enteredAddress = Number($('#writeAddress').value);
    const base = $('#addressBase').value === 'one' ? 1 : 0,
      offsetRaw = $('#regOffset').value.trim(),
      offset = Number(offsetRaw),
      address = enteredAddress - base + offset;
    if (!Number.isInteger(device) || device < 1 || device > 247)
      throw fail('Geräteadresse muss zwischen 1 und 247 liegen.');
    if (!offsetRaw || !Number.isInteger(offset) || offset < -65535 || offset > 65535)
      throw fail('Ungültiger Registeroffset.');
    if (
      !Number.isInteger(enteredAddress) ||
      enteredAddress < 0 ||
      enteredAddress > 65535 ||
      !Number.isInteger(address) ||
      address < 0 ||
      address > 65535
    )
      throw fail('Startadresse liegt nach Basis- und Offset-Umrechnung außerhalb 0 bis 65535.');
    if (![5, 6, 15, 16].includes(fc)) throw fail('Unbekannte Schreibfunktion.');
    const raw = $('#writeValues').value.trim(),
      coil = [5, 15].includes(fc),
      format = coil ? 'BOOL' : $('#writeFormat').value;
    if (!raw) throw fail('Bitte mindestens einen Wert eingeben.');
    if (!coil && !/^(?:U?INT16|(?:U?INT32|FLOAT32) (?:ABCD|BADC|CDAB|DCBA))$/.test(format))
      throw fail('Unbekanntes Schreibformat.');
    const tokens = raw.split(/[;\s]+/).filter(Boolean),
      values = [],
      inputValues = [];
    for (const token of tokens) {
      if (coil) {
        if (!['0', '1'].includes(token))
          throw fail('Coils: nur 0 oder 1. Mehrere Werte mit Semikolon oder Leerzeichen trennen.');
        values.push(Number(token));
        inputValues.push(token);
        continue;
      }
      const floating = format.startsWith('FLOAT32');
      if (
        floating
          ? !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(token)
          : !/^[+-]?\d+$/.test(token)
      )
        throw fail(
          'Ungültiger Wert „' +
            token +
            '“. Dezimalkomma ist nur für FLOAT32 erlaubt. Mehrere Werte mit Semikolon oder Leerzeichen trennen.',
        );
      const number = Number(token.replace(',', '.'));
      if (!Number.isFinite(number)) throw fail('Registerwerte müssen endliche Zahlen sein.');
      inputValues.push(token);
      if (format === 'UINT16' || format === 'INT16') {
        const min = format === 'INT16' ? -32768 : 0,
          max = format === 'INT16' ? 32767 : 65535;
        if (number < min || number > max) throw fail(format + ' liegt außerhalb des gültigen Wertebereichs.');
        values.push(number & 65535);
        continue;
      }
      const dv = new DataView(new ArrayBuffer(4));
      if (floating) {
        dv.setFloat32(0, number);
        if (!Number.isFinite(dv.getFloat32(0)))
          throw fail('FLOAT32 liegt außerhalb des gültigen Wertebereichs.');
      } else if (format.startsWith('INT32')) {
        if (number < -2147483648 || number > 2147483647)
          throw fail('INT32 liegt außerhalb des gültigen Wertebereichs.');
        dv.setInt32(0, number);
      } else {
        if (number < 0 || number > 4294967295)
          throw fail('UINT32 liegt außerhalb des gültigen Wertebereichs.');
        dv.setUint32(0, number);
      }
      const order = format.split(' ').at(-1),
        orders = { ABCD: [0, 1, 2, 3], BADC: [1, 0, 3, 2], CDAB: [2, 3, 0, 1], DCBA: [3, 2, 1, 0] },
        indices = orders[order];
      if (!indices) throw fail('Ungültige Byte-Reihenfolge.');
      const bytes = [];
      indices.forEach((wire, i) => (bytes[wire] = dv.getUint8(i)));
      values.push((bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]);
    }
    if ([5, 6].includes(fc) && values.length !== 1)
      throw fail(
        'Die Einzel-Schreibfunktion benötigt genau ein 16-Bit-Register oder ein Coil. Für 32-Bit-Werte Funktion 16 auswählen.',
      );
    if (fc === 15 && values.length > 1968) throw fail('Funktion 15 erlaubt höchstens 1968 Coils.');
    if (fc === 16 && values.length > 123) throw fail('Funktion 16 erlaubt höchstens 123 Register.');
    if (address + values.length - 1 > 65535)
      throw fail('Der Schreibbereich überschreitet Protokolladresse 65535.');
    return { device, fc, enteredAddress, address, values, format, inputValues };
  }
  function buildWrite(spec) {
    const { device, fc, address, values } = spec,
      head = [device, fc, address >> 8, address & 255];
    if (fc === 5) return frame([...head, values[0] ? 255 : 0, 0]);
    if (fc === 6) return frame([...head, values[0] >> 8, values[0] & 255]);
    if (fc === 15) {
      const bytes = new Array(Math.ceil(values.length / 8)).fill(0);
      values.forEach((v, i) => {
        if (v) bytes[i >> 3] |= 1 << (i & 7);
      });
      return frame([...head, values.length >> 8, values.length & 255, bytes.length, ...bytes]);
    }
    const bytes = [];
    for (const v of values) bytes.push(v >> 8, v & 255);
    return frame([...head, values.length >> 8, values.length & 255, bytes.length, ...bytes]);
  }
  function validateWriteAck(resp, spec, request) {
    const fc = spec.fc;
    if (resp.length < 5) throw fail('Schreibantwort ist zu kurz.');
    const got = resp.at(-2) | (resp.at(-1) << 8),
      want = crc16(resp.slice(0, -2));
    if (got !== want) throw fail('CRC-Prüfung der Schreibantwort fehlgeschlagen.');
    if (resp[0] !== spec.device) throw fail(`Schreibantwort von Gerät ${resp[0]} statt ${spec.device}.`);
    if (resp[1] === (fc | 128)) {
      const codes = {
        1: 'Funktion nicht unterstützt',
        2: 'Datenadresse unzulässig',
        3: 'Datenwert unzulässig',
        4: 'Gerätefehler',
      };
      throw fail(
        `Schreibbefehl abgelehnt · Modbus-Ausnahme ${resp[2]}: ${codes[resp[2]] || 'unbekannter Fehlercode'}.`,
      );
    }
    if (resp[1] !== fc) throw fail(`Unerwarteter Funktionscode ${resp[1]} in Schreibantwort.`);
    if (resp.length !== 8) throw fail('Schreibantwort hat eine unerwartete Länge.');
    if (fc === 5 || fc === 6) {
      if (resp.slice(0, 6).some((v, i) => v !== request[i]))
        throw fail('Quittierung spiegelt Adresse oder Wert nicht korrekt zurück.');
    } else {
      const quantity = spec.values.length;
      if (
        resp[2] !== request[2] ||
        resp[3] !== request[3] ||
        resp[4] !== ((quantity >> 8) & 255) ||
        resp[5] !== (quantity & 255)
      )
        throw fail('Quittierung spiegelt Startadresse oder Anzahl nicht korrekt zurück.');
    }
  }
  async function verifyWrite(spec) {
    const coil = [5, 15].includes(spec.fc),
      fc = coil ? 1 : 3,
      qty = spec.values.length,
      p = { device: spec.device, func: String(fc).padStart(2, '0'), format: 'UINT16', bit: 0 };
    const req = frame([spec.device, fc, spec.address >> 8, spec.address & 255, qty >> 8, qty & 255]),
      resp = await exchange(req, p, fc);
    if (resp[0] !== spec.device) throw fail('Rückleseantwort von falscher Geräteadresse.');
    const got = resp.at(-2) | (resp.at(-1) << 8);
    if (got !== crc16(resp.slice(0, -2))) throw fail('CRC-Prüfung der Rückleseantwort fehlgeschlagen.');
    if (resp[1] === (fc | 128))
      throw fail(`Schreibbefehl quittiert; Rücklesen meldet Modbus-Ausnahme ${resp[2]}.`);
    if (resp[1] !== fc) throw fail('Unerwarteter Funktionscode beim Rücklesen.');
    const expectedBytes = coil ? Math.ceil(qty / 8) : qty * 2;
    if (resp[2] !== expectedBytes || resp.length !== expectedBytes + 5)
      throw fail('Rückleseantwort enthält eine unerwartete Datenlänge.');
    const actual = [];
    if (coil) {
      for (let i = 0; i < qty; i++) actual.push((resp[3 + (i >> 3)] >> (i & 7)) & 1);
    } else {
      for (let i = 0; i < qty; i++) actual.push((resp[3 + i * 2] << 8) | resp[4 + i * 2]);
    }
    const mismatch = actual.findIndex((v, i) => v !== spec.values[i]);
    if (mismatch >= 0)
      throw fail(
        `Schreibbefehl quittiert, aber Rücklesewert ${mismatch + 1} weicht ab (gesendet ${spec.values[mismatch]}, gelesen ${actual[mismatch]}).`,
      );
    return true;
  }
  async function performWrite() {
    const spec = app.writeSpec;
    if (!spec || app.writing || app.blockReading || app.resyncing) return;
    $('#confirmWrite').classList.remove('show');
    app.writing = true;
    configureControls();
    $('#doWrite').disabled = true;
    try {
      const request = buildWrite(spec),
        response = await exchange(request, { device: spec.device }, spec.fc);
      validateWriteAck(response, spec, request);
      log('Schreibquittung · ' + hex(response), 'ok');
      try {
        await verifyWrite(spec);
        log('Rückleseprüfung erfolgreich · ' + spec.values.length + ' Wert(e) stimmen überein.', 'ok');
        clearTopError();
      } catch (e) {
        const unsupported = /Modbus-Ausnahme (1|2)\b/.test(e.message);
        const msg = unsupported
          ? 'Schreibbefehl quittiert. Das Register lässt sich nicht zurücklesen (Schreib- oder Kommando-Register).'
          : 'Schreibbefehl wurde quittiert; Rückleseprüfung fehlgeschlagen: ' + e.message;
        log(msg, unsupported ? 'warn' : 'error');
        if (!unsupported) showTopError(msg);
        else clearTopError();
      }
    } catch (e) {
      const msg = ['TIMEOUT', 'SEND_FAILED'].includes(e.code)
        ? e.message +
          ' Der Schreibbefehl kann trotzdem ausgeführt worden sein. Vor einem erneuten Versuch zuerst den Anlagenzustand prüfen.'
        : e.message;
      log('Schreibbefehl fehlgeschlagen: ' + msg, 'error');
      showTopError('Schreibbefehl nicht bestätigt: ' + msg);
    } finally {
      $('#doWrite').disabled = false;
      app.writeSpec = null;
      app.writing = false;
      configureControls();
    }
  }
  function updateWriteHint() {
    const fc = Number($('#writeFunction').value),
      coil = [5, 15].includes(fc);
    $('#writeFormatField').classList.toggle('hidden', coil);
    $('#writeFormat').disabled = coil;
    $('#writeHint').textContent =
      (coil
        ? 'Coils: 0 oder 1. '
        : fc === 6
          ? 'Ein 16-Bit-Register; 32-Bit-Werte benötigen FC 16. '
          : '32-Bit-Werte belegen je zwei Register. ') +
      'Mehrere Werte mit Semikolon oder Leerzeichen trennen. FLOAT32 erlaubt Dezimalkomma und Dezimalpunkt.';
    $('#writeValues').placeholder = coil ? '0; 1; 0' : 'z. B. 23,5; -12; 1.25';
  }
  $('#openWrite').onclick = () => {
    $('#writeComposer').classList.add('show');
    updateWriteHint();
  };
  $('#cancelCompose').onclick = () => $('#writeComposer').classList.remove('show');
  $('#writeFunction').onchange = updateWriteHint;
  $('#writeFormat').title =
    'Werteformat und Byte-Reihenfolge. 32-Bit-Werte werden bei Funktion 16 als zwei Register geschrieben.';
  $('#previewWrite').onclick = () => {
    try {
      if (!validateFields([...$('#writeComposer').querySelectorAll('input'), $('#regOffset')])) return;
      const spec = parseWriteSpec();
      app.writeSpec = spec;
      const range =
        'Eingabe ' +
        spec.enteredAddress +
        ' · Protokoll ' +
        spec.address +
        (spec.values.length > 1 ? '–' + (spec.address + spec.values.length - 1) : '');
      $('#confirmText').textContent =
        'Gerät ' +
        spec.device +
        ' · FC ' +
        String(spec.fc).padStart(2, '0') +
        ' · ' +
        range +
        ' · Format: ' +
        spec.format +
        ' · Klartextwerte: ' +
        spec.inputValues.join('; ') +
        ' · ' +
        spec.inputValues.length +
        ' Wert(e) → ' +
        spec.values.length +
        ([5, 15].includes(spec.fc) ? ' Coil(s)' : ' Register') +
        ' · Protokollwörter: ' +
        spec.values.join(', ') +
        '. Nach dem Senden wird der Bereich zurückgelesen. Es erfolgt kein automatischer Wiederholungsversuch.';
      $('#writeComposer').classList.remove('show');
      $('#confirmWrite').classList.add('show');
    } catch (e) {
      showTopError(e.message);
      log(`Schreibbefehl nicht vorbereitet: ${e.message}`, 'error');
    }
  };
  $('#cancelWrite').onclick = () => {
    app.writeSpec = null;
    $('#confirmWrite').classList.remove('show');
  };
  $('#doWrite').onclick = performWrite;
  $('#writeComposer').addEventListener('click', (e) => {
    if (e.target === $('#writeComposer')) $('#writeComposer').classList.remove('show');
  });
  $('#confirmWrite').addEventListener('click', (e) => {
    if (e.target === $('#confirmWrite')) {
      $('#confirmWrite').classList.remove('show');
      app.writeSpec = null;
    }
  });
  let helpReturnFocus = null;
  function openHelp() {
    if ($('#helpDialog').classList.contains('show')) return;
    helpReturnFocus = document.activeElement;
    $('#helpDialog').classList.add('show');
    document.body.classList.add('help-open');
    $('#helpContent').scrollTop = 0;
    $('#closeHelp').focus();
  }
  function closeHelp() {
    $('#helpDialog').classList.remove('show');
    document.body.classList.remove('help-open');
    if (helpReturnFocus?.isConnected) helpReturnFocus.focus({ preventScroll: true });
    helpReturnFocus = null;
  }
  $('#openHelp').addEventListener('click', openHelp);
  $('#closeHelp').addEventListener('click', closeHelp);
  $('#closeHelpBottom').addEventListener('click', closeHelp);
  $('#helpDialog').addEventListener('click', (e) => {
    if (e.target === $('#helpDialog')) closeHelp();
  });
  $('.help-nav').addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#help-"]');
    if (!link) return;
    e.preventDefault();
    const section = $(link.getAttribute('href'));
    section.scrollIntoView({ block: 'start' });
    section.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      openHelp();
      return;
    }
    const vs = $$('.veil.show'),
      veil = vs.at(-1);
    if (!veil) return;
    const d = veil.querySelector('[role=dialog],.dialog'),
      f = [
        ...d.querySelectorAll(
          'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary',
        ),
      ].filter((element) => element.getClientRects().length);
    if (e.key === 'Escape') {
      e.preventDefault();
      if (veil.id === 'helpDialog') {
        closeHelp();
        return;
      }
      if (veil.id === 'confirmWrite') app.writeSpec = null;
      veil.classList.remove('show');
      return;
    }
    if (e.key === 'Tab' && f.length) {
      if (!d.contains(document.activeElement)) {
        e.preventDefault();
        f[0].focus();
      } else if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });
  function openExportDialog() {
    const field = $('#exportFilename');
    if (!field.value.trim()) field.value = 'registerwerk-projekt';
    $('#projectDeviceName').value = app.projectInfo.deviceName || '';
    $('#projectNotes').value = app.projectInfo.notes || '';
    $('#exportError').hidden = true;
    $('#exportPreview').textContent = exportName(field.value);
    $('#exportDialog').classList.add('show');
    field.focus();
    field.select();
  }
  function exportName(value) {
    const base = value.trim().replace(/\.json$/i, '');
    return `${base || 'registerwerk-projekt'}.json`;
  }
  function performProjectExport() {
    try {
      const base = $('#exportFilename')
        .value.trim()
        .replace(/\.json$/i, '');
      if (!base) throw fail('Bitte einen Dateinamen eingeben.');
      if (/[<>:"/\\|?*\x00-\x1f]/.test(base))
        throw fail('Der Dateiname enthält Zeichen, die Windows nicht zulässt.');
      if (/[. ]$/.test(base)) throw fail('Der Dateiname darf nicht mit Punkt oder Leerzeichen enden.');
      if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(base))
        throw fail('Dieser Name ist unter Windows reserviert.');
      const snapshot = project();
      snapshot.metadata = {
        deviceName: $('#projectDeviceName').value.trim(),
        notes: $('#projectNotes').value.trim(),
      };
      validateProject(snapshot);
      const filename = base + '.json',
        blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
        a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      app.projectInfo = snapshot.metadata;
      scheduleLocalSave();
      renderProjectInfo(snapshot.settings, snapshot.points.length);
      $('#exportDialog').classList.remove('show');
      log('Projekt exportiert · ' + filename, 'ok');
    } catch (e) {
      $('#exportError').textContent = e.message;
      $('#exportError').hidden = false;
    }
  }
  const projectMenuToggle = $('#projectMenuToggle'), projectMenu = $('#projectMenu');
  function closeProjectMenu(returnFocus = false) {
    projectMenu.hidden = true;
    projectMenuToggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) projectMenuToggle.focus();
  }
  projectMenuToggle.addEventListener('click', () => {
    const opening = projectMenu.hidden;
    projectMenu.hidden = !opening;
    projectMenuToggle.setAttribute('aria-expanded', String(opening));
    if (opening) projectMenu.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
  });
  projectMenu.addEventListener('click', (event) => {
    const item = event.target.closest('[role="menuitem"]');
    if (!item || item.disabled) return;
    closeProjectMenu();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.project-menu')) closeProjectMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (projectMenu.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeProjectMenu(true); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const items = [...projectMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
      const current = items.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
      event.preventDefault(); items[next]?.focus();
    }
  });
  $('#unloadProject').onclick = () => {
    if (!app.projectLoaded) return;
    if (app.connected || app.running || app.scanning || app.writing || app.blockReading) {
      showTopError('Zum Entladen zuerst Verbindung und laufende Abfragen beenden.');
      return;
    }
    if (!window.confirm('Projekt entladen? Alle Datenpunkte und Projekt-Hinweise werden entfernt.')) return;
    clearTimeout(app.saveTimer);
    app.points = [];
    app.projectInfo = { deviceName: '', notes: '' };
    app.projectLoaded = false;
    $('#unloadProject').disabled = true;
    $('#projectInfoTitle').textContent = 'Projektinformationen';
    $('#projectInfoSettings').textContent = '';
    $('#projectInfoNotes').textContent = '';
    $('#projectInfoNotes').hidden = true;
    $('#projectInfoPanel').classList.add('hidden');
    $('#projectDeviceName').value = '';
    $('#projectNotes').value = '';
    render();
    clearTopError();
    scheduleLocalSave();
    log('Projekt entladen · Datenpunkte und Hinweise entfernt.', 'ok');
  };
  $('#saveProject').onclick = openExportDialog;
  $('#cancelExport').onclick = () => $('#exportDialog').classList.remove('show');
  $('#confirmExport').onclick = performProjectExport;
  $('#closeProjectInfo').onclick = () => $('#projectInfoPanel').classList.add('hidden');
  for (const [id, key] of [
    ['projectDeviceName', 'deviceName'],
    ['projectNotes', 'notes'],
  ])
    $('#' + id).addEventListener('input', () => {
      $('#exportError').hidden = true;
    });
  $('#exportFilename').addEventListener('input', (e) => {
    $('#exportPreview').textContent = exportName(e.target.value);
    $('#exportError').hidden = true;
  });
  $('#exportFilename').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performProjectExport();
    }
    if (e.key === 'Escape') $('#exportDialog').classList.remove('show');
  });
  $('#exportDialog').addEventListener('click', (e) => {
    if (e.target === $('#exportDialog')) $('#exportDialog').classList.remove('show');
  });
  $('#loadProject').onclick = () => $('#projectFile').click();
  $('#projectFile').onchange = async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2_000_000) throw fail('Projektdatei ist größer als 2 MB.');
      applyProject(JSON.parse(await file.text()));
    } catch (err) {
      showTopError(err.message);
      log(`Projekt konnte nicht geöffnet werden: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  };
  if ('serial' in navigator) {
    navigator.serial.addEventListener('disconnect', (e) => {
      if (app.port === e.port) handleConnectionLost(fail('COM-Port wurde abgezogen.'));
    });
  } else {
    $('#browserNotice').hidden = false;
  }
  window.addEventListener('pagehide', saveLocalProjectNow);
  window.addEventListener('beforeunload', (e) => {
    if (app.connected) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  if (!restoreLocalProject()) newPoint();
  $('#transport').addEventListener('change', () => {
    app.transportMode = $('#transport').value;
    if (!app.connected) {
      const label = app.transportMode === 'rtu' ? 'RTU' : app.transportMode === 'tcp' ? 'Modbus TCP' : 'Ethernet-RTU-Brücke';
      $('#portSummary').textContent = app.transportMode === 'rtu' ? 'RTU · kein Port ausgewählt' : `${label} · nicht verbunden`;
    }
    configureControls();
    scheduleLocalSave();
  });
  $$(
    '#tcpHost,#tcpPort,#baud,#parity,#dataBits,#stopBits,#timeout,#guard,#pollDelay,#roundDelay,#regOffset,#addressBase,#scanFrom,#scanTo,#scanAddress,#scanTimeout',
  ).forEach((x) => {
    x.addEventListener('change', () => {
      if (x.id === 'addressBase')
        $('#addressBaseSummary').textContent =
          `Datenpunkt-Adressen: ${x.value === 'one' ? '1-basiert' : '0-basiert'}`;
      scheduleLocalSave();
    });
  });
  $$('.scan-fc').forEach((x) => x.addEventListener('change', scheduleLocalSave));
  window.registerwerkUpdateIdle = () => !(app.connected || app.connecting || app.running || app.scanning || app.writing || app.blockReading || app.resyncing || app.updateInstalling || $('#desktopPortDialog')?.classList.contains('show') || $('#txEditor')?.classList.contains('show'));
  window.registerwerkPrepareUpdate = () => {
    if (!window.registerwerkUpdateIdle()) return false;
    saveLocalProjectNow();
    if (app.saveDirty) return false;
    app.updateInstalling = true;
    document.body.inert = true;
    configureControls();
    return true;
  };
  window.registerwerkCancelUpdate = () => {
    app.updateInstalling = false;
    document.body.inert = false;
    configureControls();
  };
  $('#skipErrors').addEventListener('change', scheduleLocalSave);
  $('#sameDeviceAddress').addEventListener('change', () => {
    syncSharedDeviceAddress();
    render();
    scheduleLocalSave();
  });
  // TX OPEN: IOOPT-Editor innerhalb derselben Anwendung.
  (() => {
    const menu = document.createElement('div');
    menu.className = 'project-menu tx-menu';
    menu.innerHTML = `<button class="btn dark" id="txMenuToggle" type="button" aria-haspopup="menu" aria-expanded="false">Export ▾</button><div class="project-menu-items" id="txMenu" role="menu" hidden><button type="button" role="menuitem" id="txOpenExport">TXI2.OPEN – Export</button><button type="button" role="menuitem" id="txLoadFile">Datei laden zum Weiterarbeiten</button></div><input class="file-input" id="txFile" type="file" accept=".ioopt,.xml,text/xml,application/xml">`;
    $('#projectMenuToggle').parentElement.insertAdjacentElement('afterend', menu);
    const veil = document.createElement('div');
    veil.className = 'veil tx-veil'; veil.id = 'txEditor';
    veil.innerHTML = `<div class="dialog tx-dialog" role="dialog" aria-modal="true" aria-labelledby="txTitle">
      <div class="tx-title"><div><h3 id="txTitle">TXI2.OPEN · Punktvorlage</h3><p id="txStatus">Datenpunkte auswählen und vor dem Export prüfen.</p></div><button id="txClose" class="btn" type="button">Schließen</button></div>
      <div class="tx-top"><label>Vorlagenname <input id="txFunction" maxlength="80" placeholder="z. B. VSR"></label><label>Gerätebeschreibung <input id="txDeviceDesc" maxlength="160" placeholder="Optional"></label><label>Protokoll-Applikation <input id="txProtocol" value="Modbus_HQ_V6.00"></label><label>TX-Bustyp <select id="txBus"><option value="RS485">RS485 · ohne Abschluss</option><option value="RS485T">RS485T · mit Abschluss</option><option value="RS232">RS232</option><option value="IPv4">IPv4 · Modbus TCP</option></select></label><label>Bus-Kommunikation <input id="txBusComm" placeholder="Im TX Open Tool prüfen"></label><label>Geräte-Kommunikation <input id="txComm" placeholder="Im TX Open Tool prüfen"></label></div>
      <p class="hint">Eine Vorlage beschreibt einen Gerätetyp. Geräteadresse und Verbindungsdaten werden im TX-Open-Projekt geprüft. Die erzeugte IOOPT muss im TX Open Tool importiert und geprüft werden.</p>
      <div class="tx-actions"><button id="txFromProject" class="btn" type="button">Datenpunkte aus Projekt übernehmen</button><button id="txAdd" class="btn" type="button">+ Datenpunkt</button><button id="txSelectAll" class="btn" type="button">Alle auswählen</button><button id="txSelectNone" class="btn" type="button">Auswahl aufheben</button><button id="txRemove" class="btn danger" type="button">Ausgewählte entfernen</button></div>
      <div class="tx-options"><label>I/O-Namen beim Export <select id="txNames"><option value="keep">Wie bearbeitet übernehmen</option><option value="blank">Leer lassen</option><option value="neutral">Neutral: DP_001 …</option></select></label><label class="checkbox-option"><input id="txDescriptions" type="checkbox" checked> Beschreibungen übernehmen</label><label class="checkbox-option"><input id="txUnits" type="checkbox" checked> Einheiten übernehmen</label><label class="checkbox-option"><input id="txRanges" type="checkbox" checked> Standardwerte und Wertebereiche übernehmen</label><label class="checkbox-option"><input id="txAnonymize" type="checkbox" checked> Pfad / Benutzer entfernen, Gerätekennung ersetzen</label><label class="checkbox-option"><input id="txAllowMismatch" type="checkbox"> Abweichende Konfiguration nach Prüfung übernehmen</label></div>
      <div class="tx-bulk"><strong>Zusätze für ausgewählte Datenpunkte</strong><div id="txBulkOptions" class="tx-bulk-options"><label><input type="checkbox" value="/R15"> /R15 · Alarme unterdrücken</label><label><input type="checkbox" value="/S"> /S · einzeln übertragen</label><label><input type="checkbox" value="/F"> /F · Feedback</label><label><input type="checkbox" value="/R1"> /R1 · 1 Minute</label><label><input type="checkbox" value="/R2"> /R2 · 1 Stunde</label><label><input type="checkbox" value="/R3"> /R3 · 10 Stunden</label><label><input type="checkbox" value="/R4"> /R4 · 24 Stunden</label><label><input type="checkbox" value="/GN"> /GN · Gruppenstart</label><label><input type="checkbox" value="/G"> /G · Gruppe</label><label><input type="checkbox" value="/D="> /D= <input id="txBulkD" type="text" inputmode="decimal" aria-label="Divisor für D" placeholder="Wert"></label><label><input type="checkbox" value="/M="> /M= <input id="txBulkM" type="text" inputmode="decimal" aria-label="Korrekturwert für M" placeholder="Wert"></label></div><button id="txApplyOption" class="btn" type="button">Zusätze hinzufügen</button><button id="txRemoveOption" class="btn" type="button">Zusätze entfernen</button></div>
      <div class="tx-table-wrap"><table class="tx-table"><thead><tr><th>Auswahl</th><th>I/O-Name</th><th>Beschreibung</th><th>Gerät</th><th>TX-Typ</th><th>Konversions-Set</th><th>Fremd-Signaltyp / Zusätze</th><th></th></tr></thead><tbody id="txRows"></tbody></table><div id="txEmpty" class="blank">Noch keine Datenpunkte. Übernimm ein Projekt oder lade eine IOOPT-Datei.</div></div>
      <div id="txDetails" class="tx-details hidden"><div class="tx-title"><strong id="txDetailTitle">Datenpunkt bearbeiten</strong><button id="txDetailClose" class="btn subtle" type="button">Fertig</button></div><div class="tx-fields">
        <label>I/O-Name <input id="txName" maxlength="120"></label><label>Beschreibung <input id="txDesc" maxlength="240"></label><label>TX-Typ <select id="txKind"><option value="AI">AI · analog lesen</option><option value="AO">AO · analog schreiben</option><option value="BI">BI · binär lesen</option><option value="BO">BO · binär schreiben</option><option value="custom">Weitere · Kennungen beibehalten</option></select></label><label>Einheit <input id="txUnit" maxlength="100"></label>
        <label>Funktionscode <select id="txFc"><option value="1">01 · Coil lesen</option><option value="2">02 · Eingang lesen</option><option value="3">03 · Holding lesen</option><option value="4">04 · Input lesen</option><option value="5">05 · Coil schreiben</option><option value="6">06 · Register schreiben</option><option value="15">15 · Coils schreiben</option><option value="16">16 · Register schreiben</option></select></label><label>Protokolladresse <input id="txAddress" type="number" min="0" max="65535"></label><label>MappingInfo 3 · Bitposition <input id="txMi3" type="number" min="0" max="16"><span class="hint">0 = kein Bit; 1–16 = Bitposition im TX</span></label><label>MappingInfo 4 · Umwandlung <select id="txMi4"><option value="">Bitte auswählen</option><option value="0">0 · keine</option><option value="1">1 · Register tauschen</option><option value="2">2 · BCD16A</option><option value="3">3 · BCD16B</option><option value="4">4 · BCD32A</option><option value="5">5 · BCD32B</option><option value="6">6 · ACM16</option><option value="7">7 · U32BITMOD10000</option><option value="8">8 · S32BITMOD10000</option><option value="9">9 · Bytes tauschen</option><option value="10">10 · Bitanzahl</option><option value="11">11 · Bitanzahl</option><option value="12">12 · Bitanzahl</option><option value="13">13 · Bitanzahl</option><option value="14">14 · Bitanzahl</option><option value="15">15 · Bitanzahl</option><option value="16">16 · Bitanzahl</option></select><span class="hint">Bei Bitposition 1–16: Anzahl der Bits; sonst Format 0–9.</span></label>
        <label>Fremd-Signaltyp <input id="txSignal" list="txSignalTypes"><datalist id="txSignalTypes"><option value="BOOL"><option value="UINT16"><option value="SINT16"><option value="UINT32"><option value="SINT32"><option value="FLOAT"><option value="DOUBLE"><option value="FLOAT16"><option value="UINT48"><option value="SINT48"><option value="UINT64"><option value="SINT64"></datalist><span class="hint">Zusätze sind kombinierbar, z. B. UINT16/R15 /S.</span></label>
        <label>Standardwert <input id="txDefault"></label><label>Bereich unten <input id="txLow"></label><label>Bereich oben <input id="txHigh"></label><label>IoResourceType <input id="txResource"></label><label>IoSignalType <input id="txSystemType"></label><label>ObjectTag <input id="txObjectTag"></label></div>
        <p id="txRowWarning" class="alert warn" hidden></p><label class="checkbox-option"><input id="txReviewed" type="checkbox"> Hinweise zu Skalierung / Byte-Reihenfolge geprüft</label>
      </div>
      <div id="txError" class="alert error" hidden></div><div class="tx-bottom"><span id="txCount" class="hint"></span><button id="txExport" class="btn primary" type="button">IOOPT exportieren …</button></div>
      <p class="hint">Optional: weitere dokumentierte Zusätze wie /D= oder /M= direkt im Fremd-Signaltyp eintragen. Nur bekannte Kombinationen einsetzen; eine Prüfung im TX Open Tool bleibt erforderlich.</p>
    </div>`;
    document.body.appendChild(veil);
    const state = {rows: [], source: null, current: null, loaded: false};
    const kinds = {AI:['1','93','1'], AO:['2','93','3'], BI:['3','90','6'], BO:['4','90','8']};
    const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const error = (message = '') => { $('#txError').textContent = message; $('#txError').hidden = !message; };
    function resetExportChoices(imported) {
      $('#txNames').value = 'keep';
      for (const id of ['txDescriptions','txUnits','txAnonymize']) $('#'+id).checked = true;
      $('#txRanges').checked = imported;
      $('#txAllowMismatch').checked = false;
      $$('#txBulkOptions input[type="checkbox"]').forEach(el => el.checked = false);
      $('#txBulkD').value = ''; $('#txBulkM').value = '';
    }
    const controls = {name:'txName', desc:'txDesc', unit:'txUnit', fc:'txFc', address:'txAddress', mi3:'txMi3', mi4:'txMi4', signal:'txSignal', def:'txDefault', low:'txLow', high:'txHigh', resource:'txResource', systemType:'txSystemType', objectTag:'txObjectTag'};
    const conversionLabels = ['keine','Register tauschen','BCD16A','BCD16B','BCD32A','BCD32B','ACM16','U32BITMOD10000','S32BITMOD10000','Bytes tauschen'];
    function updateMi4Labels() {
      const bitMode = Number($('#txMi3').value) > 0;
      for (const option of $('#txMi4').options) {
        if (!option.value) continue;
        const n = Number(option.value);
        option.textContent = bitMode ? (n === 0 ? '0 · ältere Protokollversion prüfen' : `${n} · ${n === 1 ? 'ein Bit' : 'Bits'}`) : `${n} · ${conversionLabels[n] || 'nur Bitanzahl'}`;
        option.disabled = !bitMode && n > 9;
      }
    }
    function txType(r) { return Object.keys(kinds).find(k => kinds[k].every((v,i) => v === [r.resource,r.systemType,r.objectTag][i])) || 'custom'; }
    function listRows() {
      $('#txRows').innerHTML = state.rows.map((r,i) => `<tr><td><input type="checkbox" class="tx-check" data-i="${i}" ${r.selected?'checked':''} aria-label="Datenpunkt ${i+1} auswählen"></td><td>${escapeHtml(r.name || '—')}</td><td>${escapeHtml(r.desc || '—')}</td><td>${escapeHtml(r.device ?? '—')}</td><td>${escapeHtml(txType(r))}</td><td class="mono">${escapeHtml([r.fc,r.address,r.mi3,r.mi4].join(';'))}</td><td class="mono">${escapeHtml(r.signal)}</td><td><button class="btn tx-edit" type="button" data-i="${i}">Bearbeiten</button></td></tr>`).join('');
      $('#txEmpty').classList.toggle('hidden', state.rows.length > 0);
      const count = state.rows.filter(r=>r.selected).length;
      $('#txCount').textContent = `${count} von ${state.rows.length} Datenpunkten ausgewählt`;
    }
    function setDetail(i) {
      state.current = i;
      const r = state.rows[i];
      if (!r) { $('#txDetails').classList.add('hidden'); return; }
      $('#txDetails').classList.remove('hidden');
      $('#txDetailTitle').textContent = `Datenpunkt ${i+1} bearbeiten`;
      for (const [id,value] of [['txFc',r.fc],['txMi4',r.mi4]]) {
        const select = $('#'+id);
        if (value !== '' && ![...select.options].some(option => option.value === String(value)))
          select.add(new Option(`${value} · importiert`, String(value)));
      }
      for (const [key,id] of Object.entries(controls)) $('#'+id).value = r[key] ?? '';
      updateMi4Labels();
      $('#txKind').value = txType(r);
      $('#txReviewed').checked = Boolean(r.reviewed);
      $('#txReviewed').parentElement.classList.toggle('hidden', !r.warning);
      $('#txRowWarning').hidden = !r.warning;
      $('#txRowWarning').textContent = r.warning || '';
    }
    function collectDetail() {
      const r = state.rows[state.current]; if (!r) return;
      for (const [key,id] of Object.entries(controls)) r[key] = $('#'+id).value;
      r.reviewed = $('#txReviewed').checked;
    }
    function showEditor() { $('#txEditor').classList.add('show'); error(); listRows(); }
    function fromProject() {
      if (!app.points.length) { error('Das Projekt enthält keine Datenpunkte.'); return; }
      if (state.rows.length && !confirm('Die bisherige TX-Auswahl durch die aktuelle Datenpunktliste ersetzen?')) return;
      const offset = Number($('#regOffset').value), base = $('#addressBase').value === 'one' ? 1 : 0;
      const transport = $('#transport').value;
      const rawComm = transport === 'tcp' ? '' : `${$('#baud').value},${{none:'N',even:'E',odd:'O'}[$('#parity').value]},${$('#dataBits').value},${$('#stopBits').value},RS485,0,0,RTU`;
      state.rows = app.points.map((p,i) => {
        const fc = String(Number(p.func)), isBit = p.format === 'BOOL', registerBit = isBit && ['3','4'].includes(fc), binary = isBit || ['1','2'].includes(fc);
        const fmt = String(p.format).replace(/^INT16$/,'SINT16').replace(/^INT32/,'SINT32').replace(/^FLOAT32/,'FLOAT').replace(/ .*/,'');
        const order = String(p.format).includes(' ') ? String(p.format).split(' ').pop() : '';
        const uncertainOrder = order && !['ABCD','CDAB'].includes(order);
        const mi4 = registerBit ? '1' : order === 'CDAB' ? '1' : uncertainOrder ? '' : '0';
        const kind = binary ? 'BI' : 'AI';
        const warnings = [];
        if (Number(p.scale) !== 1 || Number(p.offset) !== 0) warnings.push(`Faktor ${p.scale} und Offset ${p.offset} werden nicht automatisch ins IOOPT übertragen. In Desigo projektieren und prüfen.`);
        if (uncertainOrder) warnings.push(`Byte-Reihenfolge ${order} ist nicht automatisch zugeordnet. Umwandlung manuell auswählen und prüfen.`);
        return {selected:p.enabled !== false, name:`DP_${String(i+1).padStart(3,'0')}`, desc:p.name, device:String(p.device), resource:kinds[kind][0], systemType:kinds[kind][1], objectTag:kinds[kind][2], unit:'', fc, address:String(Number(p.address)-base+offset), mi3:registerBit?String(Number(p.bit)+1):'0', mi4, signal:registerBit?'UINT16':binary?'BOOL':fmt === 'HEX16'?'UINT16':fmt, def:'0', low:'0', high:binary?'1':'', warning:warnings.join(' '), reviewed:false, original:null};
      });
      state.source=null; state.current=null; state.loaded=true; $('#txDetails').classList.add('hidden');
      resetExportChoices(false);
      $('#txFunction').value = 'Registerwerk'; $('#txDeviceDesc').value = app.projectInfo.deviceName || '';
      $('#txProtocol').value = 'Modbus_HQ_V6.00'; $('#txBus').value = transport === 'tcp' ? 'IPv4' : 'RS485'; $('#txBusComm').value = rawComm; $('#txComm').value = rawComm;
      $('#txStatus').textContent = transport === 'tcp' ? 'TCP-Projekt übernommen. TX-Kommunikation und IP im TX Open Tool ergänzen; IP und Port werden nicht automatisch übertragen.' : transport === 'ethRtu' ? 'Projekt übernommen. Registerwerk nutzt eine Ethernet-RTU-Brücke; die Verbindung des TX-Moduls separat prüfen.' : 'Datenpunkte aus Registerwerk übernommen. TX-Angaben vor dem Export prüfen.';
      listRows(); error();
    }
    function readIoopt(xml) {
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD und externe Entitäten werden nicht unterstützt.');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror') || doc.documentElement?.localName !== 'TxOpen') throw new Error('Ungültige IOOPT-XML-Datei.');
      const devices = [...doc.getElementsByTagName('ThirdDevice')], buses=[...doc.getElementsByTagName('ThirdBus')];
      if (devices.length !== 1 || buses.length !== 1) throw new Error('Bitte eine IOOPT-Vorlage mit genau einem Gerät laden.');
      const device = devices[0], points=[...device.children].filter(x=>x.localName==='ThirdIo');
      if (points.length > 500) throw new Error('Mehr als 500 Datenpunkte werden nicht unterstützt.');
      const rows = points.map((el) => {
        const a=(key,fallback='')=>el.getAttribute(key) ?? fallback, parts=a('ThirdConversionSet').split(';');
        if (parts.length !== 4) throw new Error('Ein Datenpunkt enthält kein vierteiliges ThirdConversionSet.');
        return {selected:true,name:a('IoName'),desc:a('IoDesc'),unit:a('IoUnit'),resource:a('IoResourceType'),systemType:a('IoSignalType'),objectTag:a('ObjectTag'),signal:a('ThirdSignalType'),def:a('ThirdDefaultValue'),low:a('ThirdRangeLow'),high:a('ThirdRangeHigh'),fc:parts[0],address:parts[1],mi3:parts[2],mi4:parts[3],device:null,warning:'',reviewed:false,original:el.cloneNode(true),originalName:a('IoName'),originalDesc:a('IoDesc'),originalUnit:a('IoUnit')};
      });
      return {doc,rows,functionName:device.getAttribute('FunctionName') || '',description:device.getAttribute('DevDesc') || '',protocol:buses[0].getAttribute('ProtAppName') || '',busType:buses[0].getAttribute('BusType') || 'RS485',busComm:buses[0].getAttribute('BusCommSettings') || '',comm:device.getAttribute('DevCommSettings') || ''};
    }
    function baseDoc() {
      return new DOMParser().parseFromString(`<?xml version="1.0" encoding="UTF-8"?><TxOpen xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" Version="0103"><DocumentHeader Version="0201"><DocumentSummary><DocumentCompany>Registerwerk</DocumentCompany><DocumentApplication xsi:nil="true"/><DocumentVersion>0</DocumentVersion><DocumentRevision>0</DocumentRevision></DocumentSummary><DocumentDelivery/></DocumentHeader><DocumentBody><ModuleCfg><SupportedItfs><Itf CLTag="STF" ItfVersion="01.10"/></SupportedItfs></ModuleCfg><ThirdBus BusType="RS485" ProtAppRevision="000"><ThirdDevice/></ThirdBus></DocumentBody></TxOpen>`, 'application/xml');
    }
    function checkSelected(rows) {
      if (!rows.length) throw new Error('Bitte mindestens einen Datenpunkt auswählen.');
      if (rows.length > 160) throw new Error('TXI2.OPEN unterstützt höchstens 160 Datenpunkte pro Modul.');
      const devices = new Set(rows.map(r=>r.device).filter(x=>x != null));
      if (devices.size > 1) throw new Error('Bitte Datenpunkte nur einer Geräteadresse für diese Gerätevorlage auswählen.');
      if ($('#txNames').value === 'keep') {
        const names = rows.map(r => String(r.name).trim().toLowerCase()).filter(Boolean);
        if (new Set(names).size !== names.length) throw new Error('I/O-Namen sind doppelt. Bitte ändern oder neutrale Namen auswählen.');
      }
      for (const [i,r] of rows.entries()) {
        const n=i+1, fc=Number(r.fc), address=Number(r.address), m3=Number(r.mi3), m4=Number(r.mi4), type=txType(r);
        if (!Number.isInteger(fc) || ![1,2,3,4,5,6,15,16].includes(fc)) throw new Error(`Punkt ${n}: Funktionscode prüfen.`);
        if (String(r.address).trim()==='' || !Number.isInteger(address) || address<0 || address>65535) throw new Error(`Punkt ${n}: Protokolladresse muss zwischen 0 und 65535 liegen.`);
        if (String(r.mi3).trim()==='' || !Number.isInteger(m3) || m3<0 || m3>16) throw new Error(`Punkt ${n}: MappingInfo 3 muss zwischen 0 und 16 liegen.`);
        if (String(r.mi4).trim()==='' || !Number.isInteger(m4) || m4<0 || (m3===0 ? m4>9 : (m4>16 || m3+m4>17))) throw new Error(`Punkt ${n}: MappingInfo 4 / Bitanzahl prüfen.`);
        if (m3 > 0 && m4 === 0 && !$('#txAllowMismatch').checked) throw new Error(`Punkt ${n}: Bitanzahl 0 nur bei passender älterer Protokollversion nach Prüfung übernehmen.`);
        if (m3>0 && ![3,4,6,16].includes(fc)) throw new Error(`Punkt ${n}: Bitposition ist nur für Registerfunktionen vorgesehen.`);
        if (!String(r.signal).trim()) throw new Error(`Punkt ${n}: Fremd-Signaltyp fehlt.`);
        if (r.warning && !r.reviewed) throw new Error(`Punkt ${n}: Skalierung oder Byte-Reihenfolge öffnen und Prüfung bestätigen.`);
        const baseType = String(r.signal).trim().split(/[\s/]/)[0].toUpperCase();
        if (m3 > 0 && !['UINT16','UINT32'].includes(baseType)) throw new Error(`Punkt ${n}: Für Bitpositionen UINT16 oder UINT32 als Fremd-Signaltyp verwenden.`);
        if (m3 === 0 && m4 === 1 && !['UINT32','SINT32','FLOAT'].includes(baseType)) throw new Error(`Punkt ${n}: Register tauschen erfordert UINT32, SINT32 oder FLOAT.`);
        if (m3 === 0 && [2,3].includes(m4) && baseType !== 'UINT16') throw new Error(`Punkt ${n}: BCD16 erfordert UINT16.`);
        if (m3 === 0 && [4,5,6,7].includes(m4) && baseType !== 'UINT32') throw new Error(`Punkt ${n}: Die gewählte Konvertierung erfordert UINT32.`);
        if (m3 === 0 && m4 === 8 && baseType !== 'SINT32') throw new Error(`Punkt ${n}: S32BITMOD10000 erfordert SINT32.`);
        const periods = String(r.signal).match(/\/R[1-4](?=\s|\/|$)/gi) || [];
        if (new Set(periods.map(x=>x.toUpperCase())).size>1) throw new Error(`Punkt ${n}: Nur ein periodisches Schreibintervall /R1 bis /R4 auswählen.`);
        if (/\/GN(?=\s|\/|$)/i.test(r.signal) && /\/G(?=\s|\/|$)/i.test(r.signal)) throw new Error(`Punkt ${n}: /GN und /G sind alternative Gruppenpositionen.`);
        if (/\/D=/i.test(r.signal) && !['FLOAT','DOUBLE'].includes(baseType)) throw new Error(`Punkt ${n}: /D= ist für FLOAT und DOUBLE dokumentiert.`);
        if (/\/M=/i.test(r.signal) && type!=='custom') throw new Error(`Punkt ${n}: /M= ist für MI/MO dokumentiert; TX-Kennungen prüfen.`);
        for (const prefix of ['D','M']) {
          if (!new RegExp('/'+prefix+'=', 'i').test(r.signal)) continue;
          const matches = [...String(r.signal).matchAll(new RegExp('/'+prefix+'=([^\\s/]+)', 'gi'))];
          if (matches.length !== 1) throw new Error(`Punkt ${n}: /${prefix}= benötigt genau einen Wert.`);
          const value = Number(matches[0][1].replace(',','.'));
          if (!Number.isFinite(value) || (prefix === 'D' && value === 0)) throw new Error(`Punkt ${n}: Ungültiger Wert für /${prefix}=`);
        }
        const feedback = /\/F(?=\s|\/|$)/i.test(r.signal);
        const feedbackPair = feedback && type === 'AI' && [6,16].includes(fc) && rows.some(other =>
          other !== r && txType(other) === 'AO' && Number(other.fc) === fc && Number(other.address) === address && /\/F(?=\s|\/|$)/i.test(other.signal));
        const mismatch = type!=='custom' && ((['AI','BI'].includes(type) && fc>4 && !feedbackPair) || (['AO','BO'].includes(type) && fc<5));
        if (mismatch && !$('#txAllowMismatch').checked) throw new Error(`Punkt ${n}: TX-Typ ${type} und Funktionscode ${fc} prüfen. Für bewusst abweichende Vorlagen die Bestätigung aktivieren.`);
      }
    }
    function makeIoopt() {
      collectDetail();
      const rows=state.rows.filter(r=>r.selected); checkSelected(rows);
      const doc=state.source ? state.source.cloneNode(true) : baseDoc(), bus=doc.getElementsByTagName('ThirdBus')[0], device=doc.getElementsByTagName('ThirdDevice')[0];
      const setOptional = (el, key, value, preserveAbsent) => {
        if (preserveAbsent && !el.hasAttribute(key) && value === '') return;
        el.setAttribute(key, value);
      };
      setOptional(bus,'ProtAppName',$('#txProtocol').value.trim(),Boolean(state.source));
      bus.setAttribute('BusType',$('#txBus').value);
      setOptional(bus,'BusCommSettings',$('#txBusComm').value.trim(),Boolean(state.source));
      setOptional(device,'DevCommSettings',$('#txComm').value.trim(),Boolean(state.source));
      setOptional(device,'FunctionName',$('#txFunction').value.trim(),Boolean(state.source));
      setOptional(device,'DevDesc',$('#txDeviceDesc').value.trim(),Boolean(state.source));
      if (!state.source) device.setAttribute('DevName',$('#txFunction').value.trim() || 'Registerwerk');
      if ($('#txAnonymize').checked) {
        [...doc.getElementsByTagName('DocumentSourceIdentifier')].forEach(e=>e.remove());
        for (const n of ['DocumentCreated','DocumentLastModified']) for (const e of doc.getElementsByTagName(n)) e.removeAttribute('User');
        device.setAttribute('DevName', $('#txFunction').value.trim() || 'Registerwerk');
      }
      [...device.children].filter(e=>e.localName==='ThirdIo').forEach(e=>e.remove());
      rows.forEach((r,i) => {
        const el=r.original ? doc.importNode(r.original,true) : doc.createElement('ThirdIo');
        const nameMode=$('#txNames').value;
        const name=nameMode==='blank'?'':nameMode==='neutral'?`DP_${String(i+1).padStart(3,'0')}`:r.name;
        const description=$('#txDescriptions').checked?r.desc:'', unit=$('#txUnits').checked?r.unit:'';
        const values={IoName:name,IoDesc:description,IoResourceType:r.resource,IoSignalType:r.systemType,IoUnit:unit,ObjectTag:r.objectTag,ThirdSignalType:r.signal,ThirdDefaultValue:r.def,ThirdRangeLow:r.low,ThirdRangeHigh:r.high,ThirdConversionSet:[r.fc,r.address,r.mi3,r.mi4].join(';')};
        for (const [key,value] of Object.entries(values)) setOptional(el,key,String(value ?? ''),Boolean(r.original));
        if (!$('#txRanges').checked) for (const key of ['ThirdDefaultValue','ThirdRangeLow','ThirdRangeHigh']) el.removeAttribute(key);
        // Veraltete Textreferenzen dürfen nicht auf geänderte Felder zeigen.
        const refs = [['NameRef',name!==r.originalName],['DescRef',description!==r.originalDesc],['UnitRef',unit!==r.originalUnit]];
        for (const [ref,changed] of refs) if (r.original && changed) for (const p of [...el.getElementsByTagName('ThirdIoPar')]) if (p.getAttribute('P1Name')===ref) p.remove();
        if (!r.original && !el.getElementsByTagName('ThirdIoParams').length) el.appendChild(doc.createElement('ThirdIoParams'));
        device.appendChild(el);
      });
      const serialized = new XMLSerializer().serializeToString(doc).replace(/^\s*<\?xml[^?]*\?>\s*/i, '');
      return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialized;
    }
    $('#txMenuToggle').onclick=()=>{const m=$('#txMenu');m.hidden=!m.hidden;$('#txMenuToggle').setAttribute('aria-expanded',String(!m.hidden));};
    document.addEventListener('pointerdown', e=>{if (!menu.contains(e.target)) {$('#txMenu').hidden=true;$('#txMenuToggle').setAttribute('aria-expanded','false');}});
    $('#txOpenExport').onclick=()=>{ $('#txMenu').hidden=true; if (!state.loaded && app.points.length) fromProject(); showEditor(); };
    $('#txLoadFile').onclick=()=>{ $('#txMenu').hidden=true; $('#txFile').click(); };
    $('#txFile').onchange=async(e)=>{ try {const file=e.target.files?.[0]; if(!file)return; if(file.size>2_000_000)throw new Error('Die Datei ist größer als 2 MB.'); const parsed=readIoopt(await file.text()); if(state.rows.length && !confirm('Die bisherige TX-Auswahl durch die geladene Vorlage ersetzen?'))return; state.rows=parsed.rows; state.source=parsed.doc; state.loaded=true; state.current=null; resetExportChoices(true); $('#txFunction').value=parsed.functionName; $('#txDeviceDesc').value=parsed.description; $('#txProtocol').value=parsed.protocol; const busSelect=$('#txBus');if (![...busSelect.options].some(x=>x.value===parsed.busType)) busSelect.add(new Option(parsed.busType,parsed.busType));busSelect.value=parsed.busType; $('#txBusComm').value=parsed.busComm; $('#txComm').value=parsed.comm; $('#txDetails').classList.add('hidden'); $('#txStatus').textContent='IOOPT geladen · Datenpunkte auswählen und bearbeiten.'; showEditor();}catch(ex){showEditor();error(ex.message);}finally{e.target.value='';}};
    $('#txClose').onclick=()=>{collectDetail();$('#txEditor').classList.remove('show');};
    $('#txDetailClose').onclick=()=>{collectDetail();state.current=null;$('#txDetails').classList.add('hidden');listRows();};
    $('#txFromProject').onclick=fromProject;
    $('#txSelectAll').onclick=()=>{state.rows.forEach(r=>r.selected=true);listRows();};
    $('#txSelectNone').onclick=()=>{state.rows.forEach(r=>r.selected=false);listRows();};
    $('#txRemove').onclick=()=>{collectDetail();const count=state.rows.filter(r=>r.selected).length;if(!count){error('Bitte Datenpunkte auswählen.');return;}if(!confirm(`${count} ausgewählte Datenpunkte aus der TX-Vorlage entfernen?`))return;state.rows=state.rows.filter(r=>!r.selected);state.current=null;$('#txDetails').classList.add('hidden');listRows();error();};
    $('#txAdd').onclick=()=>{collectDetail();state.rows.push({selected:true,name:`DP_${String(state.rows.length+1).padStart(3,'0')}`,desc:'',device:null,resource:'1',systemType:'93',objectTag:'1',unit:'',fc:'3',address:'0',mi3:'0',mi4:'0',signal:'UINT16',def:'0',low:'0',high:'',warning:'',reviewed:false,original:null});state.loaded=true;listRows();setDetail(state.rows.length-1);$('#txDetails').scrollIntoView({block:'nearest'});};
    $('#txRows').onchange=e=>{if(e.target.matches('.tx-check')) {state.rows[Number(e.target.dataset.i)].selected=e.target.checked;const count=state.rows.filter(r=>r.selected).length;$('#txCount').textContent=`${count} von ${state.rows.length} Datenpunkten ausgewählt`;}};
    $('#txRows').onclick=e=>{const b=e.target.closest('.tx-edit');if(!b)return;collectDetail();listRows();setDetail(Number(b.dataset.i));$('#txDetails').scrollIntoView({block:'nearest'});};
    for (const id of Object.values(controls)) $('#'+id).addEventListener('input',()=>{collectDetail();listRows();});
    $('#txMi3').addEventListener('input', updateMi4Labels);
    for (const id of ['txFc','txMi4']) $('#'+id).addEventListener('change',()=>{collectDetail();listRows();});
    $('#txReviewed').onchange=()=>{collectDetail();};
    $('#txKind').onchange=()=>{const k=$('#txKind').value;if(kinds[k]) {[$('#txResource').value,$('#txSystemType').value,$('#txObjectTag').value]=kinds[k];}collectDetail();listRows();};
    function bulk(add) {
      collectDetail();const options=$$('#txBulkOptions input[type="checkbox"]:checked').map(x=>x.value), rows=state.rows.filter(r=>r.selected);if(!rows.length){error('Bitte mindestens einen Datenpunkt auswählen.');return;}if(!options.length){error('Bitte mindestens einen Zusatz auswählen.');return;}
      if(add && options.filter(x=>['/R1','/R2','/R3','/R4'].includes(x)).length>1){error('Bitte nur ein Schreibintervall /R1 bis /R4 auswählen.');return;}
      if(add && options.includes('/G') && options.includes('/GN')){error('Bitte /G oder /GN auswählen.');return;}
      if(add) for(const option of options.filter(x=>x==='/D='||x==='/M=')){const value=$(option==='/D='?'#txBulkD':'#txBulkM').value.trim(), num=Number(value.replace(',','.'));if(!value || !Number.isFinite(num) || (option==='/D=' && num===0)){error(option+' benötigt einen gültigen Wert'+(option==='/D='?' ungleich 0.':'.'));return;}}
      for(const r of rows){let signal=r.signal;for(const option of options){const parameter=option==='/D='||option==='/M=', escaped=option.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), re=new RegExp(escaped+(parameter?'[^\\s/]+':'(?=\\s|/|$)'),'gi');signal=signal.replace(re,'').replace(/\s+/g,' ').trim();if(add) signal += ' '+option+(parameter?$(option==='/D='?'#txBulkD':'#txBulkM').value.trim():'');}r.signal=signal.trim();}
      if(state.current!=null)setDetail(state.current);listRows();error();
    }
    $('#txApplyOption').onclick=()=>bulk(true); $('#txRemoveOption').onclick=()=>bulk(false);
    $('#txExport').onclick=async()=>{try{error();if ($('#txNames').value==='blank' && !confirm('Leere I/O-Namen: Der Import im TX Open Tool ist noch nicht bestätigt. Trotzdem exportieren?')) return; const xml=makeIoopt(), filename=($('#txFunction').value.trim() || 'Registerwerk_TXI2').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')+'.ioopt', blob=new Blob([xml],{type:'application/xml'}); if (!window.registerwerkDesktop && typeof window.showSaveFilePicker==='function') {const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'TX Open Punktvorlage',accept:{'application/xml':['.ioopt']}}]}); const out=await handle.createWritable();await out.write(blob);await out.close();$('#txStatus').textContent='Vorlage gespeichert. Anschließend im TX Open Tool prüfen.';} else {const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000);$('#txStatus').textContent='Speichern gestartet. Die Vorlage anschließend im TX Open Tool prüfen.';}}catch(e){if(e.name!=='AbortError')error(e.message);}};
  })();

})();


