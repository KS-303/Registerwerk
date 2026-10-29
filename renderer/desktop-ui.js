(() => {
  'use strict';
  const bridge = window.registerwerkDesktop;
  if (!bridge) return;
  document.querySelector('.brand p').textContent = 'Modbus RTU · Modbus TCP · Ethernet-RTU';
  document.querySelector('#help-connection > p').textContent = 'Die Windows-App unterstützt USB-RS485 (RTU), Modbus TCP direkt zum Gerät und transparente Ethernet-RTU-Brücken wie den Waveshare RS485 TO ETH.';
  document.querySelector('.help-steps li:nth-child(4) p').textContent = 'Bei RTU den USB-RS485-Port auswählen. Bei Modbus TCP oder Ethernet-RTU die IP-Adresse und den Port eintragen. Es wird kein COM-Port automatisch ausgewählt.';
  const veil = document.createElement('div');
  veil.className = 'veil';
  veil.id = 'desktopPortDialog';
  veil.innerHTML = '<div class="dialog port-dialog" role="dialog" aria-modal="true" aria-labelledby="desktopPortTitle"><h3 id="desktopPortTitle">COM-Port auswählen</h3><p>Den Adapter wählen, an dem der Modbus-Bus angeschlossen ist.</p><div class="port-list" id="desktopPortList" role="radiogroup" aria-label="Serielle Ports"></div><p class="hint" id="desktopPortHint" role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn" id="desktopPortCancel" type="button">Abbrechen</button><button class="btn primary" id="desktopPortConnect" type="button" disabled>Verbinden</button></div></div>';
  document.body.appendChild(veil);
  const list = veil.querySelector('#desktopPortList'), connect = veil.querySelector('#desktopPortConnect'),
    cancel = veil.querySelector('#desktopPortCancel'), hint = veil.querySelector('#desktopPortHint');
  let active = null, selected = '', returnFocus = null, sending = false;
  const hide = () => {
    veil.classList.remove('show');
    active = null; selected = ''; sending = false;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  };
  const choose = async (portId) => {
    if (!active || sending) return;
    const requestId = active.requestId;
    sending = true;
    connect.disabled = cancel.disabled = true;
    try {
      const result = await bridge.selectPort(requestId, portId);
      if (!result.ok && active?.requestId === requestId) {
        hint.textContent = 'Die Auswahl ist nicht mehr verfügbar. Port erneut auswählen.';
        sending = false; cancel.disabled = false; connect.disabled = !selected;
      }
    } catch {
      hint.textContent = 'Portauswahl fehlgeschlagen. Auswahl abbrechen und erneut versuchen.';
      sending = false; cancel.disabled = false; connect.disabled = !selected;
    }
  };
  bridge.onPorts((payload) => {
    if (!payload) { hide(); return; }
    const opened = !active || active.requestId !== payload.requestId;
    const focusedId = document.activeElement?.dataset?.portId;
    const focusInList = list.contains(document.activeElement);
    if (opened) { returnFocus = document.activeElement; selected = ''; sending = false; }
    active = payload;
    if (!payload.ports.some((port) => port.portId === selected)) selected = '';
    list.replaceChildren();
    for (const port of payload.ports) {
      const label = document.createElement('label'); label.className = 'port-option';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'registerwerk-port';
      radio.value = port.portId; radio.dataset.portId = port.portId; radio.checked = selected === port.portId;
      const text = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = port.portName || port.displayName || 'Serieller Port';
      const sub = document.createElement('small');
      sub.textContent = [port.displayName, port.vendorId ? 'USB ' + port.vendorId + ':' + port.productId : ''].filter(Boolean).join(' · ');
      text.append(title, sub); label.append(radio, text); list.append(label);
      radio.addEventListener('change', () => { selected = radio.value; connect.disabled = sending; });
    }
    connect.disabled = sending || !selected; cancel.disabled = sending;
    hint.textContent = payload.ports.length ? 'Angeschlossene oder entfernte Adapter werden während der Auswahl aktualisiert.' : 'Kein serieller Port gefunden. Adapter anschließen und gegebenenfalls Treiber prüfen. Die Liste aktualisiert sich automatisch.';
    veil.classList.add('show');
    if (opened) cancel.focus();
    else if (focusInList) {
      const radio = [...list.querySelectorAll('input')].find((item) => item.dataset.portId === focusedId);
      (radio || cancel).focus();
    }
  });
  cancel.addEventListener('click', () => choose(''));
  connect.addEventListener('click', () => { if (selected) choose(selected); });
  veil.addEventListener('click', (event) => { if (event.target === veil) choose(''); });
  document.addEventListener('keydown', (event) => {
    if (!veil.classList.contains('show')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); choose('');
    } else if (event.key === 'F1') {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
})();

(() => {
  'use strict';
  const bridge = window.registerwerkDesktop;
  if (!bridge?.update) return;
  const version = document.createElement('span');
  version.id = 'desktopVersion'; version.className = 'hint';
  version.style.color = '#c2d3dc';
  document.querySelector('.brand').appendChild(version);
  const open = document.createElement('button');
  open.id = 'openUpdates'; open.type = 'button'; open.className = 'btn dark'; open.textContent = 'Updates';
  document.querySelector('.head-actions').prepend(open);
  const veil = document.createElement('div'); veil.id = 'updateDialog'; veil.className = 'veil';
  veil.innerHTML = '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="updateTitle"><h3 id="updateTitle">Versionsupdates</h3><p id="updateVersion"></p><p id="updateMessage" role="status" aria-live="polite"></p><progress id="updateProgress" max="100" value="0" style="width:100%;margin-bottom:14px" hidden></progress><p class="hint">Updates werden nicht ungefragt installiert. Vor der Installation Geräteverbindung trennen und Eingaben prüfen.</p><div class="dialog-actions" style="flex-wrap:wrap;margin-top:16px"><button id="updateClose" class="btn" type="button">Schließen</button><button id="updateReleases" class="btn" type="button">GitHub Releases</button><button id="updateCheck" class="btn primary" type="button">Nach Updates suchen</button><button id="updateDownload" class="btn primary" type="button" hidden>Update herunterladen</button><button id="updateInstall" class="btn primary" type="button" hidden>Jetzt installieren</button></div></div>';
  document.body.appendChild(veil);
  const $ = (id) => document.getElementById(id);
  const render = (state) => {
    if (!state?.version) return;
    version.textContent = 'Version ' + state.version;
    $('updateVersion').textContent = 'Installiert: ' + state.version + (state.availableVersion ? ' · Verfügbar: ' + state.availableVersion : '');
    $('updateMessage').textContent = state.message;
    $('updateCheck').disabled = !state.supported || ['checking', 'downloading', 'ready', 'installing'].includes(state.phase);
    $('updateDownload').hidden = state.phase !== 'available';
    $('updateInstall').hidden = !['ready', 'installing'].includes(state.phase);
    $('updateInstall').disabled = state.phase === 'installing';
    $('updateProgress').hidden = state.phase !== 'downloading';
    $('updateProgress').value = state.percent;
    const updateAvailable = Boolean(state.availableVersion);
    open.textContent = updateAvailable ? 'Update verfügbar' : 'Updates';
    open.classList.toggle('update-available', updateAvailable);
    open.title = updateAvailable ? 'Version ' + state.availableVersion + ' herunterladen' : 'Versionsupdates';
  };
  const action = async (name) => {
    try { render(await bridge.update(name)); }
    catch (error) { $('updateMessage').textContent = 'Update-Funktion nicht erreichbar: ' + error.message; }
  };
  bridge.onUpdate(render);
  action('state');
  const close = () => { veil.classList.remove('show'); open.focus(); };
  open.addEventListener('click', () => { veil.classList.add('show'); $('updateClose').focus(); action('state'); });
  $('updateClose').addEventListener('click', close);
  $('updateCheck').addEventListener('click', () => action('check'));
  $('updateDownload').addEventListener('click', () => action('download'));
  $('updateInstall').addEventListener('click', () => action('install'));
  $('updateReleases').addEventListener('click', () => action('releases'));
  veil.addEventListener('click', (event) => { if (event.target === veil) close(); });
  document.addEventListener('keydown', (event) => {
    if (!veil.classList.contains('show')) return;
    if (event.key === 'F1' || event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') close();
    }
  }, true);
})();
